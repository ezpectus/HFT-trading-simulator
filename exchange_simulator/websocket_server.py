"""WebSocket server — streams simulated market data to connected bots.

Broadcasts candle updates, order book snapshots, and account status
to all connected WebSocket clients (AI Signal Bot, HFT Trade Bot).
"""
import asyncio
import json
import logging
import os
import struct
import sys
import time
from typing import Set

import websockets

try:
    import msgpack
    _HAS_MSGPACK = True
except ImportError:
    _HAS_MSGPACK = False

try:
    import orjson
    _HAS_ORJSON = True
except ImportError:
    _HAS_ORJSON = False

try:
    import multiprocessing.shared_memory as shm_mod
    _HAS_SHM = True
except ImportError:
    _HAS_SHM = False

# Add project root for trade_csv_logger
_proj_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _proj_root not in sys.path:
    sys.path.insert(0, _proj_root)
from trade_csv_logger import TradeCsvLogger

from exchange_simulator.exchange import SimulatedExchange
from exchange_simulator.market_simulator import MarketSimulator
from exchange_simulator.arbitrage import ArbitrageDetector
from exchange_simulator.models import Side, OrderType

logger = logging.getLogger("exchange_simulator.ws")


PROTOCOL_VERSION = 2


class ExchangeWebSocketServer:
    """WebSocket server that streams simulated market data.

    Protocol v2: all outgoing messages include "protocol_version": 2.
    Clients can negotiate version by sending {"type": "subscribe", "protocol_version": 2}.
    v1 clients (no version field) receive messages without the field for backwards compat.

    Message types:
    - "candles":  Latest OHLCV candles for all symbols
    - "orderbook": Order book snapshot
    - "account":  Account status (positions, balance)
    - "fill":     Order fill notification
    - "welcome":  Sent on connect with protocol version and server info
    """

    def __init__(
        self,
        exchanges: dict[str, SimulatedExchange],
        market: MarketSimulator,
        host: str = "localhost",
        port: int = 8765,
        arb_detector: ArbitrageDetector = None,
    ):
        self.exchanges = exchanges
        self.market = market
        self.host = host
        self.port = port
        self.arb_detector = arb_detector
        self.clients: Set[websockets.ServerConnection] = set()
        self._running = False
        self._tick_interval = 1.0  # seconds between candles (adjustable via set_speed)
        self._replay_paused = False
        self._replay_offset = 0
        self._speed_event = asyncio.Event()
        self._speed_event.set()  # not paused initially
        self._trading_active = True  # bots can submit orders by default
        self.trade_logger = TradeCsvLogger()
        self._client_versions: dict = {}  # websocket -> protocol_version
        self._client_encodings: dict = {}  # websocket -> 'json' or 'msgpack'
        self._last_orderbooks: dict = {}  # "ex|symbol" -> {"bids": {price: qty}, "asks": {price: qty}}
        self._delta_bid_buf: dict = {}  # Reused buffer for delta computation
        self._delta_ask_buf: dict = {}  # Reused buffer for delta computation
        self._total_connections: int = 0
        self._total_disconnections: int = 0
        logger.info(f"Trade CSV log: {self.trade_logger.path}")

        # SHM market data publisher (HFT-O16 — bypass WebSocket for C++ bot)
        self._shm_market = None
        self._shm_symbol_ids: dict = {}  # symbol -> uint8 id
        self._shm_struct = struct.Struct('<Q B 3x f f f f')  # MarketSnapshotMsg: 28 bytes
        self._shm_slot_size = 64  # alignas(64) SnapshotSlot
        self._shm_seq_offset = 0  # seq is first field in SnapshotSlot
        self._shm_data_offset = 8  # data starts after seq (8 bytes)
        self._shm_max_symbols = int(os.environ.get("SHM_MARKET_MAX_SYMBOLS", "10"))
        self._shm_enabled = os.environ.get("SHM_MARKET_ENABLED", "0") == "1"
        if self._shm_enabled and _HAS_SHM:
            self._init_shm_market()

    def _init_shm_market(self) -> None:
        """Initialize shared memory segment for market data publishing."""
        shm_name = os.environ.get("SHM_MARKET_NAME", "/hft_market")
        try:
            try:
                self._shm_market = shm_mod.SharedMemory(name=shm_name)
            except FileNotFoundError:
                total_size = 8 + self._shm_max_symbols * self._shm_slot_size
                self._shm_market = shm_mod.SharedMemory(name=shm_name, create=True, size=total_size)
                self._shm_market.buf[:8] = struct.pack('<Q', self._shm_max_symbols)
            # Build symbol ID mapping from market symbols
            for i, sym in enumerate(sorted(self.market.symbols.keys())):
                if i >= self._shm_max_symbols:
                    break
                self._shm_symbol_ids[sym] = i
            logger.info(f"SHM market data publisher ready (shm={shm_name}, symbols={len(self._shm_symbol_ids)})")
        except Exception as e:
            logger.warning(f"SHM market data publisher init failed: {e}")
            self._shm_market = None

    def _publish_shm_snapshot(self, timestamp_ns: int) -> None:
        """Write market snapshots to shared memory for C++ bot to read (HFT-O16)."""
        if not self._shm_market:
            return
        try:
            prices = self.market.get_all_prices()
            for sym, sid in self._shm_symbol_ids.items():
                price = prices.get(sym, 0.0)
                if price <= 0:
                    continue
                bid = price * 0.9999
                ask = price * 1.0001
                volume = 1000.0
                snap = self._shm_struct.pack(timestamp_ns, sid, bid, ask, price, volume)
                slot_offset = 8 + sid * self._shm_slot_size
                # Increment seq (odd = write in progress)
                seq_offset = slot_offset
                seq_bytes = self._shm_market.buf[seq_offset:seq_offset+8]
                seq = struct.unpack('<Q', bytes(seq_bytes))[0]
                self._shm_market.buf[seq_offset:seq_offset+8] = struct.pack('<Q', seq + 1)
                self._shm_market.buf[slot_offset + self._shm_data_offset:
                                    slot_offset + self._shm_data_offset + len(snap)] = snap
                self._shm_market.buf[seq_offset:seq_offset+8] = struct.pack('<Q', seq + 2)
        except Exception:
            pass

    async def start(self) -> None:
        """Start the WebSocket server."""
        self._running = True
        logger.info(f"WebSocket server starting on {self.host}:{self.port}")

        # Start Prometheus metrics HTTP server on port+10
        # (port+1=8766 conflicts with AI Signal Bot WebSocket)
        metrics_port = self.port + 10
        metrics_task = asyncio.create_task(self._run_metrics_server(metrics_port))

        async with websockets.asyncio.server.serve(
            self._handle_client, self.host, self.port,
            ping_interval=10,
            compression="deflate",
            max_size=2**20,  # 1MB max message
        ):
            # Start market data broadcast loop
            broadcast_task = asyncio.create_task(self._broadcast_loop())
            await asyncio.Future()  # Run forever
            broadcast_task.cancel()
            metrics_task.cancel()

    async def _run_metrics_server(self, port: int) -> None:
        """Run a simple HTTP server for Prometheus metrics scraping."""
        from aiohttp import web

        async def metrics_handler(request):
            return web.Response(
                text=self._get_prometheus_metrics(),
                content_type="text/plain; version=0.0.4",
            )

        app = web.Application()
        app.router.add_get("/metrics", metrics_handler)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, self.host, port)
        await site.start()
        logger.info(f"Prometheus metrics endpoint on http://{self.host}:{port}/metrics")
        await asyncio.Future()  # Run forever

    async def stop(self) -> None:
        self._running = False
        for client in self.clients:
            await client.close()
        logger.info("WebSocket server stopped")

    async def _handle_client(
        self, websocket: websockets.ServerConnection
    ) -> None:
        """Handle a connected client — receive orders, send market data."""
        self.clients.add(websocket)
        self._total_connections += 1
        remote = websocket.remote_address
        logger.info(f"Client connected: {remote}")

        try:
            # Send welcome message with protocol version
            await self._send_json(websocket, {
                "type": "welcome",
                "protocol_version": PROTOCOL_VERSION,
                "server": "exchange_simulator",
                "trading_active": self._trading_active,
            })
            # Send initial snapshot
            await self._send_market_snapshot(websocket)

            # Listen for incoming messages (orders from bots)
            async for message in websocket:
                try:
                    if isinstance(message, bytes) and _HAS_MSGPACK:
                        try:
                            data = msgpack.unpackb(message, raw=False)
                        except (msgpack.exceptions.UnpackException, ValueError):
                            logger.warning(f"Invalid msgpack from {remote}: {message[:100]}")
                            continue
                    else:
                        try:
                            data = json.loads(message)
                        except (json.JSONDecodeError, TypeError):
                            logger.warning(f"Invalid JSON from {remote}: {message[:100]}")
                            continue
                    await self._handle_message(websocket, data)
                except Exception as e:
                    logger.error(f"Error handling message: {e}")

        except websockets.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            self._client_versions.pop(websocket, None)
            self._client_encodings.pop(websocket, None)
            self._total_disconnections += 1
            logger.info(f"Client disconnected: {remote}")

    async def _handle_message(
        self, websocket: websockets.ServerConnection, data: dict
    ) -> None:
        """Handle incoming message from a bot."""
        msg_type = data.get("type")

        if msg_type == "order":
            if not self._trading_active:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "Trading is stopped — send start_trading to enable orders",
                }))
                return
            # Bot wants to submit an order
            exchange_id = data.get("exchange", "binance")
            exchange = self.exchanges.get(exchange_id)
            if not exchange:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": f"Unknown exchange: {exchange_id}",
                }))
                return

            # Validate required fields
            missing = [f for f in ("symbol", "side", "quantity") if f not in data]
            if missing:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": f"Missing required order fields: {missing}",
                }))
                return

            try:
                order = exchange.submit_order(
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
                return

            # Log bot trades to CLI
            if order.status.value == "FILLED":
                logger.info(
                    f"  ORDER FILLED: {data['side']} {float(data['quantity']):.4f} "
                    f"{data['symbol']} @ {order.filled_price:.2f} "
                    f"fee={order.fee:.4f} | {exchange_id}"
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
                    f"  ORDER REJECTED: {data['side']} {data['symbol']} "
                    f"qty={data['quantity']} | {exchange_id} | {reason}"
                )

            # Send fill notification back
            fill_msg = json.dumps({
                "type": "fill",
                "order": order.to_dict(),
            })
            await websocket.send(fill_msg)
            # Broadcast fill to ALL clients so Web UI sees bot trades
            disconnected = set()
            for client in self.clients:
                if client != websocket:
                    try:
                        await client.send(fill_msg)
                    except websockets.ConnectionClosed:
                        disconnected.add(client)
            self.clients -= disconnected

        elif msg_type == "subscribe":
            # Client subscribes — negotiate protocol version and encoding
            client_ver = data.get("protocol_version", 1)
            self._client_versions[websocket] = client_ver
            encoding = data.get("encoding", "json")
            if encoding == "msgpack" and not _HAS_MSGPACK:
                encoding = "json"
                logger.warning(f"Client {websocket.remote_address} requested msgpack but not installed — falling back to JSON")
            self._client_encodings[websocket] = encoding
            logger.info(f"Client {websocket.remote_address} subscribed (protocol v{client_ver}, encoding={encoding})")
            await self._send_market_snapshot(websocket)

        elif msg_type == "ping":
            await websocket.send(json.dumps({"type": "pong"}))

        elif msg_type == "sync_state":
            # Client requests historical state after reconnection
            last_ts = data.get("last_timestamp", 0)
            await self._send_sync_state(websocket, last_ts)

        elif msg_type == "set_speed":
            speed = data.get("speed", 1)
            if speed == 0:
                self._replay_paused = True
                self._speed_event.clear()
                logger.info("  Simulation PAUSED (speed=0)")
                await websocket.send(json.dumps({"type": "replay_state", "paused": True}))
            else:
                was_paused = self._replay_paused
                self._replay_paused = False
                self._tick_interval = {1: 1.0, 2: 0.5, 5: 0.2}.get(speed, 1.0)
                if was_paused:
                    self._speed_event.set()
                logger.info(f"  Simulation speed set to {speed}x (interval={self._tick_interval}s)")
                await websocket.send(json.dumps({"type": "speed_set", "speed": speed}))
                if was_paused:
                    await websocket.send(json.dumps({"type": "replay_state", "paused": False}))

        elif msg_type == "replay":
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
                # Send historical candles at this offset
                candles = self.market.get_replay_candles(offset)
                await websocket.send(json.dumps({
                    "type": "replay_candles",
                    "candles": [c.to_dict() for c in candles],
                    "offset": offset,
                    "timestamp": self.market.current_timestamp,
                }))

        elif msg_type == "close_position":
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
                        # Broadcast fill to all clients
                        fill_msg = json.dumps({
                            "type": "fill",
                            "order": close_order.to_dict(),
                        })
                        disconnected = set()
                        for client in self.clients:
                            try:
                                await client.send(fill_msg)
                            except websockets.ConnectionClosed:
                                disconnected.add(client)
                        self.clients -= disconnected
                        break

        elif msg_type == "start_trading":
            self._trading_active = True
            logger.info("Trading STARTED by client command")
            await websocket.send(json.dumps({
                "type": "trading_state",
                "trading_active": True,
            }))
            # Broadcast to all clients
            state_msg = json.dumps({"type": "trading_state", "trading_active": True})
            disconnected = set()
            for client in self.clients:
                try:
                    await client.send(state_msg)
                except websockets.ConnectionClosed:
                    disconnected.add(client)
            self.clients -= disconnected

        elif msg_type == "stop_trading":
            self._trading_active = False
            logger.info("Trading STOPPED by client command")
            await websocket.send(json.dumps({
                "type": "trading_state",
                "trading_active": False,
            }))
            # Broadcast to all clients
            state_msg = json.dumps({"type": "trading_state", "trading_active": False})
            disconnected = set()
            for client in self.clients:
                try:
                    await client.send(state_msg)
                except websockets.ConnectionClosed:
                    disconnected.add(client)
            self.clients -= disconnected

        elif msg_type == "update_config":
            # Hot-reload config: volatility, fees, slippage
            updates = data.get("updates", {})
            if "volatility" in updates:
                for symbol, vol in updates["volatility"].items():
                    if symbol in self.market._volatility:
                        old = self.market._volatility[symbol]
                        self.market._volatility[symbol] = vol
                        logger.info(f"  Config hot-reload: {symbol} volatility {old} → {vol}")
            if "fees" in updates:
                for ex_id, fee in updates["fees"].items():
                    if ex_id in self.exchanges:
                        old = self.exchanges[ex_id].fee_pct
                        self.exchanges[ex_id].fee_pct = fee
                        logger.info(f"  Config hot-reload: {ex_id} fee {old}% → {fee}%")
            if "slippage" in updates:
                for ex_id, slip in updates["slippage"].items():
                    if ex_id in self.exchanges:
                        old = self.exchanges[ex_id].slippage_bps
                        self.exchanges[ex_id].slippage_bps = slip
                        logger.info(f"  Config hot-reload: {ex_id} slippage {old}bps → {slip}bps")
            if "leverage" in updates:
                for ex_id, lev in updates["leverage"].items():
                    if ex_id in self.exchanges:
                        self.exchanges[ex_id].account.leverage = lev
                        logger.info(f"  Config hot-reload: {ex_id} leverage → {lev}x")
            await websocket.send(json.dumps({"type": "config_updated", "updates": updates}))

        elif msg_type == "options_chain":
            # Generate options chain with Greeks
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
            expiries = data.get("expiries", [0.0833, 0.25, 0.5, 1.0])  # 1m, 3m, 6m, 1y
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

    async def _send_json(
        self, websocket: websockets.ServerConnection, data: dict
    ) -> None:
        """Send message to client with negotiated encoding and protocol version.

        - v2 clients get protocol_version field injected.
        - msgpack clients receive binary MessagePack frames.
        - v1/json clients receive plain JSON text.
        """
        client_ver = self._client_versions.get(websocket, 1)
        if client_ver >= 2 and "protocol_version" not in data:
            data = {**data, "protocol_version": PROTOCOL_VERSION}
        encoding = self._client_encodings.get(websocket, "json")
        if encoding == "msgpack" and _HAS_MSGPACK:
            await websocket.send(msgpack.packb(data, use_bin_type=True))
        elif _HAS_ORJSON:
            await websocket.send(orjson.dumps(data))
        else:
            await websocket.send(json.dumps(data, separators=(',', ':')))

    async def _send_market_snapshot(
        self, websocket: websockets.ServerConnection
    ) -> None:
        """Send current market state to a client."""
        candles = self.market.get_latest_candles()

        # Build order book snapshots for all exchange+symbol pairs
        orderbooks = {}
        for ex_id in self.exchanges:
            for symbol in self.market.symbols:
                ob = self.market.generate_order_book(ex_id, symbol)
                orderbooks[f"{ex_id}|{symbol}"] = {
                    "exchange": ex_id,
                    "symbol": symbol,
                    "bids": [{"price": l.price, "quantity": l.quantity} for l in ob.bids],
                    "asks": [{"price": l.price, "quantity": l.quantity} for l in ob.asks],
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
        self, websocket: websockets.ServerConnection, last_ts: int
    ) -> None:
        """Send historical candles since last_ts for reconnection sync."""
        all_candles = []
        for ex_id in self.exchanges:
            for symbol in self.market.symbols:
                history = self.market.get_history(ex_id, symbol, 200)
                for c in history:
                    if c.timestamp > last_ts:
                        all_candles.append(c.to_dict())

        # Build current state
        orderbooks = {}
        for ex_id in self.exchanges:
            for symbol in self.market.symbols:
                ob = self.market.generate_order_book(ex_id, symbol)
                orderbooks[f"{ex_id}|{symbol}"] = {
                    "exchange": ex_id,
                    "symbol": symbol,
                    "bids": [{"price": l.price, "quantity": l.quantity} for l in ob.bids],
                    "asks": [{"price": l.price, "quantity": l.quantity} for l in ob.asks],
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
        logger.info(f"  Sync state sent: {len(all_candles)} candles since ts={last_ts}")

    def _compute_orderbook_delta(self, key: str, bids: list, asks: list) -> tuple[dict, dict] | None:
        """Compute delta between current and last-sent order book for a symbol.

        Returns (full_snapshot, delta) where:
        - full_snapshot is the complete orderbook dict (used if no prior state)
        - delta is {"bids": [{"p":..,"q":..}|{"p":..,"q":0}], "asks": [...]} with only changed levels
        - Returns (full_snapshot, None) if no prior state (first send or after reset)
        """
        # Reuse persistent dicts to avoid allocation per tick
        current_bids = self._delta_bid_buf
        current_asks = self._delta_ask_buf
        current_bids.clear()
        current_asks.clear()
        for l in bids:
            current_bids[l.price] = l.quantity
        for l in asks:
            current_asks[l.price] = l.quantity

        last = self._last_orderbooks.get(key)

        if last is None:
            # No prior state — store copies since we reuse the buffers
            self._last_orderbooks[key] = {
                "bids": dict(current_bids),
                "asks": dict(current_asks),
            }
            return None  # signal: send full

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

        # Store copies for next tick's comparison
        self._last_orderbooks[key] = {
            "bids": dict(current_bids),
            "asks": dict(current_asks),
        }

        if not bid_changes and not ask_changes:
            return {}  # no changes at all

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

            # Generate next candle
            candles = self.market.next_candle()
            self.market.auto_check_weekend()

            # Check SL/TP for all exchanges
            for ex_id, exchange in self.exchanges.items():
                closed_orders = exchange.check_stop_loss_take_profit()
                exchange.update_positions_pnl()

                # Charge funding when funding rates update
                funding_rates = self.market.get_funding_rates()
                if self.market.candles_to_next_funding == self.market._funding_interval:
                    # Funding just updated — charge all positions
                    rate = funding_rates.get(ex_id, 0)
                    if rate != 0:
                        notifications = exchange.charge_funding(rate)
                        for note in notifications:
                            logger.info(f"  FUNDING: {ex_id} rate={rate:.6f} | {note}")

                # Broadcast SL/TP/Liquidation fills to all clients (batched)
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
                    if _HAS_ORJSON:
                        fill_msg = orjson.dumps({"type": "fills_batch", "orders": batched_fills})
                    else:
                        fill_msg = json.dumps({"type": "fills_batch", "orders": batched_fills}, separators=(',', ':'))
                    disconnected = set()
                    async def _send_fill(client, payload):
                        try:
                            await client.send(payload)
                        except websockets.ConnectionClosed:
                            disconnected.add(client)
                    await asyncio.gather(*[
                        _send_fill(c, fill_msg) for c in self.clients
                    ], return_exceptions=True)
                    self.clients -= disconnected

            # Scan for arbitrage opportunities
            arb_data = None
            if self.arb_detector:
                new_arbs = self.arb_detector.scan()
                if new_arbs:
                    arb_dict = self.arb_detector.to_dict()
                    if _HAS_ORJSON:
                        arb_data = orjson.dumps(arb_dict)
                    else:
                        arb_data = json.dumps(arb_dict, separators=(',', ':'))

                    # Auto-execute arbitrage if spread > threshold (only when trading is active)
                    for opp in new_arbs:
                        if opp.spread_bps > 20.0 and opp.max_quantity > 0.01 and self._trading_active:
                            # Execute: buy on buy_exchange, sell on sell_exchange
                            buy_ex = self.exchanges.get(opp.buy_exchange)
                            sell_ex = self.exchanges.get(opp.sell_exchange)
                            if buy_ex and sell_ex:
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
                                # Broadcast arb fills to all connected clients
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
                                        disconnected = set()
                                        async def _send_arb_fill(client, payload):
                                            try:
                                                await client.send(payload)
                                            except websockets.ConnectionClosed:
                                                disconnected.add(client)
                                        await asyncio.gather(*[
                                            _send_arb_fill(c, fill_msg) for c in self.clients
                                        ], return_exceptions=True)
                                        self.clients -= disconnected

            # Build order book — delta updates (only changed levels)
            orderbooks = {}
            orderbook_deltas = {}
            for ex_id in self.exchanges:
                for symbol in self.market.symbols:
                    ob = self.market.generate_order_book(ex_id, symbol)
                    key = f"{ex_id}|{symbol}"
                    delta = self._compute_orderbook_delta(key, ob.bids, ob.asks)
                    if delta is None:
                        # No prior state — send full snapshot
                        orderbooks[key] = {
                            "exchange": ex_id,
                            "symbol": symbol,
                            "bids": [{"price": l.price, "quantity": l.quantity} for l in ob.bids],
                            "asks": [{"price": l.price, "quantity": l.quantity} for l in ob.asks],
                        }
                    elif delta:
                        # Has changes — send delta
                        orderbook_deltas[key] = {
                            "exchange": ex_id,
                            "symbol": symbol,
                            "bids": delta["bids"],
                            "asks": delta["asks"],
                        }
                    # If delta is {} — no changes, skip entirely

            # Publish market data to SHM (HFT-O16 — bypass WebSocket for C++ bot)
            self._publish_shm_snapshot(int(time.time_ns()))

            # Broadcast to all connected clients
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
            # Include full orderbooks only if there are any (first send or new symbol)
            if orderbooks:
                message["orderbooks"] = orderbooks
            # Include deltas if there are any changed levels
            if orderbook_deltas:
                message["orderbook_deltas"] = orderbook_deltas
            if _HAS_ORJSON:
                data = orjson.dumps(message)
            else:
                data = json.dumps(message, separators=(',', ':'))

            # Send to all clients — concurrent via asyncio.gather
            disconnected = set()
            async def _send_to_client(client, payload, extra=None):
                try:
                    await client.send(payload)
                    if extra:
                        await client.send(extra)
                except websockets.ConnectionClosed:
                    disconnected.add(client)

            await asyncio.gather(*[
                _send_to_client(c, data, arb_data) for c in self.clients
            ], return_exceptions=True)

            self.clients -= disconnected

    def _get_prometheus_metrics(self) -> str:
        """Generate Prometheus-format metrics string."""
        lines = []
        lines.append("# HELP exchange_connected_clients Number of connected WebSocket clients")
        lines.append("# TYPE exchange_connected_clients gauge")
        lines.append(f"exchange_connected_clients {len(self.clients)}")

        lines.append("# HELP exchange_candle_count Total candles generated")
        lines.append("# TYPE exchange_candle_count counter")
        lines.append(f"exchange_candle_count {self.market._candle_count}")

        lines.append("# HELP exchange_weekend_mode Weekend mode active (1=yes, 0=no)")
        lines.append("# TYPE exchange_weekend_mode gauge")
        lines.append(f"exchange_weekend_mode {1 if self.market.is_weekend_mode else 0}")

        lines.append("# HELP exchange_news_event_active News event active (1=yes, 0=no)")
        lines.append("# TYPE exchange_news_event_active gauge")
        lines.append(f"exchange_news_event_active {1 if self.market.get_news_event() else 0}")

        lines.append("# HELP exchange_tick_interval_seconds Current tick interval in seconds")
        lines.append("# TYPE exchange_tick_interval_seconds gauge")
        lines.append(f"exchange_tick_interval_seconds {self._tick_interval}")

        lines.append("# HELP exchange_trading_active Trading is active (1=yes, 0=stopped)")
        lines.append("# TYPE exchange_trading_active gauge")
        lines.append(f"exchange_trading_active {1 if self._trading_active else 0}")

        lines.append("# HELP exchange_ws_connections_total Total WebSocket client connections")
        lines.append("# TYPE exchange_ws_connections_total counter")
        lines.append(f"exchange_ws_connections_total {self._total_connections}")

        lines.append("# HELP exchange_ws_disconnections_total Total WebSocket client disconnections")
        lines.append("# TYPE exchange_ws_disconnections_total counter")
        lines.append(f"exchange_ws_disconnections_total {self._total_disconnections}")

        for ex_id, ex in self.exchanges.items():
            acc = ex.account
            labels = f'exchange="{ex_id}"'
            lines.append(f'exchange_balance{{{labels}}} {acc.balance:.2f}')
            lines.append(f'exchange_equity{{{labels}}} {acc.equity:.2f}')
            lines.append(f'exchange_total_pnl{{{labels}}} {acc.total_pnl:.2f}')
            lines.append(f'exchange_total_trades{{{labels}}} {acc.total_trades}')
            lines.append(f'exchange_winning_trades{{{labels}}} {acc.winning_trades}')
            lines.append(f'exchange_open_positions{{{labels}}} {len(acc.positions)}')
            lines.append(f'exchange_total_fees{{{labels}}} {acc.total_fees:.4f}')
            lines.append(f'exchange_leverage{{{labels}}} {acc.leverage}')

            for pos in acc.positions:
                pos_labels = f'exchange="{ex_id}",symbol="{pos.symbol}",side="{pos.side.value}"'
                lines.append(f'exchange_position_unrealized_pnl{{{pos_labels}}} {pos.unrealized_pnl:.2f}')
                lines.append(f'exchange_position_quantity{{{pos_labels}}} {pos.quantity:.4f}')

        for symbol in self.market.symbols:
            price = self.market.get_price(symbol, self.market.exchanges[0])
            lines.append(f'exchange_price{{symbol="{symbol}"}} {price:.2f}')

        return "\n".join(lines) + "\n"
