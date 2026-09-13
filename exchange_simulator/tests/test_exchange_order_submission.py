"""Tests for order submission — market fills and resting-limit registration."""
from unittest.mock import MagicMock

import pytest

from exchange_simulator.exchange import SimulatedExchange
from exchange_simulator.models import (
    OrderBook,
    OrderStatus,
    OrderType,
    Side,
)


def make_market(price=50000.0):
    """Create a mock MarketSimulator with a fixed price."""
    market = MagicMock()
    market.get_price.return_value = price
    market.symbols = ["BTC/USDT"]
    market.generate_order_book.return_value = OrderBook(
        symbol="BTC/USDT", exchange="binance",
        bids=[(50000, 1.0)], asks=[(50001, 1.0)],
    )
    market.get_history.return_value = []
    return market


def make_exchange(price=50000.0):
    return SimulatedExchange("binance", "Binance", 0.04, 1.0, make_market(price))


class TestLimitOrderRegistration:
    """Resting LIMIT orders must land in _pending_limits, not just history."""

    def test_non_crossing_buy_limit_registered_pending(self):
        ex = make_exchange(50000)
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                order_type=OrderType.LIMIT, price=49000)
        assert order.status == OrderStatus.PENDING
        assert ex._pending_limits[order.id] is order
        assert order in ex._order_history

    def test_non_crossing_sell_limit_registered_pending(self):
        ex = make_exchange(50000)
        order = ex.submit_order("BTC/USDT", Side.SELL, 0.1,
                                order_type=OrderType.LIMIT, price=51000)
        assert order.status == OrderStatus.PENDING
        assert ex._pending_limits[order.id] is order

    def test_crossing_buy_limit_fills_immediately(self):
        ex = make_exchange(50000)
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                order_type=OrderType.LIMIT, price=55000)
        assert order.status == OrderStatus.FILLED
        assert order.id not in ex._pending_limits

    def test_crossing_sell_limit_fills_immediately(self):
        ex = make_exchange(50000)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        order = ex.submit_order("BTC/USDT", Side.SELL, 0.1,
                                order_type=OrderType.LIMIT, price=45000)
        assert order.status == OrderStatus.FILLED
        assert order.id not in ex._pending_limits

    def test_market_order_never_registered_pending(self):
        ex = make_exchange(50000)
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        assert order.status == OrderStatus.FILLED
        assert ex._pending_limits == {}


class TestPendingLimitLifecycle:
    """A resting limit must fill when the market reaches its price."""

    def test_buy_limit_fills_when_price_drops(self):
        ex = make_exchange(50000)
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                order_type=OrderType.LIMIT, price=49000)
        assert order.status == OrderStatus.PENDING

        ex.market.get_price.return_value = 49000
        filled = ex.check_advanced_orders()

        assert order.status == OrderStatus.FILLED
        assert order.filled_price == 49000
        assert order in filled
        assert order.id not in ex._pending_limits

    def test_sell_limit_fills_when_price_rises(self):
        ex = make_exchange(50000)
        ex.submit_order("BTC/USDT", Side.BUY, 0.2)
        order = ex.submit_order("BTC/USDT", Side.SELL, 0.1,
                                order_type=OrderType.LIMIT, price=51000)
        assert order.status == OrderStatus.PENDING

        ex.market.get_price.return_value = 51000
        filled = ex.check_advanced_orders()

        assert order.status == OrderStatus.FILLED
        assert order.filled_price == 51000
        assert order in filled

    def test_limit_stays_pending_while_market_away(self):
        ex = make_exchange(50000)
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                order_type=OrderType.LIMIT, price=49000)
        ex.market.get_price.return_value = 49500
        filled = ex.check_advanced_orders()
        assert order.status == OrderStatus.PENDING
        assert order not in filled
        assert order.id in ex._pending_limits
