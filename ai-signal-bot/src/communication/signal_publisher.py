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
from src.observability.logging import get_logger
import math
import random
import time
from collections import deque
from typing import TYPE_CHECKING

import websockets

try:
    import orjson
    _HAS_ORJSON = True
except ImportError:
    _HAS_ORJSON = False

from src.communication.circuit_breaker import CircuitBreaker
from src.communication.metrics_server import MetricsCollector

if TYPE_CHECKING:
    from src.risk.risk_manager import RiskConfig

logger = get_logger("ai_signal_bot.signal_publisher")


class _EnsembleAdapter:
    """Adapter that makes EnsembleVoter compatible with Backtester's .analyze() interface."""

    def __init__(self, voter, sub_strategies: list):
        self.voter = voter
        self.sub_strategies = sub_strategies
        self.name = "ensemble"

    def analyze(self, symbol: str, candles: list):
        signals = [s.analyze(symbol, candles) for s in self.sub_strategies]
        return self.voter.vote(signals)


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
        self.circuit_breaker = CircuitBreaker()
        self.metrics = MetricsCollector()
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
                if data.get("type") == "auth" and data.get("token") == self._auth_token:
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
                    _VALID_MSG_TYPES = {"subscribe", "run_backtest", "compare_backtests", "auth", "ping"}
                    if msg_type not in _VALID_MSG_TYPES:
                        logger.warning("Unknown message type '%s' from %s", msg_type, remote)
                        continue
                    if msg_type == "subscribe":
                        logger.info("Client subscribed: %s", data.get('client', 'unknown'))
                    elif msg_type == "run_backtest":
                        result = await self._run_backtest(data)
                        await websocket.send(json.dumps(result, separators=(',', ':')))
                    elif msg_type == "compare_backtests":
                        result = self._compare_backtests(data)
                        await websocket.send(json.dumps(result, separators=(',', ':')))
                except json.JSONDecodeError:
                    logger.warning("Invalid JSON from %s: %s", remote, message[:100])
        except websockets.ConnectionClosed:
            pass
        except (ConnectionError, OSError, RuntimeError) as e:
            logger.debug("Client handler error: %s", e)
        finally:
            async with self._state_lock:
                self._clients.discard(websocket)
                self.metrics.set_ws_clients(len(self._clients))
            logger.info("HFT client disconnected (total: %s)", len(self._clients))

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
            except (ConnectionError, OSError, asyncio.TimeoutError):
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

    async def _run_backtest(self, params: dict) -> dict:
        """Run a backtest and return results as JSON."""
        from src.backtesting import Backtester

        bt_params = self._parse_backtest_params(params)
        candles = self._generate_synthetic_candles(
            bt_params["candles"], bt_params["initial_price"], bt_params["volatility"]
        )
        risk_config = self._build_risk_config(bt_params)
        bt = Backtester(
            initial_balance=bt_params["balance"],
            fee_pct=0.075, slippage_bps=2.0, risk_config=risk_config,
        )
        strategies = self._build_strategies(bt_params["strategy"])
        if not strategies:
            return {"type": "backtest_result", "error": f"Unknown strategy: {bt_params['strategy']}"}

        results = {}
        for name, strat in strategies.items():
            result = await asyncio.to_thread(bt.run, candles, strat, symbol=bt_params["symbol"], warmup=50)
            results[name] = result.to_dict()

        logger.info("Backtest completed: %s, %s candles, %s strategies", bt_params['strategy'], bt_params['candles'], len(results))
        self.metrics.record_backtest()

        return {
            "type": "backtest_result",
            "strategy": bt_params["strategy"],
            "symbol": bt_params["symbol"],
            "candles": bt_params["candles"],
            "results": results,
        }

    @staticmethod
    def _parse_backtest_params(params: dict) -> dict:
        """Parse and validate backtest parameters."""
        return {
            "candles": max(10, min(int(params.get("candles", 500)), 10000)),
            "balance": max(1.0, float(params.get("balance", 10000))),
            "symbol": str(params.get("symbol", "BTC/USDT"))[:32],
            "initial_price": max(0.01, float(params.get("initial_price", 65000))),
            "volatility": max(0.0, min(float(params.get("volatility", 0.75)), 5.0)),
            "strategy": str(params.get("strategy", "all"))[:32],
            "trailing_stop": bool(params.get("trailing_stop", False)),
            "breakeven": bool(params.get("breakeven", False)),
        }

    @staticmethod
    def _build_risk_config(bt_params: dict) -> "RiskConfig | None":
        """Build RiskConfig from backtest params if trailing/breakeven enabled."""
        from src.risk.risk_manager import RiskConfig
        if not (bt_params["trailing_stop"] or bt_params["breakeven"]):
            return None
        return RiskConfig(
            trailing_stop_enabled=bt_params["trailing_stop"],
            trailing_distance_pct=2.0,
            breakeven_enabled=bt_params["breakeven"],
            breakeven_trigger_pct=1.0,
        )

    @staticmethod
    def _generate_synthetic_candles(n_candles: int, initial_price: float, volatility: float) -> list[dict]:
        """Generate synthetic OHLCV candles using GBM."""
        rng = random.Random(42)
        candles = []
        price = initial_price
        tf = 300
        base_ts = 1704067200
        candles_per_year = 365 * 24 * 3600 / tf
        sigma = volatility / math.sqrt(candles_per_year)
        drift = 0.0001

        for i in range(n_candles):
            z = rng.gauss(0, 1)
            ret = drift + sigma * z
            new_price = price * math.exp(ret)
            open_p = price
            close_p = new_price
            wick = abs(close_p - open_p) * (0.5 + rng.random() * 0.5)
            high_p = max(open_p, close_p) + wick * rng.random()
            low_p = min(open_p, close_p) - wick * rng.random()
            volume = rng.uniform(50, 2000) * (1 + abs(ret) * 100)
            candles.append({
                "timestamp": base_ts + i * tf,
                "open": round(open_p, 2),
                "high": round(high_p, 2),
                "low": round(low_p, 2),
                "close": round(close_p, 2),
                "volume": round(volume, 2),
            })
            price = new_price
        return candles

    @staticmethod
    def _build_strategies(strategy_name: str) -> dict:
        """Build strategy instances based on name selection."""
        from src.strategies import (
            EnsembleVoter,
            FFTCycleStrategy,
            MeanReversionStrategy,
            TrendFollowingStrategy,
        )

        strategies = {}
        if strategy_name in ("trend", "all", "ensemble"):
            strategies["Trend Following"] = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=25)
        if strategy_name in ("mean_reversion", "all", "ensemble"):
            strategies["Mean Reversion"] = MeanReversionStrategy(rsi_oversold=30, rsi_overbought=70, bb_period=20, bb_std=2.0)
        if strategy_name in ("fft", "all", "ensemble"):
            strategies["FFT Cycle"] = FFTCycleStrategy(min_data=64)
        if strategy_name in ("ensemble", "all"):
            sub_strategies = [
                TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=25),
                MeanReversionStrategy(rsi_oversold=30, rsi_overbought=70, bb_period=20, bb_std=2.0),
                FFTCycleStrategy(min_data=64),
            ]
            strategies["Ensemble"] = _EnsembleAdapter(
                EnsembleVoter(mode="weighted", min_votes=2),
                sub_strategies,
            )
        return strategies

    def _compare_backtests(self, data: dict) -> dict:
        """Compare multiple saved backtests side-by-side."""
        from src.backtesting.backtest_comparison import BacktestComparison
        from src.backtesting.backtest_engine import BacktestResult

        backtests = data.get("backtests", [])
        if len(backtests) < 2:
            return {"type": "comparison_result", "error": "Need at least 2 backtests to compare"}

        comparison = BacktestComparison()
        for bt in backtests:
            name = bt.get("name", bt.get("label", "unknown"))
            results = bt.get("results", {})
            # Use the best strategy from each backtest for comparison
            if not results:
                continue
            best_name = max(results, key=lambda k: results[k].get("total_return_pct", -999))
            r = results[best_name]
            bt_result = BacktestResult(
                total_return_pct=r.get("total_return_pct", 0),
                sharpe_ratio=r.get("sharpe_ratio", 0),
                sortino_ratio=r.get("sortino_ratio", 0),
                calmar_ratio=r.get("calmar_ratio", 0),
                max_drawdown_pct=r.get("max_drawdown_pct", 0),
                win_rate=r.get("win_rate", 0),
                profit_factor=r.get("profit_factor", 0),
                total_trades=r.get("total_trades", 0),
                final_equity=r.get("final_balance", 0),
                equity_curve=r.get("equity_curve", []),
            )
            comparison.add(name, bt_result)

        if len(comparison.results) < 2:
            return {"type": "comparison_result", "error": "Need at least 2 valid backtests"}

        comp_result = comparison.compare()
        result_dict = comp_result.to_dict()
        result_dict["type"] = "comparison_result"
        result_dict["equity_curves"] = comp_result.equity_curves
        return result_dict
