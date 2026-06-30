"""Exchange adapter factory — configurable simulator vs real exchange.

Based on config, returns either a simulator adapter or real exchange adapter.
Supports multi-exchange and fallback from real to simulator.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Optional, Any, Protocol
from enum import Enum

import logging
logger = logging.getLogger(__name__)


class ExchangeMode(Enum):
    SIMULATOR = "simulator"
    REAL = "real"
    FALLBACK = "fallback"      # Try real, fall back to simulator


class ExchangeAdapter(Protocol):
    """Protocol for exchange adapters."""

    async def initialize(self) -> None: ...
    async def close(self) -> None: ...
    async def get_ticker(self, symbol: str) -> dict: ...
    async def get_orderbook(self, symbol: str, depth: int = 10) -> dict: ...
    async def get_candles(self, symbol: str, timeframe: str = "1m", limit: int = 100) -> list[dict]: ...
    async def place_order(self, symbol: str, side: str, qty: float,
                          order_type: str = "market", price: Optional[float] = None) -> Optional[dict]: ...
    async def cancel_order(self, order_id: str, symbol: str) -> bool: ...
    async def get_balance(self) -> list[dict]: ...
    async def get_positions(self) -> list[dict]: ...
    async def get_health(self) -> dict: ...


class SimulatorAdapter:
    """Exchange adapter wrapping the exchange simulator."""

    def __init__(self, simulator_url: str = "ws://localhost:8765"):
        self.simulator_url = simulator_url
        self._connected = False
        self.name = "simulator"

    async def initialize(self) -> None:
        self._connected = True
        logger.info(f"[SimulatorAdapter] Connected to simulator at {self.simulator_url}")

    async def close(self) -> None:
        self._connected = False

    async def get_ticker(self, symbol: str) -> dict:
        return {"symbol": symbol, "price": 50000.0, "bid": 49999.5, "ask": 50000.5, "timestamp": time.time()}

    async def get_orderbook(self, symbol: str, depth: int = 10) -> dict:
        return {"symbol": symbol, "bids": [], "asks": [], "timestamp": time.time()}

    async def get_candles(self, symbol: str, timeframe: str = "1m", limit: int = 100) -> list[dict]:
        return []

    async def place_order(self, symbol: str, side: str, qty: float,
                          order_type: str = "market", price: Optional[float] = None) -> Optional[dict]:
        return {"order_id": "sim_1", "symbol": symbol, "side": side, "status": "filled",
                "qty": qty, "price": price or 50000.0}

    async def cancel_order(self, order_id: str, symbol: str) -> bool:
        return True

    async def get_balance(self) -> list[dict]:
        return [{"asset": "USDT", "free": 100000, "used": 0, "total": 100000}]

    async def get_positions(self) -> list[dict]:
        return []

    async def get_health(self) -> dict:
        return {"connected": self._connected, "exchange": "simulator"}


class RealExchangeAdapter:
    """Exchange adapter wrapping real exchange connections."""

    def __init__(self, exchange: str = "binance", api_key: str = "", api_secret: str = "",
                 testnet: bool = False):
        self.exchange_name = exchange
        self._market_data = None
        self._account = None
        self.name = exchange
        self._api_key = api_key
        self._api_secret = api_secret
        self._testnet = testnet

    async def initialize(self) -> None:
        from src.data_collection.real_market_data import RealMarketDataManager
        from src.data_collection.real_account import RealAccountManager

        self._market_data = RealMarketDataManager(
            exchange=self.exchange_name, api_key=self._api_key, api_secret=self._api_secret
        )
        self._account = RealAccountManager(
            exchange=self.exchange_name, api_key=self._api_key,
            api_secret=self._api_secret, testnet=self._testnet
        )
        await self._market_data.initialize()
        await self._account.initialize()
        logger.info(f"[RealExchangeAdapter] Connected to {self.exchange_name}")

    async def close(self) -> None:
        if self._market_data:
            await self._market_data.close()
        if self._account:
            await self._account.close()

    async def get_ticker(self, symbol: str) -> dict:
        if not self._market_data:
            return {}
        return await self._market_data.get_ticker(symbol)

    async def get_orderbook(self, symbol: str, depth: int = 10) -> dict:
        if not self._market_data:
            return {}
        return await self._market_data.get_orderbook(symbol, depth)

    async def get_candles(self, symbol: str, timeframe: str = "1m", limit: int = 100) -> list[dict]:
        if not self._market_data:
            return []
        return await self._market_data.get_candles(symbol, timeframe, limit)

    async def place_order(self, symbol: str, side: str, qty: float,
                          order_type: str = "market", price: Optional[float] = None) -> Optional[dict]:
        if not self._account:
            return None
        return await self._account.place_order(symbol, side, qty, order_type, price)

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

    async def get_health(self) -> dict:
        if not self._account:
            return {"connected": False, "reason": "Not initialized"}
        return await self._account.get_health()


class ExchangeFactory:
    """Factory for creating exchange adapters based on configuration."""

    def __init__(self, mode: ExchangeMode = ExchangeMode.SIMULATOR,
                 exchange: str = "binance",
                 api_key: str = "", api_secret: str = "",
                 testnet: bool = False,
                 simulator_url: str = "ws://localhost:8765"):
        self.mode = mode
        self.exchange = exchange
        self.api_key = api_key
        self.api_secret = api_secret
        self.testnet = testnet
        self.simulator_url = simulator_url
        self._adapter: Optional[ExchangeAdapter] = None
        self._simulator_adapter: Optional[SimulatorAdapter] = None

    async def create(self) -> ExchangeAdapter:
        """Create and initialize the appropriate exchange adapter."""
        if self.mode == ExchangeMode.SIMULATOR:
            self._adapter = SimulatorAdapter(self.simulator_url)
            await self._adapter.initialize()
            return self._adapter

        elif self.mode == ExchangeMode.REAL:
            self._adapter = RealExchangeAdapter(
                exchange=self.exchange, api_key=self.api_key,
                api_secret=self.api_secret, testnet=self.testnet
            )
            await self._adapter.initialize()
            return self._adapter

        elif self.mode == ExchangeMode.FALLBACK:
            # Try real first, fall back to simulator
            try:
                self._adapter = RealExchangeAdapter(
                    exchange=self.exchange, api_key=self.api_key,
                    api_secret=self.api_secret, testnet=self.testnet
                )
                await self._adapter.initialize()
                # Verify health
                health = await self._adapter.get_health()
                if health.get("connected"):
                    logger.info("[ExchangeFactory] Using real exchange (primary)")
                    return self._adapter
                else:
                    raise ConnectionError("Health check failed")
            except Exception as e:
                logger.warning(f"[ExchangeFactory] Real exchange failed ({e}), falling back to simulator")
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
