"""Broadcast loop and data serialization mixin for ExchangeWebSocketServer.

Extracted from websocket_server.py for file-size compliance.
Contains the main broadcast loop, order book delta computation,
SHM publishing, and market data serialization.
"""
import asyncio
import json
import time

import websockets

from exchange_simulator.models import OrderType, Side
from exchange_simulator.ws_constants import (
    WebSocketServerConnection,
    _HAS_ORJSON,
    _HAS_SHM,
    _sanitize_log,
    logger,
)

try:
    import orjson
except ImportError:
    orjson = None

try:
    import struct
except ImportError:
    struct = None

try:
    import multiprocessing.shared_memory as shm_mod
except ImportError:
    shm_mod = None


class BroadcastMixin:
    """Mixin providing broadcast loop and data serialization for ExchangeWebSocketServer."""

    async def _send_json(
        self, websocket: WebSocketServerConnection, data: dict
    ) -> None:
        """Send message to client with negotiated encoding and protocol version."""
        from exchange_simulator.ws_constants import PROTOCOL_VERSION, _HAS_MSGPACK

        try:
            import msgpack
        except ImportError:
            msgpack = None

        client_ver = self._client_versions.get(websocket, 1)
        if client_ver >= 2 and "protocol_version" not in data:
            data = {**data, "protocol_version": PROTOCOL_VERSION}
        encoding = self._client_encodings.get(websocket, "json")

        message_bytes = b""
        if encoding == "msgpack" and _HAS_MSGPACK:
            message_bytes = msgpack.packb(data, use_bin_type=True)
            await websocket.send(message_bytes)
        elif _HAS_ORJSON:
            message_bytes = orjson.dumps(data)
            await websocket.send(message_bytes)
        else:
            message_str = json.dumps(data, separators=(',', ':'))
            message_bytes = message_str.encode('utf-8')
            await websocket.send(message_str)

        self.metrics.record_message(len(message_bytes))
        self.metrics.client_count = len(self.clients)

    async def _send_market_snapshot(
        self, websocket: WebSocketServerConnection
    ) -> None:
        """Send current market state to a client."""
        candles = self.market.get_latest_candles()

        orderbooks = {}
        for ex_id in self.exchanges:
            for symbol in self.market.symbols:
                ob = self.market.generate_order_book(ex_id, symbol)
                orderbooks[f"{ex_id}|{symbol}"] = {
                    "exchange": ex_id,
                    "symbol": symbol,
                    "bids": [{"price": lvl.price, "quantity": lvl.quantity} for lvl in ob.bids],
                    "asks": [{"price": lvl.price, "quantity": lvl.quantity} for lvl in ob.asks],
                }

        message = {
            "type": "snapshot",
            "timestamp": self.market.current_timestamp,
            "candles": [c.to_dict() for c in candles],
            "prices": self.market.get_all_prices(),
            "orderbooks": orderbooks,
            "accounts": {
                ex_id: ex.get_account_status()
                for ex_id, ex in self.exchanges.items()
            },
            "trading_active": self._trading_active,
        }
        await self._send_json(websocket, message)

    async def _send_sync_state(
        self, websocket: WebSocketServerConnection, last_ts: int
    ) -> None:
        """Send historical candles since last_ts for reconnection sync."""
        all_candles = []
        for ex_id in self.exchanges:
            for symbol in self.market.symbols:
                history = self.market.get_history(ex_id, symbol, 200)
                for c in history:
                    if c.timestamp > last_ts:
                        all_candles.append(c.to_dict())

        orderbooks = {}
        for ex_id in self.exchanges:
            for symbol in self.market.symbols:
                ob = self.market.generate_order_book(ex_id, symbol)
                orderbooks[f"{ex_id}|{symbol}"] = {
                    "exchange": ex_id,
                    "symbol": symbol,
                    "bids": [{"price": lvl.price, "quantity": lvl.quantity} for lvl in ob.bids],
                    "asks": [{"price": lvl.price, "quantity": lvl.quantity} for lvl in ob.asks],
                }

        message = {
            "type": "sync_state",
            "timestamp": self.market.current_timestamp,
            "candles": all_candles,
            "prices": self.market.get_all_prices(),
            "orderbooks": orderbooks,
            "accounts": {
                ex_id: ex.get_account_status()
                for ex_id, ex in self.exchanges.items()
            },
            "funding_rates": self.market.get_funding_rates(),
            "candles_to_funding": self.market.candles_to_next_funding,
            "news_event": self.market.get_news_event(),
            "weekend_mode": self.market.is_weekend_mode,
            "trading_active": self._trading_active,
            "missed_candles": len(all_candles),
        }
        await self._send_json(websocket, message)
        logger.info(f"  Sync state sent: {len(all_candles)} candles since ts={_sanitize_log(last_ts)}")

    def _compute_orderbook_delta(self, key: str, bids: list, asks: list) -> tuple[dict, dict] | None:
        """Compute delta between current and last-sent order book for a symbol."""
        current_bids = self._delta_bid_buf
        current_asks = self._delta_ask_buf
        current_bids.clear()
        current_asks.clear()
        for lvl in bids:
            current_bids[lvl.price] = lvl.quantity
        for lvl in asks:
            current_asks[lvl.price] = lvl.quantity

        last = self._last_orderbooks.get(key)

        if last is None:
            self._last_orderbooks[key] = {
                "bids": dict(current_bids),
                "asks": dict(current_asks),
            }
            return None

        last_bids = last["bids"]
        last_asks = last["asks"]

        bid_changes = []
        for price, qty in current_bids.items():
            old_qty = last_bids.get(price)
            if old_qty is None or abs(old_qty - qty) > 1e-12:
                bid_changes.append({"p": price, "q": qty})
        for price in last_bids:
            if price not in current_bids:
                bid_changes.append({"p": price, "q": 0.0})

        ask_changes = []
        for price, qty in current_asks.items():
            old_qty = last_asks.get(price)
            if old_qty is None or abs(old_qty - qty) > 1e-12:
                ask_changes.append({"p": price, "q": qty})
        for price in last_asks:
            if price not in current_asks:
                ask_changes.append({"p": price, "q": 0.0})

        self._last_orderbooks[key] = {
            "bids": dict(current_bids),
            "asks": dict(current_asks),
        }

        if not bid_changes and not ask_changes:
            return {}

        return {"bids": bid_changes, "asks": ask_changes}

    def _reset_orderbook_deltas(self) -> None:
        """Reset delta tracking — next broadcast sends full snapshots."""
        self._last_orderbooks.clear()

    async def _broadcast_loop(self) -> None:
        """Continuously generate new candles and broadcast to all clients."""
        while self._running:
            if self._replay_paused:
                await self._speed_event.wait()
                if self._replay_paused:
                    continue

            await asyncio.sleep(self._tick_interval)

            if not self.clients:
                continue

            candles = self.market.next_candle()
            self.market.auto_check_weekend()

            await self._process_exchange_events()
            arb_data = await self._process_arbitrage()

            orderbooks, orderbook_deltas = self._build_orderbook_data()

            self._publish_shm_snapshot(int(time.time_ns()))

            await self._broadcast_market_data(candles, orderbooks, orderbook_deltas, arb_data)

    async def _process_exchange_events(self) -> None:
        """Check SL/TP, update positions, charge funding, broadcast fills."""
        for ex_id, exchange in self.exchanges.items():
            closed_orders = exchange.check_stop_loss_take_profit()
            exchange.update_positions_pnl()

            funding_rates = self.market.get_funding_rates()
            if self.market.candles_to_next_funding == self.market._funding_interval:
                rate = funding_rates.get(ex_id, 0)
                if rate != 0:
                    notifications = exchange.charge_funding(rate)
                    for note in notifications:
                        logger.info(f"  FUNDING: {ex_id} rate={rate:.6f} | {note}")

            batched_fills = []
            for order in closed_orders:
                if order.status.value == "FILLED":
                    reason = ""
                    if exchange.account.trade_history:
                        reason = exchange.account.trade_history[-1].reason
                    logger.info(
                        f"  {reason or 'SL/TP'} CLOSED: {order.symbol} @ {order.filled_price:.2f} "
                        f"qty={order.filled_quantity:.4f} | {ex_id}"
                    )
                    self.trade_logger.log_fill({
                        "timestamp": time.time(),
                        "exchange": ex_id,
                        "symbol": order.symbol,
                        "side": order.side.value,
                        "type": "SL/TP",
                        "price": order.filled_price,
                        "quantity": order.filled_quantity,
                        "fee": order.fee,
                        "order_id": order.id,
                        "status": f"CLOSED_{reason or 'SLTP'}",
                    })
                    batched_fills.append(order.to_dict())

            if batched_fills:
                await self._broadcast_fills_batch(batched_fills)

    async def _broadcast_fills_batch(self, fills: list[dict]) -> None:
        """Broadcast a batch of fill notifications to all clients."""
        if _HAS_ORJSON:
            fill_msg = orjson.dumps({"type": "fills_batch", "orders": fills})
        else:
            fill_msg = json.dumps({"type": "fills_batch", "orders": fills}, separators=(',', ':'))
        disconnected = set()

        async def _send_fill(client, payload, _disc=disconnected):
            try:
                await client.send(payload)
            except websockets.ConnectionClosed:
                _disc.add(client)

        await asyncio.gather(*[
            _send_fill(c, fill_msg) for c in self.clients
        ], return_exceptions=True)
        self.clients -= disconnected

    async def _process_arbitrage(self) -> bytes | str | None:
        """Scan for arbitrage opportunities and auto-execute if profitable."""
        if not self.arb_detector:
            return None

        new_arbs = self.arb_detector.scan()
        if not new_arbs:
            return None

        arb_dict = self.arb_detector.to_dict()
        if _HAS_ORJSON:
            arb_data = orjson.dumps(arb_dict)
        else:
            arb_data = json.dumps(arb_dict, separators=(',', ':'))

        for opp in new_arbs:
            if opp.spread_bps > 20.0 and opp.max_quantity > 0.01 and self._trading_active:
                await self._execute_arbitrage(opp)

        return arb_data

    async def _execute_arbitrage(self, opp) -> None:
        """Auto-execute an arbitrage opportunity."""
        buy_ex = self.exchanges.get(opp.buy_exchange)
        sell_ex = self.exchanges.get(opp.sell_exchange)
        if not (buy_ex and sell_ex):
            return

        exec_qty = min(opp.max_quantity, 1.0)
        buy_order = buy_ex.submit_order(
            symbol=opp.symbol, side=Side.BUY,
            quantity=exec_qty, order_type=OrderType.MARKET,
        )
        sell_order = sell_ex.submit_order(
            symbol=opp.symbol, side=Side.SELL,
            quantity=exec_qty, order_type=OrderType.MARKET,
        )
        self.arb_detector.close_opportunity(
            opp.symbol, opp.buy_exchange, opp.sell_exchange, "AUTO_EXECUTED"
        )
        logger.info(
            f"  ARB AUTO-EXEC: {opp.symbol} "
            f"buy={opp.buy_exchange}@{opp.buy_price:.2f} "
            f"sell={opp.sell_exchange}@{opp.sell_price:.2f} "
            f"qty={exec_qty:.4f} profit~${opp.net_spread * exec_qty:.2f}"
        )
        arb_ts = time.time()
        self.trade_logger.log_batch([
            {"timestamp": arb_ts, "exchange": opp.buy_exchange, "symbol": opp.symbol,
             "side": "BUY", "type": "ARB", "price": buy_order.filled_price,
             "quantity": buy_order.filled_quantity, "fee": buy_order.fee,
             "order_id": buy_order.id, "status": "ARB_BUY"},
            {"timestamp": arb_ts, "exchange": opp.sell_exchange, "symbol": opp.symbol,
             "side": "SELL", "type": "ARB", "price": sell_order.filled_price,
             "quantity": sell_order.filled_quantity, "fee": sell_order.fee,
             "order_id": sell_order.id, "status": "ARB_SELL"},
        ])
        for fill_order in (buy_order, sell_order):
            if fill_order.status.value == "FILLED":
                fill_payload = {"type": "fill", "order": fill_order.to_dict()}
                if _HAS_ORJSON:
                    fill_msg = orjson.dumps(fill_payload)
                else:
                    fill_msg = json.dumps(fill_payload, separators=(',', ':'))
                await self._broadcast_fills_batch([fill_order.to_dict()])

    def _build_orderbook_data(self) -> tuple[dict, dict]:
        """Build order book snapshots and deltas for all exchange+symbol pairs."""
        orderbooks = {}
        orderbook_deltas = {}
        for ex_id in self.exchanges:
            for symbol in self.market.symbols:
                ob = self.market.generate_order_book(ex_id, symbol)
                key = f"{ex_id}|{symbol}"
                delta = self._compute_orderbook_delta(key, ob.bids, ob.asks)
                if delta is None:
                    orderbooks[key] = {
                        "exchange": ex_id,
                        "symbol": symbol,
                        "bids": [{"price": lvl.price, "quantity": lvl.quantity} for lvl in ob.bids],
                        "asks": [{"price": lvl.price, "quantity": lvl.quantity} for lvl in ob.asks],
                    }
                elif delta:
                    orderbook_deltas[key] = {
                        "exchange": ex_id,
                        "symbol": symbol,
                        "bids": delta["bids"],
                        "asks": delta["asks"],
                    }
        return orderbooks, orderbook_deltas

    async def _broadcast_market_data(
        self, candles, orderbooks: dict, orderbook_deltas: dict, arb_data
    ) -> None:
        """Broadcast market data to all connected clients."""
        message = {
            "type": "candles",
            "timestamp": self.market.current_timestamp,
            "candles": [c.to_dict() for c in candles],
            "prices": self.market.get_all_prices(),
            "accounts": {
                ex_id: ex.get_account_status()
                for ex_id, ex in self.exchanges.items()
            },
            "funding_rates": self.market.get_funding_rates(),
            "candles_to_funding": self.market.candles_to_next_funding,
            "news_event": self.market.get_news_event(),
            "weekend_mode": self.market.is_weekend_mode,
            "trading_active": self._trading_active,
        }
        if orderbooks:
            message["orderbooks"] = orderbooks
        if orderbook_deltas:
            message["orderbook_deltas"] = orderbook_deltas
        if _HAS_ORJSON:
            data = orjson.dumps(message)
        else:
            data = json.dumps(message, separators=(',', ':'))

        disconnected = set()

        async def _send_to_client(client, payload, extra=None, _disc=disconnected):
            try:
                await client.send(payload)
                if extra:
                    await client.send(extra)
            except websockets.ConnectionClosed:
                _disc.add(client)

        await asyncio.gather(*[
            _send_to_client(c, data, arb_data) for c in self.clients
        ], return_exceptions=True)

        self.clients -= disconnected
