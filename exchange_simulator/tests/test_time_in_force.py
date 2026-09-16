"""Tests for time-in-force / post-only / GTD-expiry order semantics."""
from unittest.mock import MagicMock

import pytest

from exchange_simulator.exchange import SimulatedExchange
from exchange_simulator.models import (
    OrderBook,
    OrderStatus,
    OrderType,
    Side,
)


def make_market(price=50000.0, depth=1.0):
    market = MagicMock()
    market.get_price.return_value = price
    market.symbols = ["BTC/USDT"]
    market.generate_order_book.return_value = OrderBook(
        symbol="BTC/USDT", exchange="binance",
        bids=[(50000, depth)], asks=[(50001, depth)],
    )
    market.get_history.return_value = []
    return market


def make_exchange(price=50000.0, depth=1.0):
    return SimulatedExchange("binance", "Binance", 0.04, 1.0, make_market(price, depth))


class TestTimeInForceValidation:
    def test_market_order_rejects_time_in_force(self):
        ex = make_exchange()
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                OrderType.MARKET, time_in_force="IOC")
        assert order.status == OrderStatus.REJECTED
        assert "TIME_IN_FORCE" in order.rejection_reason

    def test_unknown_time_in_force_rejected(self):
        ex = make_exchange()
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                OrderType.LIMIT, price=49900, time_in_force="BOGUS")
        assert order.status == OrderStatus.REJECTED

    def test_expire_at_without_gtd_rejected(self):
        ex = make_exchange()
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                OrderType.LIMIT, price=49900,
                                expire_ts=9999999999.0)
        assert order.status == OrderStatus.REJECTED
        assert "GTD" in order.rejection_reason


class TestIOCFOK:
    def test_ioc_crossing_fills_immediately(self):
        ex = make_exchange()
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                OrderType.LIMIT, price=50100, time_in_force="IOC")
        assert order.status == OrderStatus.FILLED
        assert order.time_in_force == "IOC"

    def test_ioc_non_crossing_cancelled_not_resting(self):
        ex = make_exchange()
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                OrderType.LIMIT, price=49900, time_in_force="IOC")
        assert order.status == OrderStatus.CANCELLED
        assert order.id not in ex._pending_limits

    def test_fok_thin_depth_cancelled(self):
        ex = make_exchange(depth=0.05)  # ask depth 0.05 < order qty 0.1
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                OrderType.LIMIT, price=50100, time_in_force="FOK")
        assert order.status == OrderStatus.CANCELLED
        assert order.id not in ex._pending_limits

    def test_fok_sufficient_depth_fills(self):
        ex = make_exchange(depth=1.0)
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                OrderType.LIMIT, price=50100, time_in_force="FOK")
        assert order.status == OrderStatus.FILLED


class TestPostOnly:
    def test_post_only_crossing_rejected(self):
        ex = make_exchange()
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                OrderType.LIMIT, price=50100, post_only=True)
        assert order.status == OrderStatus.REJECTED
        assert "POST_ONLY" in order.rejection_reason

    def test_post_only_non_crossing_resting(self):
        ex = make_exchange()
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                OrderType.LIMIT, price=49900, post_only=True)
        assert order.status == OrderStatus.PENDING
        assert ex._pending_limits.get(order.id) is order
        assert order.post_only is True


class TestGTD:
    def test_gtd_resting_with_expire_at(self):
        ex = make_exchange()
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                OrderType.LIMIT, price=49900,
                                time_in_force="GTD", expire_ts=9999999999.0)
        assert order.status == OrderStatus.PENDING
        assert order.expire_ts == 9999999999.0
        assert ex._pending_limits.get(order.id) is order

    def test_gtd_expired_cancelled_by_sweep(self):
        ex = make_exchange()
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                OrderType.LIMIT, price=49900,
                                time_in_force="GTD", expire_ts=1.0)  # already past
        assert order.status == OrderStatus.PENDING
        terminal = ex.check_advanced_orders()
        assert order.status == OrderStatus.CANCELLED
        assert order in terminal
        assert order.id not in ex._pending_limits

    def test_gtd_unexpired_stays_pending(self):
        ex = make_exchange()
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                OrderType.LIMIT, price=49900,
                                time_in_force="GTD", expire_ts=9999999999.0)
        ex.check_advanced_orders()
        assert order.status == OrderStatus.PENDING
        assert ex._pending_limits.get(order.id) is order
