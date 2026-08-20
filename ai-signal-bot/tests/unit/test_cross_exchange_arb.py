"""Tests for strategies/cross_exchange_arb.py — CrossExchangeArbEngine, data classes."""
import asyncio
import time
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.strategies.cross_exchange_arb import (
    ArbitrageOpportunity,
    ArbStatus,
    CrossExchangeArbEngine,
    ExchangePrice,
    ExecutionResult,
)


class TestArbStatus:
    def test_values(self):
        assert ArbStatus.DETECTED.value == "detected"
        assert ArbStatus.EXECUTING.value == "executing"
        assert ArbStatus.COMPLETED.value == "completed"
        assert ArbStatus.FAILED.value == "failed"
        assert ArbStatus.PARTIAL_FILL.value == "partial_fill"


class TestExchangePrice:
    def test_creation(self):
        ep = ExchangePrice("binance", bid=50000, ask=50010, bid_qty=1.0, ask_qty=0.5)
        assert ep.exchange == "binance"
        assert ep.bid == 50000
        assert ep.ask == 50010
        assert ep.timestamp > 0

    def test_mid(self):
        ep = ExchangePrice("binance", bid=100, ask=102, bid_qty=1, ask_qty=1)
        assert ep.mid == 101.0

    def test_spread_bps(self):
        ep = ExchangePrice("binance", bid=100, ask=101, bid_qty=1, ask_qty=1)
        assert ep.spread_bps == pytest.approx(100.0, rel=0.01)

    def test_spread_bps_zero_mid(self):
        ep = ExchangePrice("binance", bid=0, ask=0, bid_qty=1, ask_qty=1)
        assert ep.spread_bps == 0.0


class TestArbitrageOpportunity:
    def test_creation(self):
        opp = ArbitrageOpportunity(
            symbol="BTC/USDT",
            buy_exchange="binance",
            sell_exchange="okx",
            buy_price=50000,
            sell_price=50050,
            qty=1.0,
            gross_profit_usd=50,
            net_profit_usd=40,
            profit_bps=10,
        )
        assert opp.symbol == "BTC/USDT"
        assert opp.status == ArbStatus.DETECTED
        assert opp.error == ""


class TestExecutionResult:
    def test_success(self):
        r = ExecutionResult(True, 50000, 1.0, 2.5)
        assert r.success is True
        assert r.fill_price == 50000
        assert r.fill_qty == 1.0
        assert r.slippage_bps == 2.5
        assert r.error == ""

    def test_failure(self):
        r = ExecutionResult(False, 0, 0, 0, "timeout")
        assert r.success is False
        assert r.error == "timeout"


class TestCrossExchangeArbEngine:
    def test_init_defaults(self):
        engine = CrossExchangeArbEngine(exchanges={"binance": MagicMock(), "okx": MagicMock()})
        assert "BTC/USDT" in engine.symbols
        assert engine.min_profit_bps == 5.0
        assert engine.max_position_usd == 1000.0
        assert engine.max_open_positions == 5
        assert engine._running is False

    def test_init_custom(self):
        engine = CrossExchangeArbEngine(
            exchanges={"binance": MagicMock()},
            symbols=["BTC/USDT"],
            min_profit_bps=10.0,
            max_position_usd=5000.0,
            max_open_positions=10,
        )
        assert engine.symbols == ["BTC/USDT"]
        assert engine.min_profit_bps == 10.0
        assert engine.max_position_usd == 5000.0
        assert engine.max_open_positions == 10

    def test_update_price(self):
        engine = CrossExchangeArbEngine(exchanges={"binance": MagicMock(), "okx": MagicMock()})
        ep = ExchangePrice("binance", bid=50000, ask=50010, bid_qty=1, ask_qty=1)
        engine.update_price("BTC/USDT", "binance", ep)
        assert "BTC/USDT" in engine.prices
        assert "binance" in engine.prices["BTC/USDT"]

    def test_detect_opportunity_no_prices(self):
        engine = CrossExchangeArbEngine(exchanges={"binance": MagicMock(), "okx": MagicMock()})
        assert engine._detect_opportunity("BTC/USDT") is None

    def test_detect_opportunity_single_exchange(self):
        engine = CrossExchangeArbEngine(exchanges={"binance": MagicMock(), "okx": MagicMock()})
        ep = ExchangePrice("binance", bid=50000, ask=50010, bid_qty=1, ask_qty=1)
        engine.update_price("BTC/USDT", "binance", ep)
        assert engine._detect_opportunity("BTC/USDT") is None

    def test_detect_opportunity_two_exchanges(self):
        engine = CrossExchangeArbEngine(
            exchanges={"binance": MagicMock(), "okx": MagicMock()},
            min_profit_bps=0.0,
        )
        engine.update_price("BTC/USDT", "binance", ExchangePrice("binance", bid=50050, ask=50000, bid_qty=1, ask_qty=1))
        engine.update_price("BTC/USDT", "okx", ExchangePrice("okx", bid=50100, ask=50110, bid_qty=1, ask_qty=1))
        opp = engine._detect_opportunity("BTC/USDT")
        if opp:
            assert opp.buy_exchange == "binance"
            assert opp.sell_exchange == "okx"

    def test_get_stats(self):
        engine = CrossExchangeArbEngine(exchanges={"binance": MagicMock()})
        stats = engine.get_stats()
        assert "opportunities_detected" in stats
        assert "opportunities_executed" in stats
        assert "opportunities_failed" in stats
        assert "total_profit_usd" in stats
        assert "total_slippage_bps" in stats
        assert "open_positions" in stats

    @pytest.mark.asyncio
    async def test_stop_without_start(self):
        engine = CrossExchangeArbEngine(exchanges={"binance": MagicMock()})
        await engine.stop()
        assert engine._running is False

    @pytest.mark.asyncio
    async def test_execute_leg_no_method(self):
        engine = CrossExchangeArbEngine(exchanges={"binance": MagicMock()})
        client = MagicMock()
        del client.place_order
        result = await engine._execute_leg(client, "BTC/USDT", "buy", 1.0, 50000)
        assert result.success is False
        assert "No place_order method" in result.error
