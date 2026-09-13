"""Exchange adapter factory — configurable simulator vs real exchange.

Based on config, returns either a simulator adapter or real exchange adapter.
Supports multi-exchange and fallback from real to simulator.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from enum import Enum
from typing import Protocol, TypedDict

import websockets

from src.observability.logging import get_logger

logger = get_logger(__name__)


class ExchangeMode(Enum):
    SIMULATOR = "simulator"
    REAL = "real"
    FALLBACK = "fallback"      # Try real, fall back to simulator


class TickerData(TypedDict, total=False):
    symbol: str
    price: float
    bid: float
    ask: float
    timestamp: float


class OrderbookData(TypedDict, total=False):
    symbol: str
    bids: list[list[float]]
    asks: list[list[float]]
    timestamp: float


class AdapterHealth(TypedDict, total=False):
    connected: bool
    exchange: str
    reason: str
    last_msg_age_s: float


class ExchangeAdapter(Protocol):
    """Protocol for exchange adapters."""

    async def initialize(self) -> None: ...
    async def close(self) -> None: ...
    async def get_ticker(self, symbol: str) -> TickerData: ...
    async def get_orderbook(self, symbol: str, depth: int = 10) -> OrderbookData: ...
    async def get_candles(self, symbol: str, timeframe: str = "1m", limit: int = 100) -> list[dict]: ...
    async def place_order(self, symbol: str, side: str, qty: float,
                          order_type: str = "market", price: float | None = None) -> dict | None: ...
    async def cancel_order(self, order_id: str, symbol: str) -> bool: ...
    async def get_balance(self) -> list[dict]: ...
    async def get_positions(self) -> list[dict]: ...
    async def get_health(self) -> AdapterHealth: ...


class SimulatorAdapter:
    """Exchange adapter over the exchange simulator's WebSocket feed.

    Subscribes to the simulator broadcast ({"type":"candles"} carries
    prices/candles/orderbooks/accounts) and caches the latest snapshot.
    Orders go through the same socket and resolve on the fill/error reply.

    Note: the simulator has no cancel endpoint — cancel_order() honestly
    returns False instead of pretending the order was cancelled.
    """

    _MAX_CANDLE_CACHE = 500

    def __init__(self, simulator_url: str | None = None, sim_prices: dict[str, float] | None = None):
        self.simulator_url = simulator_url or os.environ.get("WS_URL", "ws://localhost:8765")
        self.name = "simulator"
        self._ws = None
        self._recv_task: asyncio.Task | None = None
        self._connected = False
        self._last_msg_ts = 0.0
        # Latest broadcast cache, keyed "exchange|symbol"
        self._prices: dict[str, float] = dict(sim_prices or {})
        self._candles: dict[str, list[dict]] = {}
        self._orderbooks: dict[str, dict] = {}
        self._accounts: dict[str, dict] = {}
        self._default_exchange: str | None = None
        # FIFO queue of futures for order responses (fill/error arrive on
        # the same connection, in order)
        self._pending_orders: list[asyncio.Future] = []

    async def initialize(self) -> None:
        self._ws = await websockets.connect(self.simulator_url, ping_interval=10)
        self._connected = True
        self._recv_task = asyncio.create_task(self._recv_loop())
        logger.info("[SimulatorAdapter] Connected to simulator at %s", self.simulator_url)

    async def close(self) -> None:
        self._connected = False
        if self._recv_task:
            self._recv_task.cancel()
            try:
                await self._recv_task
            except asyncio.CancelledError:
                pass
            self._recv_task = None
        if self._ws is not None:
            await self._ws.close()
            self._ws = None
        for fut in self._pending_orders:
            if not fut.done():
                fut.set_result(None)
        self._pending_orders.clear()

    async def _recv_loop(self) -> None:
        try:
            async for raw in self._ws:
                self._last_msg_ts = time.monotonic()
                try:
                    msg = json.loads(raw)
                except (ValueError, TypeError):
                    continue
                msg_type = msg.get("type")
                if msg_type == "candles":
                    self._update_market_cache(msg)
                elif msg_type in ("fill", "error", "order_cancelled") and self._pending_orders:
                    fut = self._pending_orders.pop(0)
                    if not fut.done():
                        fut.set_result(msg)
        except asyncio.CancelledError:
            raise
        except (OSError, websockets.ConnectionClosed) as e:
            logger.warning("[SimulatorAdapter] Simulator connection lost: %s", e)
        finally:
            self._connected = False
            for fut in self._pending_orders:
                if not fut.done():
                    fut.set_result(None)
            self._pending_orders.clear()

    def _update_market_cache(self, msg: dict) -> None:
        for ex_id, by_symbol in (msg.get("prices") or {}).items():
            if self._default_exchange is None:
                self._default_exchange = ex_id
            for sym, price in (by_symbol or {}).items():
                self._prices[f"{ex_id}|{sym}"] = price
        for candle in msg.get("candles") or []:
            key = f"{candle.get('exchange')}|{candle.get('symbol')}"
            hist = self._candles.setdefault(key, [])
            if hist and hist[-1].get("timestamp") == candle.get("timestamp"):
                hist[-1] = candle  # in-place update of the current candle
            else:
                hist.append(candle)
                if len(hist) > self._MAX_CANDLE_CACHE:
                    del hist[: len(hist) - self._MAX_CANDLE_CACHE]
        for key, ob in (msg.get("orderbooks") or {}).items():
            self._orderbooks[key] = ob
        for ex_id, status in (msg.get("accounts") or {}).items():
            self._accounts[ex_id] = status

    def _key(self, symbol: str) -> str:
        """Resolve 'BTC/USDT' to 'exchange|BTC/USDT' (first/default exchange)."""
        if "|" in symbol:
            return symbol
        if self._default_exchange:
            key = f"{self._default_exchange}|{symbol}"
            if key in self._prices or key in self._candles or key in self._orderbooks:
                return key
        for store in (self._prices, self._candles, self._orderbooks):
            for key in store:
                if key.endswith(f"|{symbol}"):
                    return key
        return f"{self._default_exchange or ''}|{symbol}"

    async def get_ticker(self, symbol: str) -> TickerData:
        price = self._prices.get(self._key(symbol))
        if price is None:
            return TickerData(symbol=symbol)
        return TickerData(symbol=symbol, price=price, bid=price - 0.5,
                          ask=price + 0.5, timestamp=time.time())

    async def get_orderbook(self, symbol: str, depth: int = 10) -> OrderbookData:
        ob = self._orderbooks.get(self._key(symbol))
        if not ob:
            return OrderbookData(symbol=symbol, bids=[], asks=[], timestamp=time.time())
        return OrderbookData(symbol=symbol,
                             bids=list(ob.get("bids", []))[:depth],
                             asks=list(ob.get("asks", []))[:depth],
                             timestamp=ob.get("timestamp", time.time()))

    async def get_candles(self, symbol: str, timeframe: str = "1m", limit: int = 100) -> list[dict]:
        return list(self._candles.get(self._key(symbol), []))[-limit:]

    async def place_order(self, symbol: str, side: str, qty: float,
                          order_type: str = "market", price: float | None = None,
                          client_order_id: str | None = None) -> dict | None:
        if self._ws is None or not self._connected:
            return None
        fut = asyncio.get_running_loop().create_future()
        self._pending_orders.append(fut)
        order = {
            "type": "order",
            "exchange": self._default_exchange or "binance",
            "symbol": symbol,
            "side": side.upper(),
            "quantity": qty,
            "order_type": order_type.upper(),
        }
        if price is not None:
            order["price"] = price
        if client_order_id is not None:
            # Sim dedups on this key — resubmits return the original fill.
            order["client_order_id"] = client_order_id
        try:
            await self._ws.send(json.dumps(order))
            msg = await asyncio.wait_for(fut, timeout=10.0)
        except (OSError, websockets.ConnectionClosed, asyncio.TimeoutError) as e:
            logger.warning("[SimulatorAdapter] Order failed: %s", e)
            if fut in self._pending_orders:
                self._pending_orders.remove(fut)
            return None
        if msg is None or msg.get("type") != "fill":
            return None
        return msg["order"]

    async def cancel_order(self, order_id: str, symbol: str) -> bool:
        # Protocol gained cancel_order in the S148 fix — replies arrive
        # in-order on the same socket, resolved via the pending FIFO.
        if self._ws is None or not self._connected:
            return False
        fut = asyncio.get_running_loop().create_future()
        self._pending_orders.append(fut)
        try:
            await self._ws.send(json.dumps({
                "type": "cancel_order",
                "exchange": self._default_exchange or "binance",
                "order_id": order_id,
                "symbol": symbol,
            }))
            msg = await asyncio.wait_for(fut, timeout=10.0)
        except (OSError, websockets.ConnectionClosed, asyncio.TimeoutError) as e:
            logger.warning("[SimulatorAdapter] Cancel failed: %s", e)
            if fut in self._pending_orders:
                self._pending_orders.remove(fut)
            return False
        return bool(msg and msg.get("type") == "order_cancelled")

    async def get_balance(self) -> list[dict]:
        status = self._accounts.get(self._default_exchange or "", {})
        if not status:
            return []
        balance = status.get("balance", 0.0)
        return [{"asset": status.get("currency", "USDT"), "free": balance,
                 "used": 0.0, "total": status.get("equity", balance)}]

    async def get_positions(self) -> list[dict]:
        status = self._accounts.get(self._default_exchange or "", {})
        return list(status.get("positions", []))

    async def get_health(self) -> AdapterHealth:
        if not self._connected:
            return AdapterHealth(connected=False, exchange="simulator",
                                 reason="Not connected")
        return AdapterHealth(connected=True, exchange="simulator",
                             last_msg_age_s=round(time.monotonic() - self._last_msg_ts, 3)
                             if self._last_msg_ts else -1.0)


class RealExchangeAdapter:
    """Exchange adapter wrapping real exchange connections."""

    def __init__(self, exchange: str = "binance", api_key: str = "", api_secret: str = "",
                 testnet: bool = False, symbols: list[str] | None = None,
                 rest_timeout: float = 10.0):
        self.exchange_name = exchange
        self._market_data = None
        self._account = None
        self.name = exchange
        self._api_key = api_key
        self._api_secret = api_secret
        self._testnet = testnet
        self._symbols = symbols or []
        self._rest_timeout = rest_timeout

    async def initialize(self) -> None:
        from src.data_collection.real_account import RealAccountManager
        from src.data_collection.real_market_data import RealMarketDataManager

        self._market_data = RealMarketDataManager(
            exchange=self.exchange_name, api_key=self._api_key, api_secret=self._api_secret,
            symbols=self._symbols,
        )
        self._account = RealAccountManager(
            exchange=self.exchange_name, api_key=self._api_key,
            api_secret=self._api_secret, testnet=self._testnet,
            rest_timeout=self._rest_timeout,
        )
        await self._market_data.initialize()
        await self._account.initialize()
        logger.info("[RealExchangeAdapter] Connected to %s", self.exchange_name)

    async def close(self) -> None:
        if self._market_data:
            await self._market_data.close()
        if self._account:
            await self._account.close()

    async def get_ticker(self, symbol: str) -> TickerData:
        if not self._market_data:
            return {}
        return await self._market_data.get_ticker(symbol)

    async def get_orderbook(self, symbol: str, depth: int = 10) -> OrderbookData:
        if not self._market_data:
            return {}
        return await self._market_data.get_orderbook(symbol, depth)

    async def get_candles(self, symbol: str, timeframe: str = "1m", limit: int = 100) -> list[dict]:
        if not self._market_data:
            return []
        return await self._market_data.get_candles(symbol, timeframe, limit)

    async def place_order(self, symbol: str, side: str, qty: float,
                          order_type: str = "market", price: float | None = None,
                          client_order_id: str | None = None) -> dict | None:
        if not self._account:
            return None
        return await self._account.place_order(symbol, side, qty, order_type, price,
                                               client_order_id=client_order_id)

    async def cancel_order(self, order_id: str, symbol: str) -> bool:
        if not self._account:
            return False
        return await self._account.cancel_order(order_id, symbol)

    async def get_balance(self) -> list[dict]:
        if not self._account:
            return []
        balances = await self._account.get_balance()
        return [b.to_dict() for b in balances]

    async def get_positions(self) -> list[dict]:
        if not self._account:
            return []
        positions = await self._account.get_positions()
        return [p.to_dict() for p in positions]

    async def get_health(self) -> AdapterHealth:
        if not self._account:
            return AdapterHealth(connected=False, reason="Not initialized")
        return await self._account.get_health()


class ExchangeFactory:
    """Factory for creating exchange adapters based on configuration."""

    def __init__(self, mode: ExchangeMode = ExchangeMode.SIMULATOR,
                 exchange: str = "binance",
                 api_key: str = "", api_secret: str = "",
                 testnet: bool = False,
                 simulator_url: str | None = None,
                 symbols: list[str] | None = None,
                 rest_timeout: float = 10.0):
        self.mode = mode
        self.exchange = exchange
        self.api_key = api_key or os.environ.get("EXCHANGE_API_KEY", "")
        self.api_secret = api_secret or os.environ.get("EXCHANGE_API_SECRET", "")
        self.testnet = testnet
        self.simulator_url = simulator_url or os.environ.get("WS_URL", "ws://localhost:8765")
        self.symbols = symbols or []
        self.rest_timeout = rest_timeout
        self._adapter: ExchangeAdapter | None = None
        self._simulator_adapter: SimulatorAdapter | None = None

    async def create(self) -> ExchangeAdapter:
        """Create and initialize the appropriate exchange adapter."""
        if self.mode == ExchangeMode.SIMULATOR:
            self._adapter = SimulatorAdapter(self.simulator_url)
            await self._adapter.initialize()
            return self._adapter

        elif self.mode == ExchangeMode.REAL:
            self._adapter = RealExchangeAdapter(
                exchange=self.exchange, api_key=self.api_key,
                api_secret=self.api_secret, testnet=self.testnet,
                symbols=self.symbols, rest_timeout=self.rest_timeout,
            )
            await self._adapter.initialize()
            return self._adapter

        elif self.mode == ExchangeMode.FALLBACK:
            # Try real first, fall back to simulator
            try:
                self._adapter = RealExchangeAdapter(
                    exchange=self.exchange, api_key=self.api_key,
                    api_secret=self.api_secret, testnet=self.testnet,
                    symbols=self.symbols, rest_timeout=self.rest_timeout,
                )
                await self._adapter.initialize()
                # Verify health
                health = await self._adapter.get_health()
                if health.get("connected"):
                    logger.info("[ExchangeFactory] Using real exchange (primary)")
                    return self._adapter
                else:
                    raise ConnectionError("Health check failed")
            except (ConnectionError, OSError, RuntimeError) as e:
                logger.warning("[ExchangeFactory] Real exchange failed (%s), falling back to simulator", e)
                if self._adapter and hasattr(self._adapter, "close"):
                    try:
                        await self._adapter.close()
                    except (OSError, RuntimeError) as close_err:
                        logger.warning("[ExchangeFactory] Failed to close real adapter: %s", close_err)
                self._adapter = SimulatorAdapter(self.simulator_url)
                await self._adapter.initialize()
                return self._adapter

        else:
            raise ValueError(f"Unknown exchange mode: {self.mode}")

    async def get_or_create_simulator(self) -> SimulatorAdapter:
        """Get or create a simulator adapter (for fallback)."""
        if not self._simulator_adapter:
            self._simulator_adapter = SimulatorAdapter(self.simulator_url)
            await self._simulator_adapter.initialize()
        return self._simulator_adapter

    async def switch_to_simulator(self) -> SimulatorAdapter:
        """Switch from real exchange to simulator (on failure)."""
        if self._adapter and hasattr(self._adapter, "close"):
            await self._adapter.close()
        self._adapter = await self.get_or_create_simulator()
        logger.info("[ExchangeFactory] Switched to simulator")
        return self._adapter

    async def close(self) -> None:
        """Close the current adapter."""
        if self._adapter and hasattr(self._adapter, "close"):
            await self._adapter.close()
        if self._simulator_adapter:
            await self._simulator_adapter.close()
