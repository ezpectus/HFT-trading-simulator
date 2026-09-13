"""Signal publisher — WebSocket server that broadcasts AI signals to HFT Trade Bot.

Runs on port 8766. The HFT Trade Bot connects as a client and receives
validated trading signals in real-time. Also supports backtest execution
requests from the Web UI.

Protocol:
  → {"type": "signal", "symbol": "BTC/USDT", "direction": "LONG", ...}
  → {"type": "signal_history", "signals": [...]}
  → {"type": "market_regime", "symbol": ..., "regime": ...}
  → {"type": "circuit_breaker_status", "state": "CLOSED", "consecutive_failures": 0, ...}
  → {"type": "backtest_result", "results": {...}}
  ← {"type": "subscribe", "client": "hft_trade_bot"}
  ← {"type": "run_backtest", "strategy": "trend", "candles": 500, ...}
"""
import asyncio
import json
import os
import secrets
import time
from collections import deque
from typing import TYPE_CHECKING

import websockets

from src.observability.logging import get_logger

try:
    import orjson
    _HAS_ORJSON = True
except ImportError:
    _HAS_ORJSON = False

from src.communication.analysis_requests import (
    cvar_analysis_request,
    funding_arb_scan_request,
    hawkes_fit_request,
    position_size_request,
    stress_test_request,
)
from src.communication.backtest_requests import (
    compare_backtests_request,
    run_backtest_request,
)
from src.communication.circuit_breaker import CircuitBreaker
from src.communication.metrics_server import MetricsCollector
from src.communication.portfolio_requests import (
    optimize_portfolio_request,
    vol_surface_request,
)

if TYPE_CHECKING:
    pass

logger = get_logger("ai_signal_bot.signal_publisher")



class SignalPublisher:
    """WebSocket server broadcasting AI signals to connected HFT clients."""

    def __init__(self, host: str = "0.0.0.0", port: int = 8766, ssl: object = None, auth_token: str = "", max_clients: int = 50):  # nosec: B104
        self.host = host
        self.port = port
        self._ssl = ssl
        self._auth_token = auth_token
        self._max_clients = max_clients
        self._clients: set = set()
        self._signal_history: deque = deque(maxlen=100)
        self._max_history = 100
        self._server: websockets.WebSocketServer | None = None
        self._running = False
        # Optional live-data source (ExchangeClient) for handlers that can
        # fall back to server-side state, e.g. funding_arb_scan.
        self.data_source = None
        self.circuit_breaker = CircuitBreaker()
        self.metrics = MetricsCollector()
        # Per-client sliding window for expensive compute endpoints — without
        # it one client can CPU-DoS the whole bot by spamming run_backtest
        # & friends. AI_BOT_COMPUTE_RATE_LIMIT = max compute msgs/min/client.
        self._compute_rate_limit = int(os.environ.get("AI_BOT_COMPUTE_RATE_LIMIT", "30"))
        self._compute_windows: dict = {}
        self._cb_broadcast_task: asyncio.Task | None = None
        self._state_lock = asyncio.Lock()

    @property
    def client_count(self) -> int:
        return len(self._clients)

    @property
    def signals_sent(self) -> int:
        return len(self._signal_history)

    async def start(self) -> None:
        """Start the WebSocket server."""
        serve_kwargs = dict(
            ping_interval=10,
            ping_timeout=30,
        )
        if self._ssl is not None:
            serve_kwargs["ssl"] = self._ssl
        self._server = await websockets.serve(
            self._handle_client,
            self.host,
            self.port,
            **serve_kwargs,
        )
        self._running = True
        scheme = "wss" if self._ssl else "ws"
        logger.info("Signal publisher started on %s://%s:%s", scheme, self.host, self.port)
        if not self._auth_token:
            logger.warning(
                "AI_BOT_AUTH_TOKEN unset — :%s accepts any client (signals, "
                "history-on-connect, compute endpoints are open). Set the env "
                "var or api.auth_token for real deployments.",
                self.port,
            )

        self._cb_broadcast_task = asyncio.create_task(self._broadcast_circuit_breaker_status())

    async def stop(self) -> None:
        """Stop the server."""
        self._running = False
        if self._cb_broadcast_task:
            self._cb_broadcast_task.cancel()
            try:
                await self._cb_broadcast_task
            except asyncio.CancelledError:
                pass
        if self._server:
            self._server.close()
            await self._server.wait_closed()
        logger.info("Signal publisher stopped")

    async def _handle_client(self, websocket, path=None) -> None:
        """Handle a connected HFT client."""
        # Authenticate client if auth_token is set
        if self._auth_token:
            try:
                raw = await asyncio.wait_for(websocket.recv(), timeout=10.0)
                data = json.loads(raw)
                if data.get("type") == "auth" and secrets.compare_digest(
                        str(data.get("token", "")), self._auth_token):
                    await websocket.send(json.dumps({"type": "auth_ok"}, separators=(',', ':')))
                else:
                    await websocket.send(json.dumps({"type": "auth_failed"}, separators=(',', ':')))
                    await websocket.close()
                    return
            except (asyncio.TimeoutError, json.JSONDecodeError, websockets.ConnectionClosed):
                logger.warning("Client auth timeout or invalid — disconnecting")
                await websocket.close()
                return

        async with self._state_lock:
            if len(self._clients) >= self._max_clients:
                logger.warning("Max clients (%s) reached — rejecting new connection", self._max_clients)
                await websocket.close(code=1013, reason="Max clients reached")
                return
            self._clients.add(websocket)
            self.metrics.set_ws_clients(len(self._clients))
        remote = websocket.remote_address if hasattr(websocket, "remote_address") else "unknown"
        logger.info("HFT client connected: %s (total: %s)", remote, len(self._clients))

        # Send signal history on connect
        if self._signal_history:
            try:
                hist_data = {
                    "type": "signal_history",
                    "signals": list(self._signal_history)[-20:],
                    "count": len(self._signal_history),
                }
                msg = orjson.dumps(hist_data) if _HAS_ORJSON else json.dumps(hist_data, separators=(',', ':'))
                await websocket.send(msg)
            except (ConnectionError, OSError, RuntimeError) as e:
                logger.warning("Failed to send signal history: %s", e)

        # Send current circuit breaker status on connect
        try:
            cb_data = {
                "type": "circuit_breaker_status",
                **self.circuit_breaker.get_status(),
                "timestamp": int(time.time()),
            }
            msg = orjson.dumps(cb_data) if _HAS_ORJSON else json.dumps(cb_data, separators=(',', ':'))
            await websocket.send(msg)
        except (ConnectionError, OSError, RuntimeError) as e:
            logger.warning("Failed to send circuit breaker status: %s", e)

        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    if not isinstance(data, dict):
                        logger.warning("Invalid message from %s: expected JSON object", remote)
                        continue
                    msg_type = data.get("type")
                    if not isinstance(msg_type, str) or not msg_type:
                        logger.warning("Invalid message from %s: missing 'type' field", remote)
                        continue
                    _VALID_MSG_TYPES = {
                        "subscribe", "run_backtest", "compare_backtests",
                        "optimize_portfolio", "vol_surface", "auth", "ping",
                        "cvar_analysis", "stress_test", "position_size",
                        "hawkes_fit", "funding_arb_scan",
                    }
                    if msg_type not in _VALID_MSG_TYPES:
                        logger.warning("Unknown message type '%s' from %s", msg_type, remote)
                        continue
                    if msg_type in self._COMPUTE_MSG_TYPES and not self._allow_compute(websocket):
                        logger.warning("Compute rate limit exceeded for %s — dropping %s",
                                       remote, msg_type)
                        await websocket.send(json.dumps(
                            {"type": "error",
                             "message": f"rate limit: max {self._compute_rate_limit} "
                                        f"compute requests/min per client",
                             "request": msg_type},
                            separators=(',', ':')))
                        continue
                    if msg_type == "subscribe":
                        logger.info("Client subscribed: %s", data.get('client', 'unknown'))
                    elif msg_type == "auth":
                        # Post-handshake auth ping — if auth is required the
                        # client already passed the handshake above; if not,
                        # this confirms auth is disabled server-side.
                        await websocket.send(json.dumps(
                            {"type": "auth_ok", "required": bool(self._auth_token)},
                            separators=(',', ':')))
                    elif msg_type == "run_backtest":
                        result = await run_backtest_request(data)
                        if "error" not in result:
                            self.metrics.record_backtest()
                        await websocket.send(json.dumps(result, separators=(',', ':')))
                    elif msg_type == "compare_backtests":
                        result = compare_backtests_request(data)
                        await websocket.send(json.dumps(result, separators=(',', ':')))
                    elif msg_type == "optimize_portfolio":
                        result = await optimize_portfolio_request(data)
                        await websocket.send(json.dumps(result, separators=(',', ':')))
                    elif msg_type == "vol_surface":
                        result = await vol_surface_request(data)
                        await websocket.send(json.dumps(result, separators=(',', ':')))
                    elif msg_type == "cvar_analysis":
                        result = await cvar_analysis_request(data)
                        await websocket.send(json.dumps(result, separators=(',', ':')))
                    elif msg_type == "stress_test":
                        result = await stress_test_request(data)
                        await websocket.send(json.dumps(result, separators=(',', ':')))
                    elif msg_type == "position_size":
                        result = await position_size_request(data)
                        await websocket.send(json.dumps(result, separators=(',', ':')))
                    elif msg_type == "hawkes_fit":
                        result = await hawkes_fit_request(data)
                        await websocket.send(json.dumps(result, separators=(',', ':')))
                    elif msg_type == "funding_arb_scan":
                        result = await funding_arb_scan_request(data, exchange=self.data_source)
                        await websocket.send(json.dumps(result, separators=(',', ':')))
                except json.JSONDecodeError:
                    logger.warning("Invalid JSON from %s: %s", remote, message[:100])
        except websockets.ConnectionClosed:
            pass
        except (ConnectionError, OSError, RuntimeError) as e:
            logger.debug("Client handler error: %s", e)
        finally:
            self._compute_windows.pop(websocket, None)
            async with self._state_lock:
                self._clients.discard(websocket)
                self.metrics.set_ws_clients(len(self._clients))
            logger.info("HFT client disconnected (total: %s)", len(self._clients))

    # Compute endpoints share one sliding-window budget per client — they all
    # burn seconds-to-minutes of CPU.
    _COMPUTE_MSG_TYPES = frozenset({
        "run_backtest", "compare_backtests", "optimize_portfolio",
        "vol_surface", "cvar_analysis", "stress_test", "position_size",
        "hawkes_fit", "funding_arb_scan",
    })

    def _allow_compute(self, websocket) -> bool:
        """True if this client may run another compute request (sliding 60s)."""
        now = time.monotonic()
        window = self._compute_windows.setdefault(websocket, deque())
        while window and now - window[0] > 60.0:
            window.popleft()
        if len(window) >= self._compute_rate_limit:
            return False
        window.append(now)
        return True

    async def _broadcast_to_clients(self, msg: bytes | str) -> None:
        """Send a message to all connected clients, removing disconnected ones."""
        async with self._state_lock:
            if not self._clients:
                return
            clients = list(self._clients)
        disconnected = set()
        async def _send(ws):
            try:
                await asyncio.wait_for(ws.send(msg), timeout=5.0)
            except Exception:
                disconnected.add(ws)
        await asyncio.gather(*[_send(ws) for ws in clients], return_exceptions=True)
        if disconnected:
            async with self._state_lock:
                self._clients -= disconnected

    async def broadcast_signal(self, signal: dict) -> None:
        """Broadcast a trading signal to all connected HFT clients."""
        if not await self.circuit_breaker.allow_signal():
            logger.warning(
                f"Signal blocked by circuit breaker: {signal.get('direction', '?')} "
                f"{signal.get('symbol', '?')} (state={self.circuit_breaker.state.value})"
            )
            self.metrics.record_signal_blocked()
            return

        signal = dict(signal)  # copy to avoid mutating caller's dict
        signal["timestamp"] = int(time.time())
        async with self._state_lock:
            # Enforce max history size (allows _max_history to be changed after init)
            if len(self._signal_history) >= self._max_history:
                self._signal_history.popleft()
            self._signal_history.append(signal)
        self.metrics.record_signal_sent()

        if not self._clients:
            return

        if _HAS_ORJSON:
            msg = orjson.dumps({"type": "signal", **signal})
        else:
            msg = json.dumps({"type": "signal", **signal}, separators=(',', ':'))
        await self._broadcast_to_clients(msg)
        logger.info(
            f"Signal broadcast: {signal.get('direction', '?')} "
            f"{signal.get('symbol', '?')} "
            f"conf={signal.get('confidence', 0):.0f} "
            f"→ {len(self._clients)} clients"
        )

    async def broadcast_market_regime(self, symbol: str, regime: str,
                                       trend_score: float, cycle_strength: float) -> None:
        """Broadcast market regime update (from FFT analysis)."""
        if not self._clients:
            return

        if _HAS_ORJSON:
            msg = orjson.dumps({
                "type": "market_regime",
                "symbol": symbol,
                "regime": regime,
                "trend_score": round(trend_score, 3),
                "cycle_strength": round(cycle_strength, 3),
                "timestamp": int(time.time()),
            })
        else:
            msg = json.dumps({
                "type": "market_regime",
                "symbol": symbol,
                "regime": regime,
                "trend_score": round(trend_score, 3),
                "cycle_strength": round(cycle_strength, 3),
                "timestamp": int(time.time()),
            }, separators=(',', ':'))

        await self._broadcast_to_clients(msg)

    async def _broadcast_circuit_breaker_status(self) -> None:
        """Periodically broadcast circuit breaker status to all connected clients."""
        state_map = {"CLOSED": 0, "OPEN": 1, "HALF_OPEN": 2}
        while self._running:
            await asyncio.sleep(5)
            if not self._clients:
                continue

            status = self.circuit_breaker.get_status()
            state_val = state_map.get(status["state"], 0)
            self.metrics.set_circuit_breaker_state(state_val)

            if _HAS_ORJSON:
                msg = orjson.dumps({
                    "type": "circuit_breaker_status",
                    **status,
                    "timestamp": int(time.time()),
                })
            else:
                msg = json.dumps({
                    "type": "circuit_breaker_status",
                    **status,
                    "timestamp": int(time.time()),
                }, separators=(',', ':'))

            await self._broadcast_to_clients(msg)







