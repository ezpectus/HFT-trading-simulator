"""Tests for AdvancedOrderMixin — pending-limit ticks and order cancellation."""
from unittest.mock import MagicMock

import pytest

from exchange_simulator.exchange import SimulatedExchange
from exchange_simulator.models import (
    AuditEventType,
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


class TestCheckLimitOrders:
    def test_fills_all_crossed_limits_in_one_tick(self):
        ex = make_exchange(50000)
        o1 = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                             order_type=OrderType.LIMIT, price=49000)
        o2 = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                             order_type=OrderType.LIMIT, price=49500)
        ex.market.get_price.return_value = 49000
        filled = ex.check_advanced_orders()
        assert {o.id for o in filled} == {o1.id, o2.id}
        assert ex._pending_limits == {}

    def test_purges_non_pending_entries(self):
        ex = make_exchange(50000)
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                order_type=OrderType.LIMIT, price=49000)
        order.status = OrderStatus.CANCELLED  # cancelled via external path
        ex.check_advanced_orders()
        assert order.id not in ex._pending_limits


class TestCancelOrder:
    def test_cancel_pending_limit(self):
        ex = make_exchange(50000)
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                order_type=OrderType.LIMIT, price=49000)
        cancelled = ex.cancel_order(order.id)
        assert cancelled is order
        assert order.status == OrderStatus.CANCELLED
        assert order.id not in ex._pending_limits

    def test_cancel_unknown_id_returns_none(self):
        ex = make_exchange(50000)
        assert ex.cancel_order("no_such_order") is None

    def test_cancelled_limit_never_fills(self):
        ex = make_exchange(50000)
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                order_type=OrderType.LIMIT, price=49000)
        ex.cancel_order(order.id)
        ex.market.get_price.return_value = 40000  # deep through the limit
        filled = ex.check_advanced_orders()
        assert order.status == OrderStatus.CANCELLED
        assert order not in filled

    def test_cancel_emits_audit_event(self):
        ex = make_exchange(50000)
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                order_type=OrderType.LIMIT, price=49000)
        ex.cancel_order(order.id)
        events = ex._audit_logger.get_logs(
            event_type=AuditEventType.ORDER_CANCELLED, order_id=order.id)
        # order ids restart per exchange; the singleton logger may hold
        # same-id cancellations from sibling tests — assert at least one.
        assert events
        assert events[-1].reason == "CANCELLED_BY_CLIENT"


class TestCancelAllOrders:
    def test_cancels_every_pending_order(self):
        ex = make_exchange(50000)
        o1 = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                             order_type=OrderType.LIMIT, price=49000)
        o2 = ex.submit_order("BTC/USDT", Side.SELL, 0.1,
                             order_type=OrderType.LIMIT, price=51000)
        cancelled = ex.cancel_all_orders()
        assert {o.id for o in cancelled} == {o1.id, o2.id}
        assert all(o.status == OrderStatus.CANCELLED for o in cancelled)
        assert ex._pending_limits == {}

    def test_symbol_filter(self):
        ex = make_exchange(50000)
        o1 = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                             order_type=OrderType.LIMIT, price=49000)
        o2 = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                             order_type=OrderType.LIMIT, price=48000)
        assert ex.cancel_all_orders(symbol="ETH/USDT") == []
        assert o1.id in ex._pending_limits
        cancelled = ex.cancel_all_orders(symbol="BTC/USDT")
        assert {o.id for o in cancelled} == {o1.id, o2.id}
        assert ex._pending_limits == {}

    def test_cancel_all_on_empty_book(self):
        ex = make_exchange(50000)
        assert ex.cancel_all_orders() == []
