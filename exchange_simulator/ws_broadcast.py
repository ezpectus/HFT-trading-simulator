"""Broadcast loop and data serialization mixin for ExchangeWebSocketServer.

Extracted from websocket_server.py for file-size compliance.
Contains the main broadcast loop, order book delta computation,
SHM publishing, and market data serialization.
"""
import asyncio
import json
import time

import websockets

from exchange_simulator.ws_constants import (
    _HAS_MSGPACK,
    _HAS_ORJSON,
    WebSocketServerConnection,
    _sanitize_log,
    logger,
)

try:
    import orjson
except ImportError:
    orjson = None

try:
    import msgpack
except ImportError:
    msgpack = None

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
        from exchange_simulator.ws_constants import PROTOCOL_VERSION

        client_ver = self._client_versions.get(websocket, 1)
        if client_ver >= 2 and "protocol_version" not in data:
            data = {**data, "protocol_version": PROTOCOL_VERSION}
        message_bytes = self._encode(data, self._client_encodings.get(websocket, "json"))
        await websocket.send(message_bytes)

        payload_len = len(message_bytes) if isinstance(message_bytes, (bytes, bytearray)) else len(message_bytes.encode('utf-8'))
        self.metrics.record_message(payload_len)

    async def _send_tracked(self, client: WebSocketServerConnection, payload) -> None:
        """Broadcast-path send with metrics (S347).

        Every production broadcast used to call client.send() directly, so
        messages_total/bytes_sent only counted connect-time unicasts and
        broadcast_latency never moved. Latency is recorded in finally so a
        backpressured-then-failed send still contributes its true cost.
        """
        t0 = time.monotonic()
        try:
            await client.send(payload)
        finally:
            self.metrics.record_broadcast_latency((time.monotonic() - t0) * 1000.0)
        size = len(payload) if isinstance(payload, (bytes, bytearray)) else len(payload.encode('utf-8'))
        self.metrics.record_message(size)

    def _encode(self, data: dict, encoding: str) -> str | bytes:
        """Encode a payload honoring the negotiated wire encoding.

        JSON goes out as a TEXT frame, msgpack as binary — clients discriminate
        on the frame type, so JSON-as-bytes (raw orjson.dumps) would be read as
        msgpack by any client that has the lib installed (S212)."""
        if encoding == "msgpack" and _HAS_MSGPACK:
            return msgpack.packb(data, use_bin_type=True)
        if _HAS_ORJSON:
            return orjson.dumps(data).decode('utf-8')
        return json.dumps(data, separators=(',', ':'))

    def _encoded_variants(self, data: dict) -> dict:
        """Encode a shared broadcast payload once per negotiated encoding
        present in self.clients (S212 — broadcasts previously ignored the
        negotiated encoding entirely)."""
        variants = {}
        for c in self.clients:
            enc = self._client_encodings.get(c, "json")
            if enc not in variants:
                variants[enc] = self._encode(data, enc)
        return variants

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
            "open_orders": {
                ex_id: [o.to_dict() for o in ex.get_pending_orders()]
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
            "open_orders": {
                ex_id: [o.to_dict() for o in ex.get_pending_orders()]
                for ex_id, ex in self.exchanges.items()
            },
            "trading_active": self._trading_active,
            "missed_candles": len(all_candles),
        }
        await self._send_json(websocket, message)
        logger.info("  Sync state sent: %s candles since ts=%s", len(all_candles), _sanitize_log(last_ts))

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

            feed_t0 = time.monotonic()
            try:
                candles = self.market.next_candle()
                self.market.auto_check_weekend()
                self.metrics.price_updates_total += len(candles)

                await self._process_exchange_events()
                arb_data = await self._process_arbitrage()

                orderbooks, orderbook_deltas = self._build_orderbook_data()

                self._publish_shm_snapshot(int(time.time_ns()))

                await self._broadcast_market_data(candles, orderbooks, orderbook_deltas, arb_data)
                self.metrics.feed_latency.observe(time.monotonic() - feed_t0)
                await self._broadcast_audit_events()
            except Exception:
                # One bad tick must not kill the feed — log and continue.
                # CancelledError is BaseException and still propagates.
                logger.exception("Broadcast tick failed — continuing")
                await asyncio.sleep(1.0)

    async def _broadcast_audit_events(self) -> None:
        """Drain queued audit-log events and push them to all clients."""
        if not self._audit_pending:
            return
        logs = []
        while self._audit_pending:
            logs.append(self._audit_pending.popleft())
        variants = self._encoded_variants({"type": "audit_logs", "logs": logs})
        disconnected = set()

        async def _send(client):
            try:
                await self._send_tracked(client, variants[self._client_encodings.get(client, "json")])
            except websockets.ConnectionClosed:
                disconnected.add(client)

        await asyncio.gather(*[_send(c) for c in self.clients], return_exceptions=True)
        self.clients -= disconnected

    async def _broadcast_fills_batch(self, fills: list[dict]) -> None:
        """Broadcast a batch of fill notifications to all clients."""
        variants = self._encoded_variants({"type": "fills_batch", "orders": fills})
        disconnected = set()

        async def _send_fill(client, _disc=disconnected):
            try:
                await self._send_tracked(client, variants[self._client_encodings.get(client, "json")])
            except websockets.ConnectionClosed:
                _disc.add(client)

        await asyncio.gather(*[
            _send_fill(c) for c in self.clients
        ], return_exceptions=True)
        self.clients -= disconnected

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
                    self.metrics.record_delta_update(False)
                    orderbooks[key] = {
                        "exchange": ex_id,
                        "symbol": symbol,
                        "bids": [{"price": lvl.price, "quantity": lvl.quantity} for lvl in ob.bids],
                        "asks": [{"price": lvl.price, "quantity": lvl.quantity} for lvl in ob.asks],
                    }
                elif delta:
                    self.metrics.record_delta_update(True)
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
        """Broadcast market data to all connected clients.

        Filters data per-client based on their symbol subscriptions.
        Includes a monotonically increasing sequence number for delta sync.
        """
        self._sequence_number += 1
        seq = self._sequence_number
        all_symbols = set(self.market.symbols)
        candle_dicts = [c.to_dict() for c in candles]
        prices = self.market.get_all_prices()
        accounts = {
            ex_id: ex.get_account_status()
            for ex_id, ex in self.exchanges.items()
        }
        funding_rates = self.market.get_funding_rates()

        disconnected = set()

        extra_variants = self._encoded_variants(arb_data) if arb_data else {}

        async def _send_to_client(client, payload, _disc=disconnected):
            try:
                await self._send_tracked(client, payload)
                if extra_variants:
                    await self._send_tracked(
                        client,
                        extra_variants[self._client_encodings.get(client, "json")],
                    )
            except websockets.ConnectionClosed:
                _disc.add(client)

        # Encode cache: identical (encoding, subscription) variants share one
        # built+encoded payload — the main message was rebuilt AND re-dumped
        # per client (the big candles+books JSON × N clients per tick).
        encoded_cache: dict[tuple, str] = {}
        tasks = []
        for client in self.clients:
            subs = self._client_subscriptions.get(client, all_symbols)
            enc = self._client_encodings.get(client, "json")
            full = subs == all_symbols or not subs
            vkey = (enc, None) if full else (enc, frozenset(subs))
            data = encoded_cache.get(vkey)
            if data is None:
                if full:
                    msg = self._build_full_message(
                        seq, candle_dicts, prices, accounts,
                        funding_rates, orderbooks, orderbook_deltas,
                    )
                else:
                    msg = self._build_filtered_message(
                        seq, candle_dicts, prices, accounts,
                        funding_rates, orderbooks, orderbook_deltas, subs,
                    )
                data = encoded_cache[vkey] = self._encode(msg, enc)
            tasks.append(_send_to_client(client, data))

        await asyncio.gather(*tasks, return_exceptions=True)
        self.clients -= disconnected

    def _build_full_message(
        self, seq: int, candle_dicts: list, prices: dict,
        accounts: dict, funding_rates: dict,
        orderbooks: dict, orderbook_deltas: dict,
    ) -> dict:
        """Build unfiltered broadcast message with sequence number."""
        message = {
            "type": "candles",
            "seq": seq,
            "timestamp": self.market.current_timestamp,
            "candles": candle_dicts,
            "prices": prices,
            "accounts": accounts,
            "funding_rates": funding_rates,
            "candles_to_funding": self.market.candles_to_next_funding,
            "news_event": self.market.get_news_event(),
            "weekend_mode": self.market.is_weekend_mode,
            "trading_active": self._trading_active,
        }
        if orderbooks:
            message["orderbooks"] = orderbooks
        if orderbook_deltas:
            message["orderbook_deltas"] = orderbook_deltas
        return message

    def _build_filtered_message(
        self, seq: int, candle_dicts: list, prices: dict,
        accounts: dict, funding_rates: dict,
        orderbooks: dict, orderbook_deltas: dict, subs: set[str],
    ) -> dict:
        """Build message filtered to client's subscribed symbols."""
        filtered_candles = [c for c in candle_dicts if c.get("symbol") in subs]
        filtered_prices = {
            ex_id: {s: p for s, p in ex_prices.items() if s in subs}
            for ex_id, ex_prices in prices.items()
        }
        filtered_ob = {
            k: v for k, v in orderbooks.items()
            if v.get("symbol") in subs
        }
        filtered_delta = {
            k: v for k, v in orderbook_deltas.items()
            if v.get("symbol") in subs
        }
        message = {
            "type": "candles",
            "seq": seq,
            "timestamp": self.market.current_timestamp,
            "candles": filtered_candles,
            "prices": filtered_prices,
            "accounts": accounts,
            "funding_rates": funding_rates,
            "candles_to_funding": self.market.candles_to_next_funding,
            "news_event": self.market.get_news_event(),
            "weekend_mode": self.market.is_weekend_mode,
            "trading_active": self._trading_active,
        }
        if filtered_ob:
            message["orderbooks"] = filtered_ob
        if filtered_delta:
            message["orderbook_deltas"] = filtered_delta
        return message
