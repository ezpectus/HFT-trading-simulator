"""RealMarketDataManager — pull-based cache over RealMarketDataFeed."""

from __future__ import annotations

import asyncio
from collections import deque

from src.data_collection.market_data_feed import RealMarketDataFeed
from src.data_collection.market_data_types import (
    NormalizedCandle,
    NormalizedOrderBook,
    NormalizedTicker,
)
from src.observability.logging import get_logger

logger = get_logger(__name__)


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
        self._candles: dict[str, deque[NormalizedCandle]] = {}
        self._running = False

        async def _on_ticker(t: NormalizedTicker):
            self._tickers[t.symbol] = t

        async def _on_candle(c: NormalizedCandle):
            key = f"{c.symbol}:{c.interval}"
            clist = self._candles.get(key)
            if clist is None:
                clist = deque(maxlen=1000)
                self._candles[key] = clist
            clist.append(c)

        async def _on_orderbook(ob: NormalizedOrderBook):
            self._orderbooks[ob.symbol] = ob

        self._feed.on_ticker = _on_ticker
        self._feed.on_candle = _on_candle
        self._feed.on_orderbook = _on_orderbook

    async def initialize(self) -> None:
        """Start WebSocket feed in background."""
        await self.start_feed(self._symbols)
        logger.info("[RealMarketData] Feed started for %s symbols=%s", self.exchange_name, self._symbols)

    async def _ensure_started(self) -> None:
        """Lazy-start the feed on first read — adapters that only place
        orders never pay for sockets whose caches nobody reads."""
        if not self._running:
            await self.initialize()

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
        await self._ensure_started()
        t = self._tickers.get(symbol)
        if t:
            return {"symbol": t.symbol, "bid": t.bid, "ask": t.ask,
                    "last": t.last, "volume": t.volume, "timestamp": t.timestamp}
        return {}

    async def get_orderbook(self, symbol: str, depth: int = 10) -> dict:
        await self._ensure_started()
        ob = self._orderbooks.get(symbol)
        if ob:
            return {"symbol": ob.symbol,
                    "bids": ob.bids[:depth], "asks": ob.asks[:depth],
                    "timestamp": ob.timestamp}
        return {}

    async def get_candles(self, symbol: str, timeframe: str = "1m",
                          limit: int = 100) -> list[dict]:
        await self._ensure_started()
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
        else:
            logger.warning("[RealMarketData] Feed already running — call close() first")
