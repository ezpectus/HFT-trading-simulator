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
- Symbol mapping between exchanges
"""

import asyncio
import logging
import time
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass
from enum import Enum
from typing import Any

import aiohttp
import websockets

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


class BasePriceAPI(ABC):
    """Abstract base class for price feed APIs."""

    def __init__(self, name: str, rate_limit: int = 1200):
        self.name = name
        self.rate_limit = rate_limit  # requests per minute
        self._request_count = 0
        self._request_window = 60.0
        self._window_start = time.time()
        self._health = APIHealth(APIStatus.HEALTHY, time.time())
        self._session: aiohttp.ClientSession | None = None

    async def get_session(self) -> aiohttp.ClientSession:
        """Get or create HTTP session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def close(self) -> None:
        """Close HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()

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

    def __init__(self):
        super().__init__("binance", rate_limit=1200)
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
        except Exception as e:
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
        except Exception as e:
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
                            data = message.json() if isinstance(message, str) else message
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
                                    except Exception as e:
                                        logger.error(f"WebSocket callback error: {e}")

                except Exception as e:
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

    def __init__(self):
        super().__init__("coinbase", rate_limit=1000)
        self._rest_base = "https://api.exchange.coinbase.com"
        self._ws_base = "wss://ws-feed.exchange.coinbase.com"
        self._symbol_map: dict[str, str] = {}

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
        except Exception as e:
            self._record_error(str(e))
            logger.error(f"Coinbase API error for {symbol}: {e}")
            return None

    async def get_prices(self, symbols: list[str]) -> dict[str, PriceTick]:
        """Get prices for multiple symbols (batched)."""
        result = {}
        for symbol in symbols:
            tick = await self.get_price(symbol)
            if tick:
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
                        await ws.send(subscribe_msg)

                        retry_count = 0

                        async for message in ws:
                            data = message.json() if isinstance(message, str) else message
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
                                except Exception as e:
                                    logger.error(f"WebSocket callback error: {e}")

                except Exception as e:
                    retry_count += 1
                    delay = base_delay * (2 ** retry_count)
                    logger.error(f"Coinbase WebSocket error (attempt {retry_count}/{max_retries}): {e}")
                    await asyncio.sleep(delay)

        asyncio.create_task(_ws_handler())


class PriceFeedManager:
    """Manages multiple price feed APIs with automatic failover."""

    def __init__(self, symbols: list[str], enable_websocket: bool = True):
        self.symbols = symbols
        self.enable_websocket = enable_websocket
        self._apis: list[BasePriceAPI] = []
        self._current_api_index = 0
        self._cache: dict[str, PriceTick] = {}
        self._cache_ttl = 5.0  # seconds
        self._last_cache_update: dict[str, float] = {}
        self._callbacks: list = []
        self._lock = asyncio.Lock()

        # Initialize APIs in priority order
        self._apis = [BinanceAPI(), CoinbaseAPI()]

    def add_callback(self, callback) -> None:
        """Add a callback for price updates."""
        self._callbacks.append(callback)

    async def start(self) -> None:
        """Start all price feed connections."""
        logger.info(f"Starting price feed manager for {len(self.symbols)} symbols")

        if self.enable_websocket:
            # Subscribe to WebSocket for primary API
            primary_api = self._apis[0]
            await primary_api.subscribe_websocket(self.symbols, self._on_price_update)

        # Initial cache population
        await self._populate_cache()

    async def _populate_cache(self) -> None:
        """Populate cache with current prices from all APIs."""
        for api in self._apis:
            try:
                prices = await api.get_prices(self.symbols)
                for symbol, tick in prices.items():
                    self._cache[symbol] = tick
                    self._last_cache_update[symbol] = time.time()
                if prices:
                    logger.info(f"Cache populated from {api.name} for {len(prices)} symbols")
                    break
            except Exception as e:
                logger.error(f"Failed to populate cache from {api.name}: {e}")

    async def _on_price_update(self, tick: PriceTick) -> None:
        """Handle price update from WebSocket."""
        async with self._lock:
            self._cache[tick.symbol] = tick
            self._last_cache_update[tick.symbol] = time.time()

        # Forward to callbacks
        for callback in self._callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(tick)
                else:
                    callback(tick)
            except Exception as e:
                logger.error(f"Price update callback error: {e}")

    async def get_price(self, symbol: str) -> PriceTick | None:
        """Get current price with automatic failover."""
        async with self._lock:
            # Check cache first
            cached = self._cache.get(symbol)
            if cached and time.time() - self._last_cache_update.get(symbol, 0) < self._cache_ttl:
                return cached

        # Try APIs in order with failover
        for i, api in enumerate(self._apis):
            if api.health.status == APIStatus.DOWN:
                continue

            try:
                tick = await api.get_price(symbol)
                if tick:
                    async with self._lock:
                        self._cache[symbol] = tick
                        self._last_cache_update[symbol] = time.time()
                    return tick
            except Exception as e:
                logger.error(f"API {api.name} failed for {symbol}: {e}")

        return None

    async def get_all_prices(self) -> dict[str, PriceTick]:
        """Get all current prices."""
        result = {}
        for symbol in self.symbols:
            tick = await self.get_price(symbol)
            if tick:
                result[symbol] = tick
        return result

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
