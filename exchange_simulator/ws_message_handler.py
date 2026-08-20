"""Message handling mixin for ExchangeWebSocketServer.

Extracted from websocket_server.py for file-size compliance.
Handles incoming client messages: orders, subscriptions, replay controls,
trading state, config updates, and options chain requests.
"""
from __future__ import annotations

import json
import time

import websockets

from exchange_simulator.models import OrderType, Side
from exchange_simulator.ws_constants import (
    _HAS_MSGPACK,
    PROTOCOL_VERSION,
    WebSocketServerConnection,
    _sanitize_log,
    logger,
)

try:
    import msgpack
except ImportError:
    msgpack = None

try:
    import orjson
except ImportError:
    orjson = None


class MessageHandlerMixin:
    """Mixin providing client message handling for ExchangeWebSocketServer."""

    def _check_rate_limit(self, websocket: WebSocketServerConnection) -> bool:
        """Check if client is within rate limits (Phase 1.5)."""
        now = time.time()
        if websocket not in self._client_message_counts:
            self._client_message_counts[websocket] = {"count": 0, "window_start": now}
            return True

        counts = self._client_message_counts[websocket]
        if now - counts["window_start"] >= self._rate_limit_window:
            counts["count"] = 0
            counts["window_start"] = now
            return True

        if counts["count"] >= self._rate_limit_max:
            logger.warning(f"Rate limit exceeded for {websocket.remote_address}")
            return False

        counts["count"] += 1
        return True

    async def _handle_client(
        self, websocket: WebSocketServerConnection
    ) -> None:
        """Handle a connected client — receive orders, send market data."""
        self.clients.add(websocket)
        self._total_connections += 1
        self._client_subscriptions[websocket] = set(self.market.symbols)
        self._client_message_counts[websocket] = {"count": 0, "window_start": time.time()}
        remote = websocket.remote_address
        logger.info(f"Client connected: {remote}")

        try:
            await self._send_json(websocket, {
                "type": "welcome",
                "protocol_version": PROTOCOL_VERSION,
                "server": "exchange_simulator",
                "trading_active": self._trading_active,
            })
            await self._send_market_snapshot(websocket)

            async for message in websocket:
                await self._process_message(websocket, message, remote)

        except websockets.ConnectionClosed:
            pass
        finally:
            self._cleanup_client(websocket, remote)

    async def _process_message(self, websocket, message, remote) -> None:
        """Parse and dispatch a single client message."""
        try:
            if not self._check_rate_limit(websocket):
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "Rate limit exceeded — too many messages",
                }))
                return

            data = self._parse_message(message, remote)
            if data is None:
                return
            await self._handle_message(websocket, data)
        except (RuntimeError, OSError, KeyError, ValueError, TypeError) as e:
            logger.error(f"Error handling message: {e}")

    def _parse_message(self, message, remote) -> dict | None:
        """Parse a message from bytes or str. Returns parsed dict or None."""
        if isinstance(message, bytes) and _HAS_MSGPACK:
            try:
                return msgpack.unpackb(message, raw=False)
            except (msgpack.exceptions.UnpackException, ValueError):
                logger.warning(f"Invalid msgpack from {_sanitize_log(remote)}: {_sanitize_log(message[:100])}")
                return None
        else:
            try:
                return json.loads(message)
            except (json.JSONDecodeError, TypeError):
                logger.warning(f"Invalid JSON from {_sanitize_log(remote)}: {_sanitize_log(message[:100])}")
                return None

    def _cleanup_client(self, websocket, remote) -> None:
        """Clean up client state on disconnect."""
        self.clients.discard(websocket)
        self._client_versions.pop(websocket, None)
        self._client_encodings.pop(websocket, None)
        self._client_subscriptions.pop(websocket, None)
        self._client_message_counts.pop(websocket, None)
        self._total_disconnections += 1
        logger.info(f"Client disconnected: {remote}")

    async def _handle_message(
        self, websocket: WebSocketServerConnection, data: dict
    ) -> None:
        """Handle incoming message from a bot."""
        msg_type = data.get("type")

        if msg_type == "order":
            await self._handle_order(websocket, data)
        elif msg_type == "subscribe":
            await self._handle_subscribe(websocket, data)
        elif msg_type == "unsubscribe":
            await self._handle_unsubscribe(websocket, data)
        elif msg_type == "ping":
            await websocket.send(json.dumps({"type": "pong"}))
        elif msg_type == "sync_state":
            last_ts = data.get("last_timestamp", 0)
            await self._send_sync_state(websocket, last_ts)
        elif msg_type == "set_speed":
            self._handle_set_speed(websocket, data)
        elif msg_type == "replay":
            await self._handle_replay(websocket, data)
        elif msg_type == "close_position":
            await self._handle_close_position(websocket, data)
        elif msg_type == "start_trading":
            await self._handle_trading_state(websocket, True)
        elif msg_type == "stop_trading":
            await self._handle_trading_state(websocket, False)
        elif msg_type == "update_config":
            self._handle_update_config(websocket, data)
        elif msg_type == "options_chain":
            await self._handle_options_chain(websocket, data)

    async def _handle_order(self, websocket: WebSocketServerConnection, data: dict) -> None:
        """Handle order submission from a bot."""
        if not self._trading_active:
            await websocket.send(json.dumps({
                "type": "error",
                "message": "Trading is stopped — send start_trading to enable orders",
            }))
            return
        exchange_id = data.get("exchange", "binance")
        exchange = self.exchanges.get(exchange_id)
        if not exchange:
            await websocket.send(json.dumps({
                "type": "error",
                "message": f"Unknown exchange: {exchange_id}",
            }))
            return

        missing = [f for f in ("symbol", "side", "quantity") if f not in data]
        if missing:
            await websocket.send(json.dumps({
                "type": "error",
                "message": f"Missing required order fields: {missing}",
            }))
            return

        order = await self._submit_exchange_order(websocket, exchange, data)
        if order is None:
            return

        self._log_order_result(order, data, exchange_id)
        fill_msg = json.dumps({"type": "fill", "order": order.to_dict()})
        await websocket.send(fill_msg)
        await self._broadcast_to_clients(fill_msg, exclude=websocket)

    async def _submit_exchange_order(self, websocket, exchange, data: dict):
        """Submit order to exchange and return result or None on error."""
        try:
            return exchange.submit_order(
                symbol=data["symbol"],
                side=Side(data["side"]),
                quantity=float(data["quantity"]),
                order_type=OrderType(data.get("order_type", "MARKET")),
                price=data.get("price"),
                stop_loss=data.get("stop_loss"),
                take_profit=data.get("take_profit"),
            )
        except (ValueError, KeyError) as e:
            await websocket.send(json.dumps({
                "type": "error",
                "message": f"Invalid order parameters: {e}",
            }))
            return None

    def _log_order_result(self, order, data: dict, exchange_id: str) -> None:
        """Log order fill or rejection and record trade."""
        if order.status.value == "FILLED":
            logger.info(
                f"  ORDER FILLED: {_sanitize_log(data['side'])} {float(data['quantity']):.4f} "
                f"{_sanitize_log(data['symbol'])} @ {order.filled_price:.2f} "
                f"fee={order.fee:.4f} | {_sanitize_log(exchange_id)}"
            )
            self.trade_logger.log_fill({
                "timestamp": time.time(),
                "exchange": exchange_id,
                "symbol": data["symbol"],
                "side": data["side"],
                "type": data.get("order_type", "MARKET"),
                "price": order.filled_price,
                "quantity": order.filled_quantity,
                "fee": order.fee,
                "order_id": order.id,
                "status": "FILLED",
            })
        elif order.status.value == "REJECTED":
            reason = order.rejection_reason or "UNKNOWN"
            logger.info(
                f"  ORDER REJECTED: {_sanitize_log(data['side'])} {_sanitize_log(data['symbol'])} "
                f"qty={_sanitize_log(str(data['quantity']))} | {_sanitize_log(exchange_id)} | {_sanitize_log(reason)}"
            )

    async def _handle_subscribe(self, websocket: WebSocketServerConnection, data: dict) -> None:
        """Handle subscription request from a client."""
        client_ver = data.get("protocol_version", 1)
        self._client_versions[websocket] = client_ver
        encoding = data.get("encoding", "json")
        if encoding == "msgpack" and not _HAS_MSGPACK:
            encoding = "json"
            logger.warning(f"Client {_sanitize_log(websocket.remote_address)} requested msgpack but not installed — falling back to JSON")
        self._client_encodings[websocket] = encoding

        symbols = data.get("symbols")
        if symbols:
            if isinstance(symbols, list):
                self._client_subscriptions[websocket] = set(symbols)
            else:
                self._client_subscriptions[websocket] = set(self.market.symbols)
            logger.info(f"Client {_sanitize_log(websocket.remote_address)} subscribed to {len(self._client_subscriptions[websocket])} symbols")

        logger.info(f"Client {_sanitize_log(websocket.remote_address)} subscribed (protocol v{_sanitize_log(client_ver)}, encoding={_sanitize_log(encoding)})")
        await self._send_market_snapshot(websocket)

    async def _handle_unsubscribe(self, websocket: WebSocketServerConnection, data: dict) -> None:
        """Handle unsubscribe request from a client."""
        symbols = data.get("symbols", [])
        if not symbols:
            logger.warning(f"Unsubscribe from {_sanitize_log(websocket.remote_address)} — no symbols specified")
            return
        current_subs = self._client_subscriptions.get(websocket, set())
        current_subs -= set(symbols)
        self._client_subscriptions[websocket] = current_subs
        logger.info(
            f"Client {_sanitize_log(websocket.remote_address)} unsubscribed from "
            f"{len(symbols)} symbols — {len(current_subs)} remaining"
        )

    def _handle_set_speed(self, websocket: WebSocketServerConnection, data: dict) -> None:
        """Handle simulation speed change."""
        import asyncio
        speed = data.get("speed", 1)
        if speed == 0:
            self._replay_paused = True
            self._speed_event.clear()
            logger.info("  Simulation PAUSED (speed=0)")
            asyncio.create_task(websocket.send(json.dumps({"type": "replay_state", "paused": True})))
        else:
            was_paused = self._replay_paused
            self._replay_paused = False
            self._tick_interval = {1: 1.0, 2: 0.5, 5: 0.2}.get(speed, 1.0)
            if was_paused:
                self._speed_event.set()
            logger.info(f"  Simulation speed set to {_sanitize_log(speed)}x (interval={self._tick_interval}s)")
            asyncio.create_task(websocket.send(json.dumps({"type": "speed_set", "speed": speed})))
            if was_paused:
                asyncio.create_task(websocket.send(json.dumps({"type": "replay_state", "paused": False})))

    async def _handle_replay(self, websocket: WebSocketServerConnection, data: dict) -> None:
        """Handle replay control commands."""
        action = data.get("action", "toggle")
        if action == "pause":
            self._replay_paused = True
            self._speed_event.clear()
            logger.info("  Simulation PAUSED (replay mode)")
            await websocket.send(json.dumps({"type": "replay_state", "paused": True}))
        elif action == "resume":
            self._replay_paused = False
            self._replay_offset = 0
            self._speed_event.set()
            logger.info("  Simulation RESUMED")
            await websocket.send(json.dumps({"type": "replay_state", "paused": False}))
        elif action == "scrub":
            offset = data.get("offset", 0)
            self._replay_offset = offset
            candles = self.market.get_replay_candles(offset)
            await websocket.send(json.dumps({
                "type": "replay_candles",
                "candles": [c.to_dict() for c in candles],
                "offset": offset,
                "timestamp": self.market.current_timestamp,
            }))

    async def _handle_close_position(self, websocket: WebSocketServerConnection, data: dict) -> None:
        """Handle position close request."""
        if not self._trading_active:
            await websocket.send(json.dumps({
                "type": "error",
                "message": "Trading is stopped — send start_trading to enable orders",
            }))
            return
        exchange_id = data.get("exchange", "binance")
        exchange = self.exchanges.get(exchange_id)
        symbol = data.get("symbol")
        if exchange and symbol:
            for pos in exchange.account.positions:
                if pos.symbol == symbol:
                    close_side = Side.SELL if pos.is_long else Side.BUY
                    close_order = exchange.submit_order(
                        symbol=symbol,
                        side=close_side,
                        quantity=pos.quantity,
                        force_close=True,
                    )
                    fill_msg = json.dumps({"type": "fill", "order": close_order.to_dict()})
                    await self._broadcast_to_clients(fill_msg)
                    break

    async def _handle_trading_state(self, websocket: WebSocketServerConnection, active: bool) -> None:
        """Handle start/stop trading commands."""
        self._trading_active = active
        state = "STARTED" if active else "STOPPED"
        logger.info(f"Trading {state} by client command")
        await websocket.send(json.dumps({
            "type": "trading_state",
            "trading_active": active,
        }))
        state_msg = json.dumps({"type": "trading_state", "trading_active": active})
        await self._broadcast_to_clients(state_msg)

    def _handle_update_config(self, websocket: WebSocketServerConnection, data: dict) -> None:
        """Handle hot-reload config updates."""
        import asyncio
        updates = data.get("updates", {})
        if "volatility" in updates:
            for symbol, vol in updates["volatility"].items():
                if symbol in self.market._volatility:
                    old = self.market._volatility[symbol]
                    self.market._volatility[symbol] = vol
                    logger.info(f"  Config hot-reload: {_sanitize_log(symbol)} volatility {_sanitize_log(str(old))} → {_sanitize_log(str(vol))}")
        if "fees" in updates:
            for ex_id, fee in updates["fees"].items():
                if ex_id in self.exchanges:
                    old = self.exchanges[ex_id].fee_pct
                    self.exchanges[ex_id].fee_pct = fee
                    logger.info(f"  Config hot-reload: {_sanitize_log(ex_id)} fee {_sanitize_log(str(old))}% → {_sanitize_log(str(fee))}%")
        if "slippage" in updates:
            for ex_id, slip in updates["slippage"].items():
                if ex_id in self.exchanges:
                    old = self.exchanges[ex_id].slippage_bps
                    self.exchanges[ex_id].slippage_bps = slip
                    logger.info(f"  Config hot-reload: {_sanitize_log(ex_id)} slippage {_sanitize_log(str(old))}bps → {_sanitize_log(str(slip))}bps")
        if "leverage" in updates:
            for ex_id, lev in updates["leverage"].items():
                if ex_id in self.exchanges:
                    self.exchanges[ex_id].account.leverage = lev
                    logger.info(f"  Config hot-reload: {_sanitize_log(ex_id)} leverage → {_sanitize_log(str(lev))}x")
        asyncio.create_task(websocket.send(json.dumps({"type": "config_updated", "updates": updates})))

    async def _handle_options_chain(self, websocket: WebSocketServerConnection, data: dict) -> None:
        """Handle options chain request."""
        from exchange_simulator.options_simulator import OptionsSimulator
        symbol = data.get("symbol", "BTC/USDT")
        prices = self.market.get_all_prices()
        S = None
        for ex_prices in prices.values():
            if symbol in ex_prices:
                S = ex_prices[symbol]
                break
        if S is None:
            await self._send_json(websocket, {"type": "error", "message": f"Price not found for {symbol}"})
            return
        sigma = self.market._volatility.get(symbol, 0.8)
        strikes = data.get("strikes", [S * 0.8, S * 0.9, S * 0.95, S, S * 1.05, S * 1.1, S * 1.2])
        expiries = data.get("expiries", [0.0833, 0.25, 0.5, 1.0])
        sim = OptionsSimulator(risk_free_rate=0.05)
        chain = sim.generate_chain(S, expiries, strikes, sigma)
        await self._send_json(websocket, {
            "type": "options_chain",
            "symbol": symbol,
            "underlying_price": S,
            "volatility": sigma,
            "chain": [
                {
                    "strike": q.strike, "expiry": q.expiry, "type": q.option_type,
                    "price": q.price, "delta": q.delta, "gamma": q.gamma,
                    "theta": q.theta, "vega": q.vega, "rho": q.rho,
                    "itm": q.in_the_money,
                }
                for q in chain
            ],
        })

    async def _broadcast_to_clients(
        self, message: str, exclude: WebSocketServerConnection | None = None
    ) -> None:
        """Broadcast a message to all connected clients."""
        disconnected = set()
        for client in self.clients:
            if client != exclude:
                try:
                    await client.send(message)
                except websockets.ConnectionClosed:
                    disconnected.add(client)
        self.clients -= disconnected
