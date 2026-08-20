"""Price Feed Manager — Multi-API real-time cryptocurrency price feeds.

Manages connections to multiple cryptocurrency exchange APIs for real-time
price data. Supports WebSocket and REST APIs with automatic failover,
rate limiting, data normalization, and caching.

Supported APIs:
- Binance (WebSocket + REST)
- Coinbase Pro (WebSocket + REST)
- Kraken (REST)
- Additional APIs can be added

Features:
- Automatic failover between APIs
- Rate limit handling per API
- Data normalization across exchanges
- Caching layer for reduced API calls
- Error handling with exponential backoff retry
- WebSocket reconnection logic
"""

import asyncio
import functools
import json
import logging
import statistics
import time
from abc import ABC, abstractmethod
from collections import defaultdict, deque
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable

import aiohttp
import msgpack
import websockets
from cachetools import TTLCache

logger = logging.getLogger("exchange_simulator.price_feed")


class APIStatus(Enum):
    """Status of an API connection."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"
    RATE_LIMITED = "rate_limited"


@dataclass
class PriceTick:
    """Normalized price tick from any exchange."""
    symbol: str
    price: float
    timestamp: float
    exchange: str
    volume: float = 0.0
    bid: float = 0.0
    ask: float = 0.0


@dataclass
class APIHealth:
    """Health status of an API endpoint."""
    status: APIStatus
    last_success: float
    last_error: str | None = None
    error_count: int = 0
    consecutive_failures: int = 0


class PerformanceMetrics:
    """Tracks performance metrics for price feed operations."""

    def __init__(self):
        self.fetch_latencies: deque[float] = deque(maxlen=10000)
        self.parse_latencies: deque[float] = deque(maxlen=10000)
        self.cache_hits: int = 0
        self.cache_misses: int = 0
        self.failover_count: int = 0
        self.api_errors: dict[str, int] = defaultdict(int)
        self._max_samples: int = 10000

    def record_fetch_latency(self, latency_ms: float) -> None:
        """Record a fetch operation latency."""
        self.fetch_latencies.append(latency_ms)

    def record_parse_latency(self, latency_ms: float) -> None:
        """Record a parse operation latency."""
        self.parse_latencies.append(latency_ms)

    def record_cache_hit(self) -> None:
        """Record a cache hit."""
        self.cache_hits += 1

    def record_cache_miss(self) -> None:
        """Record a cache miss."""
        self.cache_misses += 1

    def record_failover(self) -> None:
        """Record a failover event."""
        self.failover_count += 1

    def record_api_error(self, api_name: str) -> None:
        """Record an API error."""
        self.api_errors[api_name] += 1

    def get_fetch_p50(self) -> float:
        """Get p50 fetch latency in milliseconds."""
        if not self.fetch_latencies:
            return 0.0
        return statistics.median(self.fetch_latencies)

    def get_fetch_p95(self) -> float:
        """Get p95 fetch latency in milliseconds."""
        if not self.fetch_latencies:
            return 0.0
        sorted_latencies = sorted(self.fetch_latencies)
        idx = int(len(sorted_latencies) * 0.95)
        return sorted_latencies[min(idx, len(sorted_latencies) - 1)]

    def get_fetch_p99(self) -> float:
        """Get p99 fetch latency in milliseconds."""
        if not self.fetch_latencies:
            return 0.0
        sorted_latencies = sorted(self.fetch_latencies)
        idx = int(len(sorted_latencies) * 0.99)
        return sorted_latencies[min(idx, len(sorted_latencies) - 1)]

    def get_parse_p50(self) -> float:
        """Get p50 parse latency in milliseconds."""
        if not self.parse_latencies:
            return 0.0
        return statistics.median(self.parse_latencies)

    def get_parse_p95(self) -> float:
        """Get p95 parse latency in milliseconds."""
        if not self.parse_latencies:
            return 0.0
        sorted_latencies = sorted(self.parse_latencies)
        idx = int(len(sorted_latencies) * 0.95)
        return sorted_latencies[min(idx, len(sorted_latencies) - 1)]

    def get_parse_p99(self) -> float:
        """Get p99 parse latency in milliseconds."""
        if not self.parse_latencies:
            return 0.0
        sorted_latencies = sorted(self.parse_latencies)
        idx = int(len(sorted_latencies) * 0.99)
        return sorted_latencies[min(idx, len(sorted_latencies) - 1)]

    def get_cache_hit_rate(self) -> float:
        """Get cache hit rate as a percentage."""
        total = self.cache_hits + self.cache_misses
        if total == 0:
            return 0.0
        return (self.cache_hits / total) * 100.0

    def get_metrics(self) -> dict:
        """Get all performance metrics as a dictionary."""
        return {
            "fetch_latencies": {
                "p50_ms": self.get_fetch_p50(),
                "p95_ms": self.get_fetch_p95(),
                "p99_ms": self.get_fetch_p99(),
                "count": len(self.fetch_latencies),
            },
            "parse_latencies": {
                "p50_ms": self.get_parse_p50(),
                "p95_ms": self.get_parse_p95(),
                "p99_ms": self.get_parse_p99(),
                "count": len(self.parse_latencies),
            },
            "cache": {
                "hit_rate_pct": self.get_cache_hit_rate(),
                "hits": self.cache_hits,
                "misses": self.cache_misses,
            },
            "failover_count": self.failover_count,
            "api_errors": dict(self.api_errors),
        }

    def reset(self) -> None:
        """Reset all metrics."""
        self.fetch_latencies.clear()
        self.parse_latencies.clear()
        self.cache_hits = 0
        self.cache_misses = 0
        self.failover_count = 0
        self.api_errors.clear()


def time_operation(operation_name: str, metrics: PerformanceMetrics) -> Callable:
    """Decorator to time operations and record latency."""

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            start_time = time.perf_counter()
            try:
                result = await func(*args, **kwargs)
                latency_ms = (time.perf_counter() - start_time) * 1000
                if "fetch" in operation_name.lower():
                    metrics.record_fetch_latency(latency_ms)
                elif "parse" in operation_name.lower():
                    metrics.record_parse_latency(latency_ms)
                return result
            except (OSError, RuntimeError, KeyError, ValueError, TypeError) as e:
                latency_ms = (time.perf_counter() - start_time) * 1000
                logger.error(f"{operation_name} failed after {latency_ms:.2f}ms: {e}")
                raise

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            start_time = time.perf_counter()
            try:
                result = func(*args, **kwargs)
                latency_ms = (time.perf_counter() - start_time) * 1000
                if "fetch" in operation_name.lower():
                    metrics.record_fetch_latency(latency_ms)
                elif "parse" in operation_name.lower():
                    metrics.record_parse_latency(latency_ms)
                return result
            except (OSError, RuntimeError, KeyError, ValueError, TypeError) as e:
                latency_ms = (time.perf_counter() - start_time) * 1000
                logger.error(f"{operation_name} failed after {latency_ms:.2f}ms: {e}")
                raise

        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper

    return decorator


class BasePriceAPI(ABC):
    """Abstract base class for price feed APIs."""

    def __init__(
        self,
        name: str,
        rate_limit: int = 1200,
        connection_pool_size: int = 100,
        connection_timeout: int = 30,
    ):
        self.name = name
        self.rate_limit = rate_limit  # requests per minute
        self._request_count = 0
        self._request_window = 60.0
        self._window_start = time.time()
        self._health = APIHealth(APIStatus.HEALTHY, time.time())
        self._connection_pool_size = connection_pool_size
        self._connection_timeout = connection_timeout
        self._session: aiohttp.ClientSession | None = None

    async def get_session(self) -> aiohttp.ClientSession:
        """Get or create HTTP session with connection pooling."""
        if self._session is None or self._session.closed:
            connector = aiohttp.TCPConnector(
                limit=self._connection_pool_size,
                limit_per_host=self._connection_pool_size,
                ttl_dns_cache=300,
                use_dns_cache=True,
            )
            timeout = aiohttp.ClientTimeout(total=self._connection_timeout)
            self._session = aiohttp.ClientSession(connector=connector, timeout=timeout)
        return self._session

    async def close(self) -> None:
        """Close HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()

    async def __aenter__(self):
        """Async context manager entry."""
        await self.get_session()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()

    def _check_rate_limit(self) -> bool:
        """Check if we're within rate limits."""
        now = time.time()
        if now - self._window_start >= self._request_window:
            self._request_count = 0
            self._window_start = now
            return True
        return self._request_count < self.rate_limit

    def _record_request(self) -> None:
        """Record a request for rate limiting."""
        self._request_count += 1

    def _record_success(self) -> None:
        """Record a successful request."""
        self._health.status = APIStatus.HEALTHY
        self._health.last_success = time.time()
        self._health.consecutive_failures = 0

    def _record_error(self, error: str) -> None:
        """Record an error."""
        self._health.last_error = error
        self._health.error_count += 1
        self._health.consecutive_failures += 1
        if self._health.consecutive_failures >= 3:
            self._health.status = APIStatus.DOWN
        elif self._health.consecutive_failures >= 1:
            self._health.status = APIStatus.DEGRADED

    @abstractmethod
    async def get_price(self, symbol: str) -> PriceTick | None:
        """Get current price for a symbol."""
        pass

    @abstractmethod
    async def get_prices(self, symbols: list[str]) -> dict[str, PriceTick]:
        """Get current prices for multiple symbols."""
        pass

    @abstractmethod
    async def subscribe_websocket(self, symbols: list[str], callback) -> None:
        """Subscribe to WebSocket updates for symbols."""
        pass

    @property
    def health(self) -> APIHealth:
        return self._health


class BinanceAPI(BasePriceAPI):
    """Binance API implementation (WebSocket + REST)."""

    def __init__(
        self,
        connection_pool_size: int = 100,
        connection_timeout: int = 30,
    ):
        super().__init__(
            "binance",
            rate_limit=1200,
            connection_pool_size=connection_pool_size,
            connection_timeout=connection_timeout,
        )
        self._rest_base = "https://api.binance.com/api/v3"
        self._ws_base = "wss://stream.binance.com:9443/ws"
        self._symbol_map: dict[str, str] = {}  # normalized -> binance format
        self._reverse_map: dict[str, str] = {}  # binance -> normalized
        self._ws_task: asyncio.Task | None = None
        self._ws_callbacks: list = []

    def _normalize_symbol(self, symbol: str) -> str:
        """Convert BTC/USDT to btcusdt."""
        return symbol.replace("/", "").lower()

    def _denormalize_symbol(self, binance_symbol: str) -> str:
        """Convert btcusdt to BTC/USDT."""
        # Simple heuristic: insert / before quote currency
        for quote in ["USDT", "BUSD", "USDC", "BTC", "ETH"]:
            if binance_symbol.upper().endswith(quote):
                base = binance_symbol[:-len(quote)]
                return f"{base.upper()}/{quote}"
        return binance_symbol.upper()

    async def get_price(self, symbol: str) -> PriceTick | None:
        """Get current price from REST API."""
        if not self._check_rate_limit():
            logger.warning(f"Binance rate limit reached")
            self._health.status = APIStatus.RATE_LIMITED
            return None

        binance_symbol = self._normalize_symbol(symbol)
        url = f"{self._rest_base}/ticker/price?symbol={binance_symbol.upper()}"

        try:
            session = await self.get_session()
            self._record_request()
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status == 429:
                    self._health.status = APIStatus.RATE_LIMITED
                    self._record_error("Rate limited")
                    return None
                resp.raise_for_status()
                data = await resp.json()
                self._record_success()
                return PriceTick(
                    symbol=symbol,
                    price=float(data["price"]),
                    timestamp=time.time(),
                    exchange="binance",
                )
        except (OSError, RuntimeError, KeyError, ValueError, TypeError, aiohttp.ClientError) as e:
            self._record_error(str(e))
            logger.error(f"Binance API error for {symbol}: {e}")
            return None

    async def get_prices(self, symbols: list[str]) -> dict[str, PriceTick]:
        """Get prices for multiple symbols."""
        if not self._check_rate_limit():
            logger.warning("Binance rate limit reached")
            self._health.status = APIStatus.RATE_LIMITED
            return {}

        binance_symbols = ",".join([self._normalize_symbol(s).upper() for s in symbols])
        url = f"{self._rest_base}/ticker/price?symbols=[{binance_symbols}]"

        try:
            session = await self.get_session()
            self._record_request()
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status == 429:
                    self._health.status = APIStatus.RATE_LIMITED
                    self._record_error("Rate limited")
                    return {}
                resp.raise_for_status()
                data = await resp.json()
                self._record_success()
                result = {}
                for item in data:
                    binance_sym = item["symbol"]
                    norm_sym = self._denormalize_symbol(binance_sym)
                    if norm_sym in symbols:
                        result[norm_sym] = PriceTick(
                            symbol=norm_sym,
                            price=float(item["price"]),
                            timestamp=time.time(),
                            exchange="binance",
                        )
                return result
        except (OSError, RuntimeError, KeyError, ValueError, TypeError, aiohttp.ClientError) as e:
            self._record_error(str(e))
            logger.error(f"Binance batch API error: {e}")
            return {}

    async def subscribe_websocket(self, symbols: list[str], callback) -> None:
        """Subscribe to Binance WebSocket for real-time updates."""
        streams = [f"{self._normalize_symbol(s).lower()}@ticker" for s in symbols]
        url = f"{self._ws_base}/{'/'.join(streams)}"
        self._ws_callbacks.append(callback)

        async def _ws_handler():
            retry_count = 0
            max_retries = 5
            base_delay = 1.0

            while retry_count < max_retries:
                try:
                    async with websockets.connect(url, ping_interval=20) as ws:
                        logger.info(f"Binance WebSocket connected for {len(symbols)} symbols")
                        retry_count = 0  # Reset on successful connection

                        async for message in ws:
                            data = json.loads(message) if isinstance(message, (str, bytes)) else message
                            if "s" in data:  # ticker format
                                binance_sym = data["s"]
                                norm_sym = self._denormalize_symbol(binance_sym)
                                tick = PriceTick(
                                    symbol=norm_sym,
                                    price=float(data["c"]),
                                    timestamp=float(data["E"]) / 1000,
                                    exchange="binance",
                                    volume=float(data["v"]),
                                    bid=float(data["b"]),
                                    ask=float(data["a"]),
                                )
                                for cb in self._ws_callbacks:
                                    try:
                                        await cb(tick)
                                    except (TypeError, ValueError, RuntimeError, OSError) as e:
                                        logger.error(f"WebSocket callback error: {e}")

                except (OSError, RuntimeError, websockets.WebSocketException, asyncio.TimeoutError) as e:
                    retry_count += 1
                    delay = base_delay * (2 ** retry_count)
                    logger.error(f"Binance WebSocket error (attempt {retry_count}/{max_retries}): {e}")
                    logger.info(f"Reconnecting in {delay}s...")
                    await asyncio.sleep(delay)

            logger.error("Binance WebSocket max retries exceeded")

        self._ws_task = asyncio.create_task(_ws_handler())

    async def close(self) -> None:
        """Close WebSocket and HTTP session."""
        if self._ws_task:
            self._ws_task.cancel()
            try:
                await self._ws_task
            except asyncio.CancelledError:
                pass
        await super().close()


class CoinbaseAPI(BasePriceAPI):
    """Coinbase Pro API implementation (WebSocket + REST)."""

    def __init__(
        self,
        connection_pool_size: int = 100,
        connection_timeout: int = 30,
    ):
        super().__init__(
            "coinbase",
            rate_limit=1000,
            connection_pool_size=connection_pool_size,
            connection_timeout=connection_timeout,
        )
        self._rest_base = "https://api.exchange.coinbase.com"
        self._ws_base = "wss://ws-feed.exchange.coinbase.com"
        self._symbol_map: dict[str, str] = {}
        self._ws_task: asyncio.Task | None = None

    def _normalize_symbol(self, symbol: str) -> str:
        """Convert BTC/USDT to BTC-USDT."""
        return symbol.replace("/", "-")

    def _denormalize_symbol(self, coinbase_symbol: str) -> str:
        """Convert BTC-USDT to BTC/USDT."""
        return coinbase_symbol.replace("-", "/")

    async def get_price(self, symbol: str) -> PriceTick | None:
        """Get current price from REST API."""
        if not self._check_rate_limit():
            return None

        coinbase_symbol = self._normalize_symbol(symbol)
        url = f"{self._rest_base}/products/{coinbase_symbol}/ticker"

        try:
            session = await self.get_session()
            self._record_request()
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status == 429:
                    self._health.status = APIStatus.RATE_LIMITED
                    return None
                resp.raise_for_status()
                data = await resp.json()
                self._record_success()
                return PriceTick(
                    symbol=symbol,
                    price=float(data["price"]),
                    timestamp=time.time(),
                    exchange="coinbase",
                )
        except (OSError, RuntimeError, KeyError, ValueError, TypeError, aiohttp.ClientError) as e:
            self._record_error(str(e))
            logger.error(f"Coinbase API error for {symbol}: {e}")
            return None

    async def get_prices(self, symbols: list[str]) -> dict[str, PriceTick]:
        """Get prices for multiple symbols using concurrent requests."""
        tasks = [self.get_price(symbol) for symbol in symbols]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        result = {}
        for symbol, tick in zip(symbols, results):
            if isinstance(tick, Exception):
                logger.error(f"Error fetching {symbol}: {tick}")
            elif tick:
                result[symbol] = tick
        return result

    async def subscribe_websocket(self, symbols: list[str], callback) -> None:
        """Subscribe to Coinbase WebSocket."""
        # Coinbase requires subscription message after connection
        coinbase_symbols = [self._normalize_symbol(s) for s in symbols]

        async def _ws_handler():
            retry_count = 0
            max_retries = 5
            base_delay = 1.0

            while retry_count < max_retries:
                try:
                    async with websockets.connect(self._ws_base) as ws:
                        logger.info(f"Coinbase WebSocket connected")

                        # Subscribe to ticker channels
                        subscribe_msg = {
                            "type": "subscribe",
                            "product_ids": coinbase_symbols,
                            "channels": ["ticker"],
                        }
                        await ws.send(json.dumps(subscribe_msg))

                        retry_count = 0

                        async for message in ws:
                            data = json.loads(message) if isinstance(message, (str, bytes)) else message
                            if data.get("type") == "ticker":
                                product_id = data.get("product_id", "")
                                norm_sym = self._denormalize_symbol(product_id)
                                tick = PriceTick(
                                    symbol=norm_sym,
                                    price=float(data.get("price", 0)),
                                    timestamp=time.time(),
                                    exchange="coinbase",
                                    volume=float(data.get("volume_24h", 0)),
                                    bid=float(data.get("best_bid", 0)),
                                    ask=float(data.get("best_ask", 0)),
                                )
                                try:
                                    await callback(tick)
                                except (TypeError, ValueError, RuntimeError, OSError) as e:
                                    logger.error(f"WebSocket callback error: {e}")

                except (OSError, RuntimeError, websockets.WebSocketException, asyncio.TimeoutError) as e:
                    retry_count += 1
                    delay = base_delay * (2 ** retry_count)
                    logger.error(f"Coinbase WebSocket error (attempt {retry_count}/{max_retries}): {e}")
                    await asyncio.sleep(delay)

        self._ws_task = asyncio.create_task(_ws_handler())

    async def close(self) -> None:
        """Close WebSocket and HTTP session."""
        if self._ws_task:
            self._ws_task.cancel()
            try:
                await self._ws_task
            except asyncio.CancelledError:
                pass
        await super().close()


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

        # Connection pool configuration
        self._connection_pool_size = self.config.get("connection_pool_size", 100)
        self._connection_timeout = self.config.get("connection_timeout", 30)

        # MessagePack configuration for binary serialization
        self._use_msgpack = self.config.get("use_msgpack", False)
        self._cache_warm_on_startup = self.config.get("cache_warm_on_startup", False)

        # Initialize APIs in priority order
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

        # Use batch fetch for efficiency
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
            # Check cache first using TTLCache (auto-handles TTL)
            cached = self.get_cached_price(symbol)
            if cached:
                if self._metrics:
                    self._metrics.record_cache_hit()
                return cached
            else:
                if self._metrics:
                    self._metrics.record_cache_miss()

        # Try APIs in order with failover
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
            # Subscribe to WebSocket for primary API
            primary_api = self._apis[0]
            await primary_api.subscribe_websocket(self.symbols, self._on_price_update)

        
        # Warm cache if configured
        if self._cache_warm_on_startup:
            await self.warm_cache()
        # Initial cache population
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

        # Forward to callbacks
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
        
        # Try primary API with batching first
        primary_api = self._apis[0]
        if primary_api.health.status != APIStatus.DOWN:
            try:
                prices = await primary_api.get_prices(self.symbols)
                result.update(prices)
                if len(result) == len(self.symbols):
                    return result
            except (OSError, RuntimeError, KeyError, ValueError, TypeError, aiohttp.ClientError) as e:
                logger.error(f"Primary API batch fetch failed: {e}")
        
        # If not all symbols fetched, try fallback API for remaining
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

    # Test getting prices
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
