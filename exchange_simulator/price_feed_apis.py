"""Price feed API implementations for Binance and Coinbase.

Extracted from price_feed_manager.py for file-size compliance.
Contains BasePriceAPI, BinanceAPI, and CoinbaseAPI.
"""
import asyncio
import json
import logging
import time
from abc import ABC, abstractmethod

import aiohttp
import websockets

from exchange_simulator.price_feed_models import (
    APIHealth,
    APIStatus,
    PriceTick,
    logger,
)


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
        self._symbol_map: dict[str, str] = {}
        self._reverse_map: dict[str, str] = {}
        self._ws_task: asyncio.Task | None = None
        self._ws_callbacks: list = []

    def _normalize_symbol(self, symbol: str) -> str:
        """Convert BTC/USDT to btcusdt."""
        return symbol.replace("/", "").lower()

    def _denormalize_symbol(self, binance_symbol: str) -> str:
        """Convert btcusdt to BTC/USDT."""
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
                        retry_count = 0

                        async for message in ws:
                            data = json.loads(message) if isinstance(message, (str, bytes)) else message
                            if "s" in data:
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
        coinbase_symbols = [self._normalize_symbol(s) for s in symbols]

        async def _ws_handler():
            retry_count = 0
            max_retries = 5
            base_delay = 1.0

            while retry_count < max_retries:
                try:
                    async with websockets.connect(self._ws_base) as ws:
                        logger.info(f"Coinbase WebSocket connected")

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
