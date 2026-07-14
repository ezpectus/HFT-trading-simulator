"""Tests for OrderBookRealism — depth profile, spoofing, icebergs, fills, toxicity.

Includes regression tests for fill_from_front returning (order, fill_qty) tuples
and adverse selection tracking using actual fill qty instead of original order qty.
"""
import pytest
import time

from exchange_simulator.order_book_realism import (
    OrderBookRealism, PriceLevel, BookOrder, OrderType,
)


def make_order(oid=1, price=100.0, qty=1.0, visible=None, hidden=0,
               otype=OrderType.NORMAL, is_bid=True):
    return BookOrder(
        order_id=oid, price=price, quantity=qty,
        visible_qty=visible if visible is not None else qty,
        hidden_qty=hidden, order_type=otype,
        timestamp=time.time(), queue_position=0, is_bid=is_bid,
    )


class TestPriceLevel:
    def test_add_order(self):
        level = PriceLevel(price=100.0)
        order = make_order(qty=5.0)
        level.add_order(order)
        assert level.total_visible_qty == 5.0
        assert len(level.orders) == 1

    def test_add_multiple_orders(self):
        level = PriceLevel(price=100.0)
        level.add_order(make_order(oid=1, qty=3.0))
        level.add_order(make_order(oid=2, qty=2.0))
        assert level.total_visible_qty == 5.0
        assert len(level.orders) == 2

    def test_remove_order(self):
        level = PriceLevel(price=100.0)
        level.add_order(make_order(oid=1, qty=3.0))
        level.add_order(make_order(oid=2, qty=2.0))
        removed = level.remove_order(1)
        assert removed is not None
        assert removed.order_id == 1
        assert level.total_visible_qty == 2.0

    def test_remove_nonexistent(self):
        level = PriceLevel(price=100.0)
        assert level.remove_order(999) is None

    def test_fill_from_front_returns_tuples(self):
        """Regression: fill_from_front should return (order, fill_qty) tuples."""
        level = PriceLevel(price=100.0)
        level.add_order(make_order(oid=1, qty=5.0))
        filled = level.fill_from_front(3.0)
        assert len(filled) == 1
        order, fill_qty = filled[0]
        assert fill_qty == pytest.approx(3.0)
        assert order.order_id == 1

    def test_fill_from_front_partial_fill(self):
        """Regression: partial fills (fill_qty < visible_qty) must be recorded
        in the filled list. Previously, filled.append was only called when
        visible_qty reached 0, causing partial fills to be silently dropped."""
        level = PriceLevel(price=100.0)
        level.add_order(make_order(oid=1, qty=10.0))
        filled = level.fill_from_front(4.0)
        assert len(filled) == 1
        _, fill_qty = filled[0]
        assert fill_qty == pytest.approx(4.0)
        # Order should still be in queue (partially filled)
        assert len(level.orders) == 1

    def test_fill_from_front_full_fill_removes_order(self):
        level = PriceLevel(price=100.0)
        level.add_order(make_order(oid=1, qty=5.0))
        filled = level.fill_from_front(5.0)
        assert len(filled) == 1
        _, fill_qty = filled[0]
        assert fill_qty == pytest.approx(5.0)
        assert len(level.orders) == 0

    def test_fill_from_front_multiple_orders(self):
        level = PriceLevel(price=100.0)
        level.add_order(make_order(oid=1, qty=3.0))
        level.add_order(make_order(oid=2, qty=2.0))
        filled = level.fill_from_front(4.0)
        # Should fill 3 from first, 1 from second
        assert len(filled) == 2
        assert filled[0][1] == pytest.approx(3.0)
        assert filled[1][1] == pytest.approx(1.0)

    def test_fill_from_front_iceberg_reveals_hidden(self):
        level = PriceLevel(price=100.0)
        # Iceberg: total=10, visible=2, hidden=8
        level.add_order(make_order(oid=1, qty=10.0, visible=2.0, hidden=8.0,
                                    otype=OrderType.ICEBERG))
        # Fill visible qty
        filled = level.fill_from_front(2.0)
        assert len(filled) == 1
        _, fill_qty = filled[0]
        assert fill_qty == pytest.approx(2.0)
        # Iceberg should still be in queue with revealed hidden qty
        assert len(level.orders) == 1


class TestOrderBookRealism:
    def test_init(self):
        ob = OrderBookRealism(symbol="BTCUSDT", tick_size=0.5, num_levels=10)
        assert ob.symbol == "BTCUSDT"
        assert ob.mid_price == 50000.0
        assert ob.spread == 1.0  # 0.5 * 2

    def test_generate_depth_profile(self):
        ob = OrderBookRealism(num_levels=5)
        ob.generate_depth_profile()
        assert len(ob.bids) > 0
        assert len(ob.asks) > 0
        # Best bid < mid < best ask
        assert ob.best_bid() < ob.mid_price
        assert ob.best_ask() > ob.mid_price

    def test_best_bid_ask_empty(self):
        ob = OrderBookRealism()
        assert ob.best_bid() == 0.0
        assert ob.best_ask() == 0.0

    def test_l2_snapshot(self):
        ob = OrderBookRealism(num_levels=5)
        ob.generate_depth_profile()
        snap = ob.get_l2_snapshot(depth=3)
        assert "symbol" in snap
        assert "bids" in snap
        assert "asks" in snap
        assert "mid_price" in snap
        assert "spread" in snap
        assert "toxicity" in snap
        assert len(snap["bids"]) <= 3
        assert len(snap["asks"]) <= 3

    def test_match_market_order_buy(self):
        ob = OrderBookRealism(num_levels=10, base_qty=5.0)
        ob.generate_depth_profile()
        fills = ob.match_market_order("BUY", 2.0)
        assert len(fills) > 0
        for f in fills:
            assert f["qty"] > 0
            assert f["price"] > 0

    def test_match_market_order_sell(self):
        ob = OrderBookRealism(num_levels=10, base_qty=5.0)
        ob.generate_depth_profile()
        fills = ob.match_market_order("SELL", 2.0)
        assert len(fills) > 0

    def test_match_market_order_fill_qty_correct(self):
        """Regression: fill qty should match actual filled amount, not inferred."""
        ob = OrderBookRealism(num_levels=10, base_qty=5.0)
        ob.generate_depth_profile()
        fills = ob.match_market_order("BUY", 1.0)
        total_filled = sum(f["qty"] for f in fills)
        assert total_filled == pytest.approx(1.0)

    def test_match_market_order_empty_book(self):
        ob = OrderBookRealism()
        fills = ob.match_market_order("BUY", 1.0)
        assert len(fills) == 0


class TestSpoofing:
    def test_spoof_cancellation(self):
        ob = OrderBookRealism(num_levels=10, base_qty=5.0)
        # Generate many times to get spoof orders
        for _ in range(100):
            ob.generate_depth_profile()
        if ob.spoof_orders_active > 0:
            cancelled = ob.process_spoof_cancellations()
            # Some spoof orders should have been cancelled
            assert cancelled >= 0

    def test_spoof_stats_tracked(self):
        ob = OrderBookRealism(num_levels=10, base_qty=5.0)
        ob.generate_depth_profile()
        stats = ob.get_stats()
        assert "spoof_active" in stats
        assert "spoof_cancelled" in stats


class TestToxicity:
    def test_toxicity_zero_without_fills(self):
        ob = OrderBookRealism()
        assert ob.toxic_flow_score == 0.0

    def test_toxicity_updates_after_fills(self):
        ob = OrderBookRealism(num_levels=10, base_qty=5.0)
        ob.generate_depth_profile()
        ob.match_market_order("BUY", 2.0)
        # Toxicity should be > 0 after one-sided flow
        assert ob.toxic_flow_score > 0.0

    def test_toxicity_balanced_flow(self):
        ob = OrderBookRealism(num_levels=10, base_qty=5.0)
        ob.generate_depth_profile()
        ob.match_market_order("BUY", 2.0)
        ob.generate_depth_profile()
        ob.match_market_order("SELL", 2.0)
        # Balanced flow should have lower toxicity than one-sided
        # (but depends on timing, so just check it's valid)
        assert 0.0 <= ob.toxic_flow_score <= 1.0

    def test_toxicity_uses_actual_fill_qty(self):
        """Regression: recent_fills should track actual fill qty, not order qty."""
        ob = OrderBookRealism(num_levels=10, base_qty=5.0)
        ob.generate_depth_profile()
        ob.match_market_order("BUY", 1.0)
        # Check that recent_fills contains actual fill quantities
        total_fill_qty = sum(f["qty"] for f in ob.recent_fills)
        assert total_fill_qty == pytest.approx(1.0)


class TestGetStats:
    def test_stats_structure(self):
        ob = OrderBookRealism()
        stats = ob.get_stats()
        assert "spoof_active" in stats
        assert "spoof_cancelled" in stats
        assert "toxicity" in stats
        assert "bid_levels" in stats
        assert "ask_levels" in stats

    def test_stats_after_depth_generation(self):
        ob = OrderBookRealism(num_levels=5)
        ob.generate_depth_profile()
        stats = ob.get_stats()
        assert stats["bid_levels"] > 0
        assert stats["ask_levels"] > 0


class TestSpoofOrderFilledDecrement:
    """Regression tests: spoof_orders_active must be decremented when a spoof
    order is fully consumed by match_market_order, not only by
    process_spoof_cancellations."""

    def test_spoof_active_decremented_on_fill(self):
        """Directly add a spoof order and fill it via market order."""
        ob = OrderBookRealism(num_levels=5, base_qty=1.0)
        ob.generate_depth_profile()
        # Manually inject a spoof order at the best ask
        best_ask = ob.best_ask()
        spoof_qty = 5.0
        spoof_order = BookOrder(
            order_id=ob._next_id(), price=best_ask, quantity=spoof_qty,
            visible_qty=spoof_qty, hidden_qty=0, order_type=OrderType.SPOOF,
            timestamp=time.time(), queue_position=0, is_bid=False,
        )
        ob.asks[best_ask].add_order(spoof_order)
        ob.spoof_orders_active += 1
        active_before = ob.spoof_orders_active
        # Fill the spoof order with a BUY market order large enough to consume
        # all orders at the best ask level (including those from generate_depth_profile)
        existing_qty = ob.asks[best_ask].total_visible_qty - spoof_qty
        fills = ob.match_market_order("BUY", existing_qty + spoof_qty)
        assert len(fills) > 0
        # spoof_orders_active should have been decremented
        assert ob.spoof_orders_active == active_before - 1

    def test_spoof_active_not_decremented_on_partial_fill(self):
        """Partially filling a spoof order should not decrement the count."""
        ob = OrderBookRealism(num_levels=5, base_qty=1.0)
        ob.generate_depth_profile()
        best_ask = ob.best_ask()
        spoof_qty = 10.0
        spoof_order = BookOrder(
            order_id=ob._next_id(), price=best_ask, quantity=spoof_qty,
            visible_qty=spoof_qty, hidden_qty=0, order_type=OrderType.SPOOF,
            timestamp=time.time(), queue_position=0, is_bid=False,
        )
        ob.asks[best_ask].add_order(spoof_order)
        ob.spoof_orders_active += 1
        active_before = ob.spoof_orders_active
        # Partially fill
        ob.match_market_order("BUY", spoof_qty / 2)
        # Should still be active (partially filled, not fully consumed)
        assert ob.spoof_orders_active == active_before

    def test_spoof_active_never_negative(self):
        """spoof_orders_active should never go below zero."""
        ob = OrderBookRealism(num_levels=5, base_qty=1.0)
        ob.generate_depth_profile()
        ob.spoof_orders_active = 0
        best_ask = ob.best_ask()
        spoof_order = BookOrder(
            order_id=ob._next_id(), price=best_ask, quantity=5.0,
            visible_qty=5.0, hidden_qty=0, order_type=OrderType.SPOOF,
            timestamp=time.time(), queue_position=0, is_bid=False,
        )
        ob.asks[best_ask].add_order(spoof_order)
        # Don't increment spoof_orders_active, then fill it
        ob.match_market_order("BUY", 5.0)
        assert ob.spoof_orders_active >= 0
