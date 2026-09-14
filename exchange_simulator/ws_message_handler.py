"""Message handling mixin for ExchangeWebSocketServer.

Extracted from websocket_server.py for file-size compliance.
Handles incoming client messages: orders, subscriptions, replay controls,
trading state, config updates, and options chain requests.
"""
from __future__ import annotations

import json
import secrets
import time

import websockets

from exchange_simulator.models import AuditEventType, OrderType, Side
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


_ORDER_DEDUP_MAX = 10000

# Message types that mutate server/exchange state — gated behind auth when
# EXCHANGE_CONTROL_TOKEN is configured. Market-data requests stay open.
_CONTROL_TYPES = frozenset({
    "order", "close_position", "cancel_order", "cancel_all_orders",
    "start_trading", "stop_trading", "update_config", "set_speed", "replay",
})


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
            logger.warning("Rate limit exceeded for %s", websocket.remote_address)
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
        logger.info("Client connected: %s", remote)

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
        t0 = time.monotonic()
        try:
            if not self._check_rate_limit(websocket):
                self.metrics.errors_total += 1
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "Rate limit exceeded — too many messages",
                }))
                return

            data = self._parse_message(message, remote)
            if data is None:
                self.metrics.errors_total += 1
                return
            await self._handle_message(websocket, data)
        except (RuntimeError, OSError, KeyError, ValueError, TypeError) as e:
            self.metrics.errors_total += 1
            logger.error("Error handling message: %s", e)
            self._audit_logger.log(
                event_type=AuditEventType.ERROR,
                reason=_sanitize_log(str(e)),
                metadata={"remote": _sanitize_log(str(remote))},
            )
        finally:
            self.metrics.ws_latency.observe(time.monotonic() - t0)

    def _parse_message(self, message, remote) -> dict | None:
        """Parse a message from bytes or str. Returns parsed dict or None."""
        if isinstance(message, bytes) and _HAS_MSGPACK:
            try:
                return msgpack.unpackb(message, raw=False)
            except (msgpack.exceptions.UnpackException, ValueError):
                logger.warning(
                    "Invalid msgpack from %s: %s",
                    _sanitize_log(remote), _sanitize_log(message[:100]))
                self._audit_logger.log(
                    event_type=AuditEventType.WARNING,
                    reason="invalid msgpack",
                    metadata={"remote": _sanitize_log(str(remote))},
                )
                return None
        else:
            try:
                return json.loads(message)
            except (json.JSONDecodeError, TypeError):
                logger.warning(
                    "Invalid JSON from %s: %s",
                    _sanitize_log(remote), _sanitize_log(message[:100]))
                self._audit_logger.log(
                    event_type=AuditEventType.WARNING,
                    reason="invalid json",
                    metadata={"remote": _sanitize_log(str(remote))},
                )
                return None

    def _cleanup_client(self, websocket, remote) -> None:
        """Clean up client state on disconnect."""
        self.clients.discard(websocket)
        self._authed_sockets.discard(websocket)
        self._client_versions.pop(websocket, None)
        self._client_encodings.pop(websocket, None)
        self._client_subscriptions.pop(websocket, None)
        self._client_message_counts.pop(websocket, None)
        self._total_disconnections += 1
        logger.info("Client disconnected: %s", remote)

    async def _handle_message(
        self, websocket: WebSocketServerConnection, data: dict
    ) -> None:
        """Handle incoming message from a bot."""
        msg_type = data.get("type")

        if msg_type == "auth":
            await self._handle_auth(websocket, data)
            return
        if (self._control_token and msg_type in _CONTROL_TYPES
                and websocket not in self._authed_sockets):
            await websocket.send(json.dumps({
                "type": "error",
                "message": f"'{msg_type}' requires auth — send "
                           "{\"type\":\"auth\",\"token\":...} first",
            }))
            return

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
        elif msg_type == "cancel_order":
            await self._handle_cancel_order(websocket, data)
        elif msg_type == "cancel_all_orders":
            await self._handle_cancel_all_orders(websocket, data)
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
        t0 = time.monotonic()
        try:
            await self._handle_order_inner(websocket, data)
        finally:
            self.metrics.order_latency.observe(time.monotonic() - t0)

    async def _handle_order_inner(self, websocket: WebSocketServerConnection, data: dict) -> None:
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

        client_order_id = data.get("client_order_id")
        dedup_key = f"{exchange_id}:{client_order_id}" if client_order_id else None
        if dedup_key is not None:
            original = self._order_dedup.get(dedup_key)
            if original is not None:
                # Idempotent resubmit: a replayed/duplicated request gets the
                # original order back instead of filling a second time.
                await websocket.send(json.dumps({
                    "type": "fill",
                    "order": original.to_dict(),
                    "deduplicated": True,
                }))
                return

        order = await self._submit_exchange_order(websocket, exchange, data)
        if order is None:
            return
        order.client_order_id = client_order_id

        if dedup_key is not None:
            self._order_dedup[dedup_key] = order
            self._order_dedup_keys.append(dedup_key)
            if len(self._order_dedup_keys) > _ORDER_DEDUP_MAX:
                self._order_dedup.pop(self._order_dedup_keys.popleft(), None)

        self._log_order_result(order, data, exchange_id)
        fill_msg = json.dumps({"type": "fill", "order": order.to_dict()})
        await websocket.send(fill_msg)
        await self._broadcast_to_clients(fill_msg, exclude=websocket)

    async def _submit_exchange_order(self, websocket, exchange, data: dict):
        """Submit order to exchange and return result or None on error."""
        try:
            quantity = float(data["quantity"])
        except (ValueError, TypeError, KeyError) as e:
            await websocket.send(json.dumps({
                "type": "error",
                "message": f"Invalid quantity: {e}",
            }))
            return None

        import math
        if math.isnan(quantity) or math.isinf(quantity) or quantity <= 0:
            await websocket.send(json.dumps({
                "type": "error",
                "message": f"Quantity must be a positive finite number, got {quantity}",
            }))
            return None

        tif = str(data.get("time_in_force", "GTC")).upper()
        if tif not in ("GTC", "IOC", "FOK", "GTD"):
            await websocket.send(json.dumps({
                "type": "error",
                "message": f"Invalid time_in_force: {tif} (expected GTC/IOC/FOK/GTD)",
            }))
            return None
        expire_ms = data.get("expire_ms")
        expire_ts = float(expire_ms) / 1000.0 if expire_ms is not None else None

        try:
            return exchange.submit_order(
                symbol=data["symbol"],
                side=Side(data["side"]),
                quantity=quantity,
                order_type=OrderType(data.get("order_type", "MARKET")),
                price=data.get("price"),
                stop_loss=data.get("stop_loss"),
                take_profit=data.get("take_profit"),
                stop_price=data.get("stop_price"),
                limit_price=data.get("limit_price"),
                trail_amount=data.get("trail_amount"),
                trail_percentage=data.get("trail_percentage", True),
                iceberg_visible_qty=data.get("iceberg_visible_qty"),
                oco_group_id=data.get("oco_group_id"),
                time_in_force=tif,
                post_only=bool(data.get("post_only", False)),
                expire_ts=expire_ts,
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
            if self.trade_logger is not None:
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
            logger.warning("Client %s requested msgpack but not installed — falling back to JSON", _sanitize_log(websocket.remote_address))
        self._client_encodings[websocket] = encoding

        symbols = data.get("symbols")
        if symbols:
            if isinstance(symbols, list):
                self._client_subscriptions[websocket] = set(symbols)
            else:
                self._client_subscriptions[websocket] = set(self.market.symbols)
            logger.info("Client %s subscribed to %s symbols", _sanitize_log(websocket.remote_address), len(self._client_subscriptions[websocket]))

        logger.info("Client %s subscribed (protocol v%s, encoding=%s)", _sanitize_log(websocket.remote_address), _sanitize_log(client_ver), _sanitize_log(encoding))
        await self._send_market_snapshot(websocket)

    async def _handle_unsubscribe(self, websocket: WebSocketServerConnection, data: dict) -> None:
        """Handle unsubscribe request from a client."""
        symbols = data.get("symbols", [])
        if not symbols:
            logger.warning("Unsubscribe from %s — no symbols specified", _sanitize_log(websocket.remote_address))
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
            logger.info("  Simulation speed set to %sx (interval=%ss)", _sanitize_log(speed), self._tick_interval)
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

    async def _handle_cancel_order(self, websocket: WebSocketServerConnection, data: dict) -> None:
        """Cancel a single pending order by id. Works while trading is stopped —
        killing resting orders during a halt is the point."""
        exchange = self.exchanges.get(data.get("exchange", "binance"))
        order_id = data.get("order_id")
        if not exchange or not order_id:
            await websocket.send(json.dumps({
                "type": "error",
                "message": "cancel_order requires exchange and order_id",
            }))
            return
        cancelled = exchange.cancel_order(order_id)
        if cancelled is None:
            await websocket.send(json.dumps({
                "type": "error",
                "message": f"No pending order {order_id} on {exchange.exchange_id}",
            }))
            return
        cancel_msg = json.dumps({"type": "order_cancelled", "order": cancelled.to_dict()})
        await websocket.send(cancel_msg)
        await self._broadcast_to_clients(cancel_msg, exclude=websocket)

    async def _handle_cancel_all_orders(self, websocket: WebSocketServerConnection, data: dict) -> None:
        """Cancel every pending order on an exchange (optionally one symbol)."""
        exchange = self.exchanges.get(data.get("exchange", "binance"))
        if not exchange:
            await websocket.send(json.dumps({
                "type": "error",
                "message": f"Unknown exchange: {data.get('exchange', 'binance')}",
            }))
            return
        cancelled = exchange.cancel_all_orders(symbol=data.get("symbol"))
        cancel_msg = json.dumps({
            "type": "orders_cancelled",
            "exchange": exchange.exchange_id,
            "count": len(cancelled),
            "order_ids": [o.id for o in cancelled],
        })
        await websocket.send(cancel_msg)
        await self._broadcast_to_clients(cancel_msg, exclude=websocket)

    async def _handle_auth(self, websocket: WebSocketServerConnection, data: dict) -> None:
        """Authenticate a socket for control commands."""
        if not self._control_token:
            # No token configured — control plane is open; auth is a no-op accept.
            self._authed_sockets.add(websocket)
            await websocket.send(json.dumps({"type": "auth_ok"}))
            return
        if secrets.compare_digest(str(data.get("token", "")), self._control_token):
            self._authed_sockets.add(websocket)
            await websocket.send(json.dumps({"type": "auth_ok"}))
        else:
            logger.warning("Control auth failed for %s",
                           _sanitize_log(getattr(websocket, "remote_address", "?")))
            await websocket.send(json.dumps({"type": "auth_failed"}))

    async def _handle_trading_state(self, websocket: WebSocketServerConnection, active: bool) -> None:
        """Handle start/stop trading commands."""
        self._trading_active = active
        state = "STARTED" if active else "STOPPED"
        logger.info("Trading %s by client command", state)
        await websocket.send(json.dumps({
            "type": "trading_state",
            "trading_active": active,
        }))
        state_msg = json.dumps({"type": "trading_state", "trading_active": active})
        await self._broadcast_to_clients(state_msg)

    @staticmethod
    def _valid_number(value) -> bool:
        """Only finite real numbers may be hot-reloaded — a string written into
        _volatility/fee_pct detonates later inside the unguarded tick path."""
        import math
        return (
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and math.isfinite(value)
        )

    def _handle_update_config(self, websocket: WebSocketServerConnection, data: dict) -> None:
        """Handle hot-reload config updates."""
        import asyncio
        updates = data.get("updates", {})
        rejected = []
        if "volatility" in updates:
            for symbol, vol in updates["volatility"].items():
                if symbol in self.market._volatility:
                    if not self._valid_number(vol):
                        rejected.append(f"volatility.{symbol}")
                        continue
                    old = self.market._volatility[symbol]
                    self.market._volatility[symbol] = vol
                    logger.info("  Config hot-reload: %s volatility %s → %s", _sanitize_log(symbol), _sanitize_log(str(old)), _sanitize_log(str(vol)))
        if "fees" in updates:
            for ex_id, fee in updates["fees"].items():
                if ex_id in self.exchanges:
                    if not self._valid_number(fee):
                        rejected.append(f"fees.{ex_id}")
                        continue
                    old = self.exchanges[ex_id].fee_pct
                    self.exchanges[ex_id].fee_pct = fee
                    logger.info("  Config hot-reload: %s fee %s% → %s%", _sanitize_log(ex_id), _sanitize_log(str(old)), _sanitize_log(str(fee)))
        if "slippage" in updates:
            for ex_id, slip in updates["slippage"].items():
                if ex_id in self.exchanges:
                    if not self._valid_number(slip):
                        rejected.append(f"slippage.{ex_id}")
                        continue
                    old = self.exchanges[ex_id].slippage_bps
                    self.exchanges[ex_id].slippage_bps = slip
                    logger.info("  Config hot-reload: %s slippage %sbps → %sbps", _sanitize_log(ex_id), _sanitize_log(str(old)), _sanitize_log(str(slip)))
        if "leverage" in updates:
            for ex_id, lev in updates["leverage"].items():
                if ex_id in self.exchanges:
                    if not self._valid_number(lev):
                        rejected.append(f"leverage.{ex_id}")
                        continue
                    self.exchanges[ex_id].account.leverage = lev
                    logger.info("  Config hot-reload: %s leverage → %sx", _sanitize_log(ex_id), _sanitize_log(str(lev)))
        if rejected:
            logger.warning("Config hot-reload rejected non-numeric values: %s",
                           _sanitize_log(", ".join(rejected)))
        if updates:
            self._audit_logger.log(
                event_type=AuditEventType.CONFIG_CHANGE,
                metadata={"keys": [_sanitize_log(str(k)) for k in updates]},
            )
        asyncio.create_task(websocket.send(json.dumps({
            "type": "config_updated",
            "updates": updates,
            "rejected": rejected,
        })))

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
