"""Tests for ExchangeFactory — simulator/real/fallback modes, adapter lifecycle."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.data_collection.exchange_factory import (
    ExchangeFactory,
    ExchangeMode,
    RealExchangeAdapter,
    SimulatorAdapter,
)


class TestExchangeMode:
    def test_values(self):
        assert ExchangeMode.SIMULATOR.value == "simulator"
        assert ExchangeMode.REAL.value == "real"
        assert ExchangeMode.FALLBACK.value == "fallback"


class TestSimulatorAdapter:
    @pytest.mark.asyncio
    async def test_initialize(self):
        adapter = SimulatorAdapter("ws://localhost:8765")
        await adapter.initialize()
        assert adapter._connected is True

    @pytest.mark.asyncio
    async def test_close(self):
        adapter = SimulatorAdapter()
        await adapter.initialize()
        await adapter.close()
        assert adapter._connected is False

    @pytest.mark.asyncio
    async def test_get_ticker(self):
        adapter = SimulatorAdapter()
        ticker = await adapter.get_ticker("BTC/USDT")
        assert ticker["symbol"] == "BTC/USDT"
        assert "price" in ticker
        assert "bid" in ticker
        assert "ask" in ticker

    @pytest.mark.asyncio
    async def test_get_orderbook(self):
        adapter = SimulatorAdapter()
        ob = await adapter.get_orderbook("BTC/USDT", depth=10)
        assert ob["symbol"] == "BTC/USDT"
        assert "bids" in ob
        assert "asks" in ob

    @pytest.mark.asyncio
    async def test_get_candles(self):
        adapter = SimulatorAdapter()
        candles = await adapter.get_candles("BTC/USDT", "1m", 100)
        assert isinstance(candles, list)

    @pytest.mark.asyncio
    async def test_place_order(self):
        adapter = SimulatorAdapter()
        order = await adapter.place_order("BTC/USDT", "BUY", 0.5)
        assert order["status"] == "filled"
        assert order["symbol"] == "BTC/USDT"

    @pytest.mark.asyncio
    async def test_cancel_order(self):
        adapter = SimulatorAdapter()
        result = await adapter.cancel_order("sim_1", "BTC/USDT")
        assert result is True

    @pytest.mark.asyncio
    async def test_get_balance(self):
        adapter = SimulatorAdapter()
        balances = await adapter.get_balance()
        assert len(balances) > 0
        assert "asset" in balances[0]

    @pytest.mark.asyncio
    async def test_get_positions(self):
        adapter = SimulatorAdapter()
        positions = await adapter.get_positions()
        assert isinstance(positions, list)

    @pytest.mark.asyncio
    async def test_get_health(self):
        adapter = SimulatorAdapter()
        await adapter.initialize()
        health = await adapter.get_health()
        assert health["connected"] is True
        assert health["exchange"] == "simulator"


class TestRealExchangeAdapter:
    @pytest.mark.asyncio
    async def test_not_initialized_returns_empty(self):
        adapter = RealExchangeAdapter(exchange="binance")
        ticker = await adapter.get_ticker("BTC/USDT")
        assert ticker == {}

    @pytest.mark.asyncio
    async def test_not_initialized_orderbook(self):
        adapter = RealExchangeAdapter()
        ob = await adapter.get_orderbook("BTC/USDT")
        assert ob == {}

    @pytest.mark.asyncio
    async def test_not_initialized_candles(self):
        adapter = RealExchangeAdapter()
        candles = await adapter.get_candles("BTC/USDT")
        assert candles == []

    @pytest.mark.asyncio
    async def test_not_initialized_place_order(self):
        adapter = RealExchangeAdapter()
        order = await adapter.place_order("BTC/USDT", "BUY", 0.5)
        assert order is None

    @pytest.mark.asyncio
    async def test_not_initialized_cancel(self):
        adapter = RealExchangeAdapter()
        result = await adapter.cancel_order("1", "BTC/USDT")
        assert result is False

    @pytest.mark.asyncio
    async def test_not_initialized_balance(self):
        adapter = RealExchangeAdapter()
        balances = await adapter.get_balance()
        assert balances == []

    @pytest.mark.asyncio
    async def test_not_initialized_positions(self):
        adapter = RealExchangeAdapter()
        positions = await adapter.get_positions()
        assert positions == []

    @pytest.mark.asyncio
    async def test_not_initialized_health(self):
        adapter = RealExchangeAdapter()
        health = await adapter.get_health()
        assert health["connected"] is False

    @pytest.mark.asyncio
    async def test_name_attribute(self):
        adapter = RealExchangeAdapter(exchange="okx")
        assert adapter.name == "okx"


class TestExchangeFactorySimulator:
    @pytest.mark.asyncio
    async def test_create_simulator(self):
        factory = ExchangeFactory(mode=ExchangeMode.SIMULATOR)
        adapter = await factory.create()
        assert isinstance(adapter, SimulatorAdapter)
        assert adapter._connected is True
        await factory.close()

    @pytest.mark.asyncio
    async def test_simulator_health(self):
        factory = ExchangeFactory(mode=ExchangeMode.SIMULATOR)
        adapter = await factory.create()
        health = await adapter.get_health()
        assert health["connected"] is True
        await factory.close()


class TestExchangeFactoryFallback:
    @pytest.mark.asyncio
    async def test_fallback_to_simulator_on_failure(self):
        factory = ExchangeFactory(mode=ExchangeMode.FALLBACK, exchange="binance")
        # RealExchangeAdapter.initialize will fail because no real API keys
        adapter = await factory.create()
        # Should fall back to simulator
        assert isinstance(adapter, SimulatorAdapter)
        await factory.close()

    @pytest.mark.asyncio
    async def test_switch_to_simulator(self):
        factory = ExchangeFactory(mode=ExchangeMode.REAL)
        # Manually set adapter and switch
        factory._adapter = SimulatorAdapter()
        await factory._adapter.initialize()
        result = await factory.switch_to_simulator()
        assert isinstance(result, SimulatorAdapter)
        await factory.close()


class TestExchangeFactoryClose:
    @pytest.mark.asyncio
    async def test_close_no_adapter(self):
        factory = ExchangeFactory()
        await factory.close()  # Should not error

    @pytest.mark.asyncio
    async def test_close_with_adapter(self):
        factory = ExchangeFactory(mode=ExchangeMode.SIMULATOR)
        await factory.create()
        await factory.close()  # Should close adapter

    @pytest.mark.asyncio
    async def test_close_with_simulator_fallback(self):
        factory = ExchangeFactory(mode=ExchangeMode.SIMULATOR)
        await factory.create()
        await factory.get_or_create_simulator()
        await factory.close()  # Should close both
