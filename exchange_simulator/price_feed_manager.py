"""Price Feed Manager -- Multi-API real-time cryptocurrency price feeds.

Manages connections to multiple cryptocurrency exchange APIs for real-time
price data. Supports WebSocket and REST APIs with automatic failover,
rate limiting, data normalization, and caching.

Refactored: data models -> price_feed_models.py,
API implementations -> price_feed_apis.py.
"""

import asyncio
import time

import aiohttp
import msgpack
from cachetools import TTLCache

from exchange_simulator.price_feed_apis import BasePriceAPI, BinanceAPI, CoinbaseAPI
from exchange_simulator.price_feed_models import (
    APIHealth,
    APIStatus,
    PerformanceMetrics,
    PriceTick,
    logger,
    time_operation,
)

__all__ = [
    "APIStatus",
    "PriceTick",
    "APIHealth",
    "PerformanceMetrics",
    "time_operation",
    "BasePriceAPI",
    "BinanceAPI",
    "CoinbaseAPI",
    "PriceFeedManager",
]


class PriceFeedManager:
    """Manages multiple price feed APIs with automatic failover."""

    def __init__(
        self,
        symbols: list[str],
        enable_websocket: bool = True,
        enable_profiling: bool = False,
        config: dict | None = None,
    ):
        self.symbols = symbols
        self.enable_websocket = enable_websocket
        self.enable_profiling = enable_profiling
        self.config = config or {}
        self._apis: list[BasePriceAPI] = []
        self._current_api_index = 0
        self._cache_ttl = self.config.get("cache_ttl", 5.0)
        self._cache_max_size = self.config.get("cache_max_size", 1000)
        self._cache: TTLCache[str, PriceTick] = TTLCache(maxsize=self._cache_max_size, ttl=self._cache_ttl)
        self._last_cache_update: dict[str, float] = {}
        self._callbacks: list = []
        self._lock = asyncio.Lock()
        self._metrics = PerformanceMetrics() if enable_profiling else None

        self._connection_pool_size = self.config.get("connection_pool_size", 100)
        self._connection_timeout = self.config.get("connection_timeout", 30)

        self._use_msgpack = self.config.get("use_msgpack", False)
        self._cache_warm_on_startup = self.config.get("cache_warm_on_startup", False)

        self._apis = [
            BinanceAPI(
                connection_pool_size=self._connection_pool_size,
                connection_timeout=self._connection_timeout,
            ),
            CoinbaseAPI(
                connection_pool_size=self._connection_pool_size,
                connection_timeout=self._connection_timeout,
            ),
        ]

    async def __aenter__(self):
        """Async context manager entry."""
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()
        return False

    def get_connection_pool_stats(self) -> dict:
        """Get connection pool statistics for all APIs."""
        return {
            api.name: {
                "pool_size": api._connection_pool_size,
                "timeout": api._connection_timeout,
                "session_active": api._session is not None and not api._session.closed if api._session else False,
            }
            for api in self._apis
        }

    def get_cached_price(self, symbol: str) -> PriceTick | None:
        """Get price from cache if available and not expired."""
        try:
            return self._cache[symbol]
        except KeyError:
            return None

    def cache_price(self, symbol: str, price_data: PriceTick) -> None:
        """Cache price data with automatic TTL eviction."""
        self._cache[symbol] = price_data
        self._last_cache_update[symbol] = time.time()

    def get_cache_stats(self) -> dict:
        """Get cache statistics."""
        return {
            "size": len(self._cache),
            "max_size": self._cache.maxsize,
            "ttl": self._cache.ttl,
            "hits": self._metrics.cache_hits if self._metrics else 0,
            "misses": self._metrics.cache_misses if self._metrics else 0,
            "hit_rate": self._metrics.get_cache_hit_rate() if self._metrics else 0.0,
        }

    def clear_cache(self) -> None:
        """Clear all cached prices."""
        self._cache.clear()
        self._last_cache_update.clear()

    async def warm_cache(self, symbols: list[str] | None = None) -> None:
        """Pre-populate cache with current prices for specified symbols."""
        symbols_to_warm = symbols or self.symbols
        logger.info(f"Warming cache for {len(symbols_to_warm)} symbols")

        primary_api = self._apis[0]
        if primary_api.health.status != APIStatus.DOWN:
            try:
                batch_size = 20
                for i in range(0, len(symbols_to_warm), batch_size):
                    batch = symbols_to_warm[i : i + batch_size]
                    prices = await primary_api.get_prices(batch)
                    for symbol, tick in prices.items():
                        self.cache_price(symbol, tick)
                logger.info(f"Cache warmed for {len(symbols_to_warm)} symbols")
            except (OSError, RuntimeError, KeyError, ValueError, TypeError) as e:
                logger.error(f"Failed to warm cache: {e}")

    def _serialize_price_tick(self, tick: PriceTick) -> bytes:
        """Serialize PriceTick to bytes using MessagePack."""
        data = {
            "symbol": tick.symbol,
            "price": tick.price,
            "timestamp": tick.timestamp,
            "exchange": tick.exchange,
            "volume": tick.volume,
            "bid": tick.bid,
            "ask": tick.ask,
        }
        return msgpack.packb(data, use_bin_type=True)

    def _deserialize_price_tick(self, data: bytes) -> PriceTick:
        """Deserialize bytes to PriceTick using MessagePack."""
        unpacked = msgpack.unpackb(data, raw=False)
        return PriceTick(**unpacked)

    def add_callback(self, callback) -> None:
        """Add a callback for price updates."""
        self._callbacks.append(callback)

    async def get_price(self, symbol: str) -> PriceTick | None:
        """Get current price with automatic failover."""
        async with self._lock:
            cached = self.get_cached_price(symbol)
            if cached:
                if self._metrics:
                    self._metrics.record_cache_hit()
                return cached
            else:
                if self._metrics:
                    self._metrics.record_cache_miss()

        for i, api in enumerate(self._apis):
            if api.health.status == APIStatus.DOWN:
                if self._metrics and i > 0:
                    self._metrics.record_failover()
                continue

            try:
                tick = await api.get_price(symbol)
                if tick:
                    async with self._lock:
                        self.cache_price(symbol, tick)
                    return tick
            except (OSError, RuntimeError, KeyError, ValueError, TypeError, aiohttp.ClientError) as e:
                logger.error(f"API {api.name} failed for {symbol}: {e}")
                if self._metrics:
                    self._metrics.record_api_error(api.name)
                if i > 0 and self._metrics:
                    self._metrics.record_failover()

        return None

    async def start(self) -> None:
        """Start all price feed connections."""
        logger.info(f"Starting price feed manager for {len(self.symbols)} symbols")

        if self.enable_websocket:
            primary_api = self._apis[0]
            await primary_api.subscribe_websocket(self.symbols, self._on_price_update)

        if self._cache_warm_on_startup:
            await self.warm_cache()
        await self._populate_cache()

    async def _populate_cache(self) -> None:
        """Populate cache with current prices from all APIs."""
        for api in self._apis:
            try:
                prices = await api.get_prices(self.symbols)
                for symbol, tick in prices.items():
                    self.cache_price(symbol, tick)
                if prices:
                    logger.info(f"Cache populated from {api.name} for {len(prices)} symbols")
                    break
            except (OSError, RuntimeError, KeyError, ValueError, TypeError, aiohttp.ClientError) as e:
                logger.error(f"Failed to populate cache from {api.name}: {e}")

    async def _on_price_update(self, tick: PriceTick) -> None:
        """Handle price update from WebSocket."""
        async with self._lock:
            self._cache[tick.symbol] = tick
            self._last_cache_update[tick.symbol] = time.time()
            if self._metrics:
                self._metrics.record_cache_hit()

        for callback in self._callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(tick)
                else:
                    callback(tick)
            except (TypeError, ValueError, RuntimeError, OSError) as e:
                logger.error(f"Price update callback error: {e}")

    def get_health_status(self) -> dict[str, dict]:
        """Get health status of all APIs."""
        return {
            api.name: {
                "status": api.health.status.value,
                "last_success": api.health.last_success,
                "last_error": api.health.last_error,
                "error_count": api.health.error_count,
            }
            for api in self._apis
        }

    async def get_all_prices(self) -> dict[str, PriceTick]:
        """Get all current prices using smart batching."""
        result = {}

        primary_api = self._apis[0]
        if primary_api.health.status != APIStatus.DOWN:
            try:
                prices = await primary_api.get_prices(self.symbols)
                result.update(prices)
                if len(result) == len(self.symbols):
                    return result
            except (OSError, RuntimeError, KeyError, ValueError, TypeError, aiohttp.ClientError) as e:
                logger.error(f"Primary API batch fetch failed: {e}")

        if len(result) < len(self.symbols) and len(self._apis) > 1:
            remaining_symbols = [s for s in self.symbols if s not in result]
            fallback_api = self._apis[1]
            if fallback_api.health.status != APIStatus.DOWN:
                try:
                    prices = await fallback_api.get_prices(remaining_symbols)
                    result.update(prices)
                except (OSError, RuntimeError, KeyError, ValueError, TypeError, aiohttp.ClientError) as e:
                    logger.error(f"Fallback API batch fetch failed: {e}")

        return result

    def get_metrics(self) -> dict | None:
        """Get performance metrics if profiling is enabled."""
        if self._metrics:
            return self._metrics.get_metrics()
        return None

    async def close(self) -> None:
        """Close all API connections."""
        for api in self._apis:
            await api.close()
        logger.info("Price feed manager closed")


async def main():
    """Test the price feed manager."""
    symbols = ["BTC/USDT", "ETH/USDT", "SOL/USDT"]
    manager = PriceFeedManager(symbols, enable_websocket=False)

    async def on_price(tick: PriceTick):
        print(f"Price update: {tick.symbol} = ${tick.price:.2f} from {tick.exchange}")

    manager.add_callback(on_price)
    await manager.start()

    for symbol in symbols:
        tick = await manager.get_price(symbol)
        if tick:
            print(f"{symbol}: ${tick.price:.2f}")

    print("\nHealth status:")
    for api_name, status in manager.get_health_status().items():
        print(f"  {api_name}: {status}")

    await manager.close()


if __name__ == "__main__":
    asyncio.run(main())
