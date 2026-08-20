"""WebSocket server -- streams simulated market data to connected bots.

Broadcasts candle updates, order book snapshots, and account status
to all connected WebSocket clients (AI Signal Bot, HFT Trade Bot).

Refactored: WebSocketMetrics -> ws_metrics.py, message handling -> ws_message_handler.py,
broadcast loop -> ws_broadcast.py, Prometheus metrics -> ws_prometheus.py.
"""
import asyncio
import os
import struct
import sys

import websockets

from exchange_simulator.arbitrage import ArbitrageDetector
from exchange_simulator.exchange import SimulatedExchange
from exchange_simulator.market_simulator import MarketSimulator
from exchange_simulator.ws_broadcast import BroadcastMixin
from exchange_simulator.ws_constants import (
    _HAS_SHM,
    WebSocketServerConnection,
    logger,
)
from exchange_simulator.ws_message_handler import MessageHandlerMixin
from exchange_simulator.ws_metrics import WebSocketMetrics
from exchange_simulator.ws_prometheus import PrometheusMixin

# Add project root for trade_csv_logger
_proj_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _proj_root not in sys.path:
    sys.path.insert(0, _proj_root)
from trade_csv_logger import TradeCsvLogger  # noqa: E402


class ExchangeWebSocketServer(
    MessageHandlerMixin, BroadcastMixin, PrometheusMixin
):
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
        arb_detector: ArbitrageDetector | None = None,
    ):
        self.exchanges = exchanges
        self.market = market
        self.host = host
        self.port = port
        self.arb_detector = arb_detector
        self.clients: set[WebSocketServerConnection] = set()
        self._running = False
        self._tick_interval = 1.0
        self._replay_paused = False
        self._replay_offset = 0
        self._speed_event = asyncio.Event()
        self._speed_event.set()
        self._trading_active = True
        self.trade_logger = TradeCsvLogger()
        self._client_versions: dict = {}
        self._client_encodings: dict = {}
        self._last_orderbooks: dict = {}
        self._delta_bid_buf: dict = {}
        self._delta_ask_buf: dict = {}
        self._total_connections: int = 0
        self._total_disconnections: int = 0
        self._sequence_number: int = 0
        logger.info(f"Trade CSV log: {self.trade_logger.path}")

        self.metrics = WebSocketMetrics()

        self._client_subscriptions: dict[WebSocketServerConnection, set[str]] = {}
        self._client_message_counts: dict[WebSocketServerConnection, dict] = {}
        self._rate_limit_window = 60.0
        self._rate_limit_max = 1000

        self._shm_market = None
        self._shm_symbol_ids: dict = {}
        self._shm_struct = struct.Struct('<Q B 3x f f f f')
        self._shm_slot_size = 64
        self._shm_seq_offset = 0
        self._shm_data_offset = 8
        self._shm_max_symbols = int(os.environ.get("SHM_MARKET_MAX_SYMBOLS", "10"))
        self._shm_enabled = os.environ.get("SHM_MARKET_ENABLED", "0") == "1"
        if self._shm_enabled and _HAS_SHM:
            self._init_shm_market()

    def _init_shm_market(self) -> None:
        """Initialize shared memory segment for market data publishing."""
        import multiprocessing.shared_memory as shm_mod
        shm_name = os.environ.get("SHM_MARKET_NAME", "/hft_market")
        try:
            try:
                self._shm_market = shm_mod.SharedMemory(name=shm_name)
            except FileNotFoundError:
                total_size = 8 + self._shm_max_symbols * self._shm_slot_size
                self._shm_market = shm_mod.SharedMemory(name=shm_name, create=True, size=total_size)
                self._shm_market.buf[:8] = struct.pack('<Q', self._shm_max_symbols)
            for i, sym in enumerate(sorted(self.market.symbols)):
                if i >= self._shm_max_symbols:
                    break
                self._shm_symbol_ids[sym] = i
            logger.info(f"SHM market data publisher ready (shm={shm_name}, symbols={len(self._shm_symbol_ids)})")
        except (OSError, RuntimeError, KeyError, ValueError, TypeError, BufferError) as e:
            logger.warning(f"SHM market data publisher init failed: {e}")
            self._shm_market = None

    def _publish_shm_snapshot(self, timestamp_ns: int) -> None:
        """Write market snapshots to shared memory for C++ bot to read (HFT-O16)."""
        if not self._shm_market:
            return
        try:
            all_prices = self.market.get_all_prices()
            # Flatten {exchange: {symbol: price}} -> {symbol: price} using first exchange
            first_ex = self.market.exchanges[0] if self.market.exchanges else None
            prices = all_prices.get(first_ex, {}) if first_ex else {}
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
        except (OSError, ValueError, TypeError, BufferError, struct.error):
            logger.warning("SHM snapshot write failed", exc_info=True)

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

    def get_metrics(self) -> dict:
        """Get WebSocket broadcasting metrics."""
        return self.metrics.get_metrics()
