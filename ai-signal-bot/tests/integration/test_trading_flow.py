"""Integration tests — end-to-end flow tests using mocks."""

import pytest
import asyncio
from tests.mocks.mock_objects import (
    MockExchange, MockWebSocket, MockDatabase, MockSHM, make_mock_candles,
)


@pytest.mark.asyncio
async def test_exchange_to_signal_flow():
    """Test market data → signal generation → order placement flow."""
    exchange = MockExchange(symbol="BTCUSDT", start_price=50000.0)
    await exchange.initialize()

    ticker = await exchange.get_ticker("BTCUSDT")
    assert ticker["price"] == 50000.0

    order = await exchange.place_order("BTCUSDT", "BUY", 0.1, "market")
    assert order["status"] == "filled"
    assert order["side"] == "BUY"

    await exchange.close()


@pytest.mark.asyncio
async def test_database_persistence_flow():
    """Test signal → database → retrieval flow."""
    db = MockDatabase()
    await db.initialize()

    signal = {
        "timestamp": 1234567890,
        "symbol": "BTCUSDT",
        "strategy": "trend_following",
        "action": "LONG",
        "confidence": 85.0,
        "price": 50000.0,
    }
    await db.insert("signals", signal)
    assert await db.count("signals") == 1

    rows = await db.select("signals", where={"symbol": "BTCUSDT"})
    assert len(rows) == 1
    assert rows[0]["action"] == "LONG"

    await db.close()


@pytest.mark.asyncio
async def test_shm_signal_flow():
    """Test SHM ring buffer push/pop cycle."""
    shm = MockSHM(capacity=16)

    for i in range(10):
        msg = {"type": "signal", "symbol": "BTCUSDT", "action": "LONG", "seq": i}
        assert shm.try_push(msg)

    assert shm.size() == 10

    first = shm.try_pop()
    assert first is not None
    assert first["seq"] == 0

    assert shm.size() == 9


@pytest.mark.asyncio
async def test_websocket_broadcast_flow():
    """Test WebSocket message broadcast."""
    ws = MockWebSocket()
    await ws.start(8766)
    assert ws.is_connected

    msg = {"type": "signal", "symbol": "BTCUSDT", "action": "LONG", "confidence": 85}
    await ws.send(msg)
    assert len(ws.messages_sent) == 1
    assert ws.messages_sent[0]["action"] == "LONG"

    await ws.stop()
    assert not ws.is_connected


@pytest.mark.asyncio
async def test_full_trading_cycle():
    """Test full cycle: market data → signal → order → fill → DB persist."""
    exchange = MockExchange(start_price=50000.0)
    db = MockDatabase()
    shm = MockSHM(capacity=64)
    await exchange.initialize()
    await db.initialize()

    # 1. Get market data
    ticker = await exchange.get_ticker("BTCUSDT")
    price = ticker["price"]

    # 2. Generate signal (simplified)
    signal = {"symbol": "BTCUSDT", "action": "LONG", "confidence": 80, "price": price}
    await db.insert("signals", signal)
    shm.try_push(signal)

    # 3. Place order
    order = await exchange.place_order("BTCUSDT", "BUY", 0.1, "market", price)

    # 4. Record fill
    fill = {"order_id": order["order_id"], "symbol": "BTCUSDT", "side": "BUY",
            "qty": 0.1, "price": price, "timestamp": 1234567890}
    await db.insert("trades", fill)

    # 5. Verify
    assert await db.count("signals") == 1
    assert await db.count("trades") == 1
    assert shm.size() == 1

    trades = await db.select("trades")
    assert trades[0]["side"] == "BUY"

    await exchange.close()
    await db.close()
