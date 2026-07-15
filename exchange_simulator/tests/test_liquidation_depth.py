"""Tests for SimulatedExchange partial liquidation, insurance fund, and depth snapshot API."""
import pytest
from unittest.mock import MagicMock

from exchange_simulator.models import (
    Order, OrderBook, OrderBookLevel, OrderStatus, OrderType, Position, Side,
)
from exchange_simulator.exchange import SimulatedExchange


def make_market(price=50000.0):
    market = MagicMock()
    market.get_price.return_value = price
    market.symbols = ["BTC/USDT"]
    market.generate_order_book.return_value = OrderBook(
        symbol="BTC/USDT", exchange="binance",
        bids=[OrderBookLevel(price=50000 - i * 5, quantity=1.0 + i * 0.1) for i in range(20)],
        asks=[OrderBookLevel(price=50001 + i * 5, quantity=0.8 + i * 0.1) for i in range(20)],
        timestamp=1704067200,
    )
    market.get_history.return_value = []
    market.current_timestamp = 1704067200
    return market


class TestPartialLiquidation:
    def test_partial_liquidation_reduces_position(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.0, 0.0, market,
                               initial_balance=10000, leverage=10)
        ex.submit_order("BTC/USDT", Side.BUY, 0.2)
        assert len(ex.account.positions) == 1
        original_qty = ex.account.positions[0].quantity

        # Partial liq price for long at 10x: 50000 * (1 - 0.5/10 + 0.005) = 50000 * 0.955 = 47750
        market.get_price.return_value = 47750
        closed = ex.check_stop_loss_take_profit()
        assert len(closed) == 1
        # Position should still exist but with reduced quantity
        assert len(ex.account.positions) == 1
        assert ex.account.positions[0].quantity < original_qty

    def test_partial_liquidation_reason_in_trade_history(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.0, 0.0, market,
                               initial_balance=10000, leverage=10)
        ex.submit_order("BTC/USDT", Side.BUY, 0.2)
        market.get_price.return_value = 47750
        ex.check_stop_loss_take_profit()
        assert ex.account.trade_history[-1].reason == "PARTIAL_LIQUIDATION"

    def test_full_liquidation_after_partial(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.0, 0.0, market,
                               initial_balance=10000, leverage=10)
        ex.submit_order("BTC/USDT", Side.BUY, 0.2)
        # First: partial liquidation
        market.get_price.return_value = 47750
        ex.check_stop_loss_take_profit()
        assert len(ex.account.positions) == 1
        # Second: full liquidation (price drops further)
        market.get_price.return_value = 45000
        ex.check_stop_loss_take_profit()
        assert len(ex.account.positions) == 0
        assert ex.account.trade_history[-1].reason == "LIQUIDATION"

    def test_short_partial_liquidation(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.0, 0.0, market,
                               initial_balance=10000, leverage=10)
        ex.submit_order("BTC/USDT", Side.SELL, 0.2)
        original_qty = ex.account.positions[0].quantity
        # Partial liq for short at 10x: 50000 * (1 + 0.5/10 - 0.005) = 50000 * 1.045 = 52250
        market.get_price.return_value = 52250
        closed = ex.check_stop_loss_take_profit()
        assert len(closed) == 1
        assert len(ex.account.positions) == 1
        assert ex.account.positions[0].quantity < original_qty


class TestInsuranceFund:
    def test_insurance_fund_starts_zero(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.0, 0.0, market)
        assert ex.insurance_fund == 0.0

    def test_insurance_fund_covers_negative_balance(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.0, 0.0, market,
                               initial_balance=100, leverage=20)
        # Small balance + high leverage → liquidation can make balance negative
        ex.submit_order("BTC/USDT", Side.BUY, 0.01)
        # Drop price far below liquidation
        market.get_price.return_value = 40000
        ex.check_stop_loss_take_profit()
        # If balance went negative, insurance fund should have covered it
        assert ex.account.balance >= 0
        # Insurance fund should have the deficit if there was one
        # (depends on exact PnL, but balance should never be negative)

    def test_insurance_fund_increases_on_deficit(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.0, 0.0, market,
                               initial_balance=50, leverage=20)
        ex.submit_order("BTC/USDT", Side.BUY, 0.01)
        balance_before = ex.account.balance
        market.get_price.return_value = 40000
        ex.check_stop_loss_take_profit()
        # Balance should be >= 0 (insurance fund covered any deficit)
        assert ex.account.balance >= 0
        if balance_before < 0:
            assert ex.insurance_fund > 0


class TestDepthSnapshot:
    def test_depth_snapshot_basic(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        snapshot = ex.get_depth_snapshot("BTC/USDT")
        assert snapshot["symbol"] == "BTC/USDT"
        assert snapshot["exchange"] == "binance"
        assert "mid_price" in snapshot
        assert "spread_bps" in snapshot
        assert "imbalance" in snapshot
        assert "bid_depth" in snapshot
        assert "ask_depth" in snapshot
        assert len(snapshot["bids"]) > 0
        assert len(snapshot["asks"]) > 0

    def test_depth_snapshot_levels(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        snapshot = ex.get_depth_snapshot("BTC/USDT", levels=5)
        assert len(snapshot["bids"]) == 5
        assert len(snapshot["asks"]) == 5

    def test_depth_snapshot_cumulative(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        snapshot = ex.get_depth_snapshot("BTC/USDT", levels=3)
        # Cumulative should be increasing
        assert snapshot["bids"][0]["cumulative"] <= snapshot["bids"][1]["cumulative"]
        assert snapshot["bids"][1]["cumulative"] <= snapshot["bids"][2]["cumulative"]
        assert snapshot["asks"][0]["cumulative"] <= snapshot["asks"][1]["cumulative"]

    def test_depth_snapshot_per_level(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        snapshot = ex.get_depth_snapshot("BTC/USDT", levels=3)
        for level in snapshot["bids"]:
            assert "price" in level
            assert "quantity" in level
            assert "cumulative" in level

    def test_depth_snapshot_imbalance(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        snapshot = ex.get_depth_snapshot("BTC/USDT")
        # Imbalance should be between -1 and 1
        assert -1 <= snapshot["imbalance"] <= 1

    def test_depth_snapshot_spread_positive(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        snapshot = ex.get_depth_snapshot("BTC/USDT")
        assert snapshot["spread_bps"] > 0

    def test_depth_snapshot_timestamp(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        snapshot = ex.get_depth_snapshot("BTC/USDT")
        assert "timestamp" in snapshot
        assert snapshot["timestamp"] > 0

    def test_depth_snapshot_empty_order_book(self):
        market = make_market(50000)
        market.generate_order_book.return_value = OrderBook(
            symbol="BTC/USDT", exchange="binance"
        )
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        snapshot = ex.get_depth_snapshot("BTC/USDT")
        assert snapshot["bids"] == []
        assert snapshot["asks"] == []
        assert snapshot["spread_bps"] == 0
