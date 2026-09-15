"""Tests for RealMarketDataManager lazy feed start (S345).

The manager opens real exchange WebSocket feeds — before S345 the
adapter started them eagerly at connect time while every read accessor
had zero production callers. Now the feed starts on the first read:
order-only adapters pay no sockets.
"""
import pytest

from src.data_collection.market_data_manager import RealMarketDataManager


@pytest.fixture
def manager():
    return RealMarketDataManager(exchange="binance", symbols=["BTCUSDT"])


class TestLazyStart:
    @pytest.mark.asyncio
    async def test_construction_starts_no_feed(self, manager):
        assert manager._running is False
        assert not hasattr(manager, "_feed_task")

    @pytest.mark.asyncio
    async def test_first_getter_starts_feed(self, manager):
        import asyncio

        started = []

        async def fake_start(**kw):
            started.append(kw)

        manager._feed.start = fake_start
        await manager.get_ticker("BTCUSDT")
        assert manager._running is True
        await asyncio.sleep(0)  # let the created feed task run
        assert len(started) == 1
        assert started[0]["symbols"] == ["BTCUSDT"]

    @pytest.mark.asyncio
    async def test_second_getter_does_not_restart(self, manager):
        import asyncio

        calls = []

        async def fake_start(**kw):
            calls.append(kw)

        manager._feed.start = fake_start
        await manager.get_ticker("BTCUSDT")
        await manager.get_orderbook("BTCUSDT")
        await manager.get_candles("BTCUSDT")
        await asyncio.sleep(0)
        assert len(calls) == 1  # started once, not per getter

    @pytest.mark.asyncio
    async def test_getters_return_empty_before_data(self, manager):
        async def fake_start(**kw):
            pass

        manager._feed.start = fake_start
        assert await manager.get_ticker("BTCUSDT") == {}
        assert await manager.get_orderbook("BTCUSDT") == {}
        assert await manager.get_candles("BTCUSDT") == []

    @pytest.mark.asyncio
    async def test_close_never_started_is_safe(self, manager):
        await manager.close()  # must not raise on a never-started feed

    @pytest.mark.asyncio
    async def test_initialize_is_explicit_start(self, manager):
        import asyncio

        started = []

        async def fake_start(**kw):
            started.append(kw)

        manager._feed.start = fake_start
        await manager.initialize()
        assert manager._running is True
        await asyncio.sleep(0)
        assert len(started) == 1


class TestCaches:
    @pytest.mark.asyncio
    async def test_ticker_callback_populates_get_ticker(self, manager):
        from src.data_collection.market_data_types import NormalizedTicker

        async def noop(**kw):
            pass

        manager._feed.start = noop
        await manager._feed.on_ticker(NormalizedTicker(
            exchange="binance", symbol="BTCUSDT",
            bid=1.0, ask=2.0, last=1.5, volume=0.0, timestamp=1700))
        t = await manager.get_ticker("BTCUSDT")
        assert t["last"] == 1.5
        assert t["bid"] == 1.0
        assert t["ask"] == 2.0
