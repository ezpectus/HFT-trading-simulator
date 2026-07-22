"""Mock objects for testing — mock exchange, mock WebSocket, mock database."""

from __future__ import annotations

import asyncio
import json
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any


class MockExchange:
    """Mock exchange for testing — simulates REST + WS responses."""

    def __init__(self, symbol: str = "BTCUSDT", start_price: float = 50000.0):
        self.symbol = symbol
        self.price = start_price
        self.balance = {"USDT": 100000.0, "BTC": 0.0}
        self.positions = []
        self.orders = []
        self.trades = []
        self._order_id = 1
        self._connected = True

    async def initialize(self) -> None:
        pass

    async def close(self) -> None:
        self._connected = False

    async def get_ticker(self, symbol: str) -> dict:
        return {"symbol": symbol, "price": self.price, "bid": self.price - 0.5, "ask": self.price + 0.5}

    async def get_balance(self) -> list[dict]:
        return [{"asset": k, "free": v, "used": 0, "total": v} for k, v in self.balance.items()]

    async def place_order(self, symbol: str, side: str, qty: float,
                          order_type: str = "market", price: float = None) -> dict:
        oid = f"mock_{self._order_id}"
        self._order_id += 1
        fill_price = price or self.price
        order = {"order_id": oid, "symbol": symbol, "side": side, "type": order_type,
                 "quantity": qty, "price": fill_price, "status": "filled"}
        self.orders.append(order)
        self.trades.append({"order_id": oid, "symbol": symbol, "side": side,
                            "qty": qty, "price": fill_price, "timestamp": time.time()})
        return order

    async def cancel_order(self, order_id: str, symbol: str) -> bool:
        return True

    async def get_positions(self) -> list[dict]:
        return self.positions

    async def get_health(self) -> dict:
        return {"connected": self._connected, "exchange": "mock"}


class MockWebSocket:
    """Mock WebSocket server for testing signal/fill communication."""

    def __init__(self):
        self.messages_sent: list[dict] = []
        self.messages_received: list[dict] = []
        self._connected = False
        self._subscribers: list = []

    async def start(self, port: int = 8766) -> None:
        self._connected = True

    async def stop(self) -> None:
        self._connected = False

    async def send(self, message: dict) -> None:
        self.messages_sent.append(message)

    async def receive(self) -> dict | None:
        if self.messages_received:
            return self.messages_received.pop(0)
        return None

    def push_message(self, message: dict) -> None:
        """Push a message to be received by the consumer."""
        self.messages_received.append(message)

    @property
    def is_connected(self) -> bool:
        return self._connected


class MockDatabase:
    """Mock database for testing — in-memory storage."""

    def __init__(self):
        self.tables: dict[str, list[dict]] = defaultdict(list)
        self._connected = True

    async def initialize(self) -> None:
        self._connected = True

    async def close(self) -> None:
        self._connected = False

    async def insert(self, table: str, record: dict) -> int:
        self.tables[table].append(record)
        return len(self.tables[table])

    async def select(self, table: str, limit: int = 100, where: dict = None) -> list[dict]:
        rows = self.tables[table]
        if where:
            rows = [r for r in rows if all(r.get(k) == v for k, v in where.items())]
        return rows[-limit:]

    async def count(self, table: str) -> int:
        return len(self.tables[table])

    async def delete(self, table: str, where: dict = None) -> int:
        if not where:
            count = len(self.tables[table])
            self.tables[table] = []
            return count
        before = len(self.tables[table])
        self.tables[table] = [r for r in self.tables[table]
                              if not all(r.get(k) == v for k, v in where.items())]
        return before - len(self.tables[table])

    @property
    def is_connected(self) -> bool:
        return self._connected


class MockSHM:
    """Mock shared memory ring buffer for testing."""

    def __init__(self, capacity: int = 1024):
        self.capacity = capacity
        self.buffer: list = []
        self._head = 0
        self._tail = 0

    def try_push(self, item: Any) -> bool:
        if len(self.buffer) >= self.capacity:
            return False
        self.buffer.append(item)
        self._head += 1
        return True

    def try_pop(self) -> Any | None:
        if not self.buffer:
            return None
        item = self.buffer.pop(0)
        self._tail += 1
        return item

    def size(self) -> int:
        return len(self.buffer)

    def empty(self) -> bool:
        return len(self.buffer) == 0

    def full(self) -> bool:
        return len(self.buffer) >= self.capacity


def make_mock_candles(n: int = 100, start_price: float = 50000.0, volatility: float = 0.002) -> list[dict]:
    """Generate realistic mock candle data."""
    import random
    rng = random.Random(42)
    candles = []
    price = start_price
    for i in range(n):
        ret = rng.gauss(0, volatility)
        o = price
        c = price * (1 + ret)
        h = max(o, c) * (1 + abs(rng.gauss(0, volatility * 0.5)))
        low = min(o, c) * (1 - abs(rng.gauss(0, volatility * 0.5)))
        candles.append({
            "timestamp": i * 60,
            "open": round(o, 2), "high": round(h, 2),
            "low": round(low, 2), "close": round(c, 2),
            "volume": rng.uniform(50, 200),
        })
        price = c
    return candles
