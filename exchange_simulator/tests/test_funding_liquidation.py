"""Tests for SimulatedExchange funding rate and liquidation logic."""
from unittest.mock import MagicMock

import pytest

from exchange_simulator.exchange import SimulatedExchange
from exchange_simulator.models import (
    Order,
    OrderBook,
    OrderStatus,
    OrderType,
    Position,
    Side,
)


def make_market(price=50000.0):
    market = MagicMock()
    market.get_price.return_value = price
    market.symbols = ["BTC/USDT"]
    market.generate_order_book.return_value = OrderBook(
        symbol="BTC/USDT", exchange="binance",
        bids=[(50000, 1.0)], asks=[(50001, 1.0)],
    )
    market.get_history.return_value = []
    return market


class TestFundingRate:
    def test_long_pays_positive_funding(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        balance_before = ex.account.balance
        ex.charge_funding(0.0001)
        assert ex.account.balance < balance_before

    def test_short_receives_positive_funding(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        ex.submit_order("BTC/USDT", Side.SELL, 0.1)
        balance_before = ex.account.balance
        ex.charge_funding(0.0001)
        assert ex.account.balance > balance_before

    def test_long_receives_negative_funding(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        balance_before = ex.account.balance
        ex.charge_funding(-0.0001)
        assert ex.account.balance > balance_before

    def test_short_pays_negative_funding(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        ex.submit_order("BTC/USDT", Side.SELL, 0.1)
        balance_before = ex.account.balance
        ex.charge_funding(-0.0001)
        assert ex.account.balance < balance_before

    def test_funding_amount_calculation(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.0, 0.0, market)
        ex.submit_order("BTC/USDT", Side.BUY, 1.0)
        balance_before = ex.account.balance
        funding_rate = 0.001
        ex.charge_funding(funding_rate)
        notional = 50000 * 1.0
        expected_payment = -notional * funding_rate
        assert ex.account.balance == pytest.approx(balance_before + expected_payment, rel=0.001)

    def test_no_funding_no_positions(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        notifications = ex.charge_funding(0.0001)
        assert notifications == []

    def test_funding_notification_generated(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        ex.submit_order("BTC/USDT", Side.BUY, 1.0)
        notifications = ex.charge_funding(0.001)
        assert len(notifications) == 1
        assert "BTC/USDT" in notifications[0]

    def test_funding_notification_skipped_for_tiny_amounts(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        ex.submit_order("BTC/USDT", Side.BUY, 0.001)
        notifications = ex.charge_funding(0.00001)
        assert len(notifications) == 0

    def test_multiple_positions_funding(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market,
                               initial_balance=100000, leverage=10)
        ex.submit_order("BTC/USDT", Side.BUY, 0.5)
        ex.submit_order("BTC/USDT", Side.BUY, 0.3)
        # Should have 1 position (same side adds)
        assert len(ex.account.positions) == 1
        notifications = ex.charge_funding(0.001)
        assert len(notifications) == 1


class TestLiquidation:
    def test_long_liquidation_when_price_drops(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.0, 0.0, market,
                               initial_balance=10000, leverage=10)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        assert len(ex.account.positions) == 1
        # Liquidation price for long: entry * (1 - 1/leverage + 0.005)
        # = 50000 * (1 - 0.1 + 0.005) = 50000 * 0.905 = 45250
        market.get_price.return_value = 45000
        closed = ex.check_stop_loss_take_profit()
        assert len(closed) == 1
        assert len(ex.account.positions) == 0
        assert ex.account.trade_history[-1].reason == "LIQUIDATION"

    def test_short_liquidation_when_price_rises(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.0, 0.0, market,
                               initial_balance=10000, leverage=10)
        ex.submit_order("BTC/USDT", Side.SELL, 0.1)
        assert len(ex.account.positions) == 1
        # Liquidation price for short: entry * (1 + 1/leverage - 0.005)
        # = 50000 * (1 + 0.1 - 0.005) = 50000 * 1.095 = 54750
        market.get_price.return_value = 55000
        closed = ex.check_stop_loss_take_profit()
        assert len(closed) == 1
        assert len(ex.account.positions) == 0
        assert ex.account.trade_history[-1].reason == "LIQUIDATION"

    def test_no_liquidation_in_safe_range(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.0, 0.0, market,
                               initial_balance=10000, leverage=10)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                        stop_loss=40000, take_profit=60000)
        market.get_price.return_value = 48000
        closed = ex.check_stop_loss_take_profit()
        assert len(closed) == 0
        assert len(ex.account.positions) == 1

    def test_liquidation_takes_priority_over_stop_loss(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.0, 0.0, market,
                               initial_balance=10000, leverage=10)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                        stop_loss=49000, take_profit=60000)
        # Price drops below both SL and liquidation
        market.get_price.return_value = 45000
        closed = ex.check_stop_loss_take_profit()
        assert len(closed) == 1
        # Liquidation should be the reason, not stop loss
        assert ex.account.trade_history[-1].reason == "LIQUIDATION"

    def test_high_leverage_liquidation_closer(self):
        market = make_market(50000)
        ex_low = SimulatedExchange("binance", "Binance", 0.0, 0.0, market,
                                   initial_balance=10000, leverage=5)
        ex_high = SimulatedExchange("binance", "Binance", 0.0, 0.0, market,
                                    initial_balance=10000, leverage=20)
        ex_low.submit_order("BTC/USDT", Side.BUY, 0.1, stop_loss=40000, take_profit=60000)
        ex_high.submit_order("BTC/USDT", Side.BUY, 0.1, stop_loss=40000, take_profit=60000)
        # Low leverage (5x): liq at 50000 * (1 - 0.2 + 0.005) = 40250
        # High leverage (20x): liq at 50000 * (1 - 0.05 + 0.005) = 47750
        market.get_price.return_value = 47000
        closed_low = ex_low.check_stop_loss_take_profit()
        closed_high = ex_high.check_stop_loss_take_profit()
        assert len(closed_low) == 0  # Safe for low leverage
        assert len(closed_high) == 1  # Liquidated for high leverage


class TestPositionPnLUpdate:
    def test_update_positions_pnl(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.0, 0.0, market)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        market.get_price.return_value = 51000
        ex.update_positions_pnl()
        pos = ex.account.positions[0]
        assert pos.unrealized_pnl > 0

    def test_pnl_negative_for_losing_position(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.0, 0.0, market)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        market.get_price.return_value = 49000
        ex.update_positions_pnl()
        pos = ex.account.positions[0]
        assert pos.unrealized_pnl < 0

    def test_short_pnl_positive_when_price_drops(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.0, 0.0, market)
        ex.submit_order("BTC/USDT", Side.SELL, 0.1)
        market.get_price.return_value = 49000
        ex.update_positions_pnl()
        pos = ex.account.positions[0]
        assert pos.unrealized_pnl > 0
