"""
Real exchange market data feeds — multi-exchange WebSocket subscription.

Subscribes to real exchange WebSocket feeds (Binance, OKX, Bybit),
normalizes to internal format (same as simulator output), and provides
reconnection with state sync.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class NormalizedTicker:
    """Normalized ticker data across all exchanges."""
    exchange: str
    symbol: str
    bid: float
    ask: float
    last: float
    volume: float
    timestamp: int  # ms


@dataclass
class NormalizedCandle:
    """Normalized candle/OHLCV data."""
    exchange: str
    symbol: str
    interval: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    time: int  # ms


@dataclass
class NormalizedOrderBook:
    """Normalized L2 order book snapshot."""
    exchange: str
    symbol: str
    bids: list[tuple[float, float]]  # [(price, qty), ...]
    asks: list[tuple[float, float]]
    timestamp: int


class RealMarketDataFeed:
    """
    Multi-exchange real market data feed.

    Subscribes to WebSocket streams from Binance, OKX, and/or Bybit.
    Normalizes all data to internal format and invokes callbacks.
    """

    def __init__(self, exchanges: list[str] | None = None, testnet: bool = False):
        self.exchanges = exchanges or ["binance"]
        self.testnet = testnet
        self._ws_connections: dict[str, object] = {}
        self._running = False
        self._reconnect_delay = 1.0
        self._reconnect_delays: dict[str, float] = {}
        self._max_reconnect_delay = 30.0

        # Callbacks
        self.on_ticker: Callable[[NormalizedTicker], Awaitable[None]] | None = None
        self.on_candle: Callable[[NormalizedCandle], Awaitable[None]] | None = None
        self.on_orderbook: Callable[[NormalizedOrderBook], Awaitable[None]] | None = None

    async def start(self, symbols: list[str], intervals: list[str] | None = None):
        """Start WebSocket subscriptions for all configured exchanges."""
        self._running = True
        intervals = intervals or ["1m", "5m", "15m"]

        tasks = []
        for ex in self.exchanges:
            if ex == "binance":
                tasks.append(self._run_binance(symbols, intervals))
            elif ex == "okx":
                tasks.append(self._run_okx(symbols, intervals))
            elif ex == "bybit":
                tasks.append(self._run_bybit(symbols, intervals))

        await asyncio.gather(*tasks, return_exceptions=True)

    async def stop(self):
        """Stop all WebSocket connections."""
        self._running = False
        for ws in self._ws_connections.values():
            try:
                await ws.close()
            except Exception as e:
                logger.debug(f"WS close error: {e}")

    async def _run_binance(self, symbols: list[str], intervals: list[str]):
        """Binance Futures WebSocket feed."""
        try:
            import websockets
        except ImportError:
            logger.error("websockets not installed")
            return

        # Build combined stream URL
        streams = []
        for sym in symbols:
            sym_lower = sym.lower()
            streams.append(f"{sym_lower}@bookTicker")
            streams.append(f"{sym_lower}@aggTrade")
            for iv in intervals:
                streams.append(f"{sym_lower}@kline_{iv}")

        if self.testnet:
            url = "wss://stream.binancefuture.com/stream?streams=" + "/".join(streams)
        else:
            url = "wss://fstream.binance.com/stream?streams=" + "/".join(streams)

        while self._running:
            try:
                async with websockets.connect(url, ping_interval=20) as ws:
                    self._ws_connections["binance"] = ws
                    self._reconnect_delays["binance"] = 1.0
                    logger.info(f"Binance WebSocket connected: {len(streams)} streams")

                    async for raw in ws:
                        if not self._running:
                            break
                        msg = json.loads(raw)
                        await self._handle_binance_msg(msg)

            except Exception as e:
                logger.error(f"Binance WS error: {e}")
                if self._running:
                    delay = self._reconnect_delays.get("binance", 1.0)
                    await asyncio.sleep(delay)
                    self._reconnect_delays["binance"] = min(delay * 2, self._max_reconnect_delay)

    async def _handle_binance_msg(self, msg: dict):
        """Handle Binance combined stream message."""
        stream = msg.get("stream", "")
        data = msg.get("data", {})

        if "@bookTicker" in stream:
            symbol = data.get("s", "")
            ticker = NormalizedTicker(
                exchange="binance",
                symbol=symbol,
                bid=float(data.get("b", 0)),
                ask=float(data.get("a", 0)),
                last=float(data.get("a", 0)),
                volume=0.0,
                timestamp=int(data.get("T", time.time() * 1000)),
            )
            if self.on_ticker:
                await self.on_ticker(ticker)

        elif "@kline_" in stream:
            k = data.get("k", {})
            symbol = data.get("s", "")
            interval = stream.split("@kline_")[-1]
            candle = NormalizedCandle(
                exchange="binance",
                symbol=symbol,
                interval=interval,
                open=float(k.get("o", 0)),
                high=float(k.get("h", 0)),
                low=float(k.get("l", 0)),
                close=float(k.get("c", 0)),
                volume=float(k.get("v", 0)),
                time=int(k.get("t", 0)),
            )
            if self.on_candle:
                await self.on_candle(candle)

    async def _run_okx(self, symbols: list[str], intervals: list[str]):
        """OKX Futures WebSocket feed."""
        try:
            import websockets
        except ImportError:
            return

        url = "wss://ws.okx.com:8443/ws/v5/public"

        while self._running:
            try:
                async with websockets.connect(url, ping_interval=20) as ws:
                    self._ws_connections["okx"] = ws
                    self._reconnect_delays["okx"] = 1.0

                    # Subscribe to tickers and candles
                    sub_args = []
                    for sym in symbols:
                        inst_id = self._to_okx_inst_id(sym)
                        sub_args.append({"channel": "tickers", "instId": inst_id})
                        for iv in intervals:
                            sub_args.append({"channel": f"candle{iv}",
                                           "instId": inst_id})

                    await ws.send(json.dumps({"op": "subscribe", "args": sub_args}))
                    logger.info("OKX WebSocket connected")

                    async for raw in ws:
                        if not self._running:
                            break
                        msg = json.loads(raw)
                        await self._handle_okx_msg(msg)

            except Exception as e:
                logger.error(f"OKX WS error: {e}")
                if self._running:
                    delay = self._reconnect_delays.get("okx", 1.0)
                    await asyncio.sleep(delay)
                    self._reconnect_delays["okx"] = min(delay * 2, self._max_reconnect_delay)

    async def _handle_okx_msg(self, msg: dict):
        """Handle OKX WebSocket message."""
        channel = msg.get("arg", {}).get("channel", "")
        data = msg.get("data", [])

        if channel == "tickers" and data:
            d = data[0]
            inst_id = d.get("instId", "")
            ticker = NormalizedTicker(
                exchange="okx",
                symbol=inst_id,
                bid=float(d.get("bidPx", 0)),
                ask=float(d.get("askPx", 0)),
                last=float(d.get("last", 0)),
                volume=float(d.get("vol24h", 0)),
                timestamp=int(d.get("ts", time.time() * 1000)),
            )
            if self.on_ticker:
                await self.on_ticker(ticker)

        elif channel.startswith("candle") and data:
            d = data[0]
            # OKX candle format: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
            inst_id = msg.get("arg", {}).get("instId", "")
            interval = channel.replace("candle", "").lower()
            candle = NormalizedCandle(
                exchange="okx",
                symbol=inst_id,
                interval=interval,
                open=float(d[1]),
                high=float(d[2]),
                low=float(d[3]),
                close=float(d[4]),
                volume=float(d[5]),
                time=int(d[0]),
            )
            if self.on_candle:
                await self.on_candle(candle)

    async def _run_bybit(self, symbols: list[str], intervals: list[str]):
        """Bybit Futures WebSocket feed."""
        try:
            import websockets
        except ImportError:
            return

        url = "wss://stream.bybit.com/v5/public/linear"

        while self._running:
            try:
                async with websockets.connect(url, ping_interval=20) as ws:
                    self._ws_connections["bybit"] = ws
                    self._reconnect_delays["bybit"] = 1.0

                    # Subscribe
                    sub_args = []
                    for sym in symbols:
                        sub_args.append(f"orderbook.50.{sym}")
                        sub_args.append(f"tickers.{sym}")
                        for iv in intervals:
                            sub_args.append(f"kline.{iv}.{sym}")

                    await ws.send(json.dumps({"op": "subscribe", "args": sub_args}))
                    logger.info("Bybit WebSocket connected")

                    async for raw in ws:
                        if not self._running:
                            break
                        msg = json.loads(raw)
                        await self._handle_bybit_msg(msg)

            except Exception as e:
                logger.error(f"Bybit WS error: {e}")
                if self._running:
                    delay = self._reconnect_delays.get("bybit", 1.0)
                    await asyncio.sleep(delay)
                    self._reconnect_delays["bybit"] = min(delay * 2, self._max_reconnect_delay)

    async def _handle_bybit_msg(self, msg: dict):
        """Handle Bybit WebSocket message."""
        topic = msg.get("topic", "")
        data = msg.get("data", {})

        if topic.startswith("tickers."):
            symbol = topic.replace("tickers.", "")
            ticker = NormalizedTicker(
                exchange="bybit",
                symbol=symbol,
                bid=float(data.get("bid1Price", 0)),
                ask=float(data.get("ask1Price", 0)),
                last=float(data.get("lastPrice", 0)),
                volume=float(data.get("volume24h", 0)),
                timestamp=int(data.get("ts", time.time() * 1000)),
            )
            if self.on_ticker:
                await self.on_ticker(ticker)

        elif topic.startswith("orderbook."):
            symbol = topic.split(".")[-1]
            bids = [(float(p), float(q)) for p, q in data.get("b", [])[:20]]
            asks = [(float(p), float(q)) for p, q in data.get("a", [])[:20]]
            ob = NormalizedOrderBook(
                exchange="bybit",
                symbol=symbol,
                bids=bids,
                asks=asks,
                timestamp=int(msg.get("ts", time.time() * 1000)),
            )
            if self.on_orderbook:
                await self.on_orderbook(ob)

        elif topic.startswith("kline."):
            parts = topic.split(".")
            interval = parts[1]
            symbol = parts[2]
            for k in data:
                candle = NormalizedCandle(
                    exchange="bybit",
                    symbol=symbol,
                    interval=interval,
                    open=float(k.get("open", 0)),
                    high=float(k.get("high", 0)),
                    low=float(k.get("low", 0)),
                    close=float(k.get("close", 0)),
                    volume=float(k.get("volume", 0)),
                    time=int(k.get("start", 0)),
                )
                if self.on_candle:
                    await self.on_candle(candle)

    @staticmethod
    def _to_okx_inst_id(symbol: str) -> str:
        """Convert BTCUSDT → BTC-USDT-SWAP."""
        if symbol.endswith("USDT"):
            base = symbol[:-4]
            return f"{base}-USDT-SWAP"
        return symbol


class RealMarketDataManager:
    """Pull-based market data manager wrapping RealMarketDataFeed.

    Caches latest data from WebSocket callbacks and provides synchronous-style
    accessors (get_ticker, get_orderbook, get_candles) as expected by
    RealExchangeAdapter.
    """

    def __init__(self, exchange: str = "binance",
                 api_key: str = "", api_secret: str = "",
                 testnet: bool = False, symbols: list[str] | None = None):
        self.exchange_name = exchange
        self._symbols = symbols or []
        self._feed = RealMarketDataFeed(exchanges=[exchange], testnet=testnet)
        self._tickers: dict[str, NormalizedTicker] = {}
        self._orderbooks: dict[str, NormalizedOrderBook] = {}
        self._candles: dict[str, list[NormalizedCandle]] = {}
        self._running = False

        async def _on_ticker(t: NormalizedTicker):
            self._tickers[t.symbol] = t

        async def _on_candle(c: NormalizedCandle):
            key = f"{c.symbol}:{c.interval}"
            clist = self._candles.setdefault(key, [])
            clist.append(c)
            if len(clist) > 1000:
                clist.pop(0)

        async def _on_orderbook(ob: NormalizedOrderBook):
            self._orderbooks[ob.symbol] = ob

        self._feed.on_ticker = _on_ticker
        self._feed.on_candle = _on_candle
        self._feed.on_orderbook = _on_orderbook

    async def initialize(self) -> None:
        """Start WebSocket feed in background."""
        self._running = True
        self._feed_task = asyncio.create_task(
            self._feed.start(symbols=self._symbols, intervals=["1m", "5m", "15m"])
        )
        logger.info(f"[RealMarketData] Feed started for {self.exchange_name} symbols={self._symbols}")

    async def close(self) -> None:
        """Stop WebSocket feed."""
        self._running = False
        await self._feed.stop()
        if hasattr(self, "_feed_task"):
            self._feed_task.cancel()
            try:
                await self._feed_task
            except asyncio.CancelledError:
                pass

    async def get_ticker(self, symbol: str) -> dict:
        t = self._tickers.get(symbol)
        if t:
            return {"symbol": t.symbol, "bid": t.bid, "ask": t.ask,
                    "last": t.last, "volume": t.volume, "timestamp": t.timestamp}
        return {}

    async def get_orderbook(self, symbol: str, depth: int = 10) -> dict:
        ob = self._orderbooks.get(symbol)
        if ob:
            return {"symbol": ob.symbol,
                    "bids": ob.bids[:depth], "asks": ob.asks[:depth],
                    "timestamp": ob.timestamp}
        return {}

    async def get_candles(self, symbol: str, timeframe: str = "1m",
                          limit: int = 100) -> list[dict]:
        key = f"{symbol}:{timeframe}"
        clist = self._candles.get(key, [])
        return [{"timestamp": c.time, "open": c.open, "high": c.high,
                 "low": c.low, "close": c.close, "volume": c.volume}
                for c in clist[-limit:]]

    async def start_feed(self, symbols: list[str]) -> None:
        """Start feed with specific symbols (call after initialize or instead)."""
        if not self._running:
            self._running = True
            self._feed_task = asyncio.create_task(
                self._feed.start(symbols=symbols, intervals=["1m", "5m", "15m"])
            )
