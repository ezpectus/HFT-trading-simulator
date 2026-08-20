"""Unit tests for advanced order types.

Tests for Stop-Limit, Trailing Stop, OCO, and Iceberg orders.
"""
import pytest

from exchange_simulator.models import (
    IcebergOrder,
    OCOGroup,
    Order,
    OrderStatus,
    OrderType,
    Side,
    StopLimitOrder,
    TrailingStopOrder,
)


class TestStopLimitOrder:
    """Test Stop-Limit order functionality."""

    def test_stop_limit_order_creation(self):
        """Test creating a stop-limit order."""
        order = StopLimitOrder(
            id="test_001",
            symbol="BTC/USDT",
            exchange="binance",
            side=Side.BUY,
            order_type=OrderType.STOP_LIMIT,
            quantity=0.1,
            price=50100.0,
            stop_price=50000.0,
            limit_price=50100.0,
        )

        assert order.stop_price == 50000.0
        assert order.limit_price == 50100.0
        assert order.triggered is False

    def test_buy_stop_trigger(self):
        """Test buy stop triggers when price >= stop price."""
        order = StopLimitOrder(
            id="test_002",
            symbol="BTC/USDT",
            exchange="binance",
            side=Side.BUY,
            order_type=OrderType.STOP_LIMIT,
            quantity=0.1,
            stop_price=50000.0,
            limit_price=50100.0,
        )

        # Should not trigger below stop price
        assert order.check_trigger(49900.0) is False
        assert order.triggered is False

        # Should trigger at stop price
        assert order.check_trigger(50000.0) is True
        assert order.triggered is True

        # Should remain triggered above stop price
        assert order.check_trigger(50100.0) is True

    def test_sell_stop_trigger(self):
        """Test sell stop triggers when price <= stop price."""
        order = StopLimitOrder(
            id="test_003",
            symbol="BTC/USDT",
            exchange="binance",
            side=Side.SELL,
            order_type=OrderType.STOP_LIMIT,
            quantity=0.1,
            stop_price=50000.0,
            limit_price=49900.0,
        )

        # Should not trigger above stop price
        assert order.check_trigger(50100.0) is False
        assert order.triggered is False

        # Should trigger at stop price
        assert order.check_trigger(50000.0) is True
        assert order.triggered is True

        # Should remain triggered below stop price
        assert order.check_trigger(49900.0) is True

    def test_stop_limit_to_dict(self):
        """Test Stop-Limit order serialization."""
        order = StopLimitOrder(
            id="test_004",
            symbol="BTC/USDT",
            exchange="binance",
            side=Side.BUY,
            order_type=OrderType.STOP_LIMIT,
            quantity=0.1,
            stop_price=50000.0,
            limit_price=50100.0,
        )

        order_dict = order.to_dict()

        assert order_dict["stop_price"] == 50000.0
        assert order_dict["limit_price"] == 50100.0
        assert order_dict["triggered"] is False


class TestTrailingStopOrder:
    """Test Trailing Stop order functionality."""

    def test_trailing_stop_creation(self):
        """Test creating a trailing stop order."""
        order = TrailingStopOrder(
            id="test_005",
            symbol="BTC/USDT",
            exchange="binance",
            side=Side.SELL,
            order_type=OrderType.TRAILING_STOP,
            quantity=0.1,
            trail_amount=5.0,
            trail_percentage=True,
        )

        assert order.trail_amount == 5.0
        assert order.trail_percentage is True
        assert order.activated is False

    def test_trailing_stop_activation(self):
        """Test trailing stop activation on first price."""
        order = TrailingStopOrder(
            id="test_006",
            symbol="BTC/USDT",
            exchange="binance",
            side=Side.SELL,
            order_type=OrderType.TRAILING_STOP,
            quantity=0.1,
            trail_amount=5.0,
            trail_percentage=True,
        )

        order.update_stop_price(50000.0)

        assert order.activated is True
        assert order.highest_price == 50000.0
        assert order.stop_price == 47500.0  # 50000 * (1 - 0.05)

    def test_trailing_stop_adjustment(self):
        """Test trailing stop adjustment as price moves favorably."""
        order = TrailingStopOrder(
            id="test_007",
            symbol="BTC/USDT",
            exchange="binance",
            side=Side.SELL,
            order_type=OrderType.TRAILING_STOP,
            quantity=0.1,
            trail_amount=5.0,
            trail_percentage=True,
        )

        # Activate at 50000
        order.update_stop_price(50000.0)
        assert order.stop_price == 47500.0

        # Price rises to 51000, stop should rise
        order.update_stop_price(51000.0)
        assert order.highest_price == 51000.0
        assert order.stop_price == 48450.0  # 51000 * (1 - 0.05)

        # Price drops to 50500, stop should not drop
        order.update_stop_price(50500.0)
        assert order.highest_price == 51000.0
        assert order.stop_price == 48450.0  # Should remain at highest

    def test_trailing_stop_trigger(self):
        """Test trailing stop trigger condition."""
        order = TrailingStopOrder(
            id="test_008",
            symbol="BTC/USDT",
            exchange="binance",
            side=Side.SELL,
            order_type=OrderType.TRAILING_STOP,
            quantity=0.1,
            trail_amount=5.0,
            trail_percentage=True,
        )

        order.update_stop_price(50000.0)

        # Should not trigger above stop price
        assert order.check_trigger(48000.0) is False

        # Should trigger at stop price
        assert order.check_trigger(47500.0) is True

        # Should trigger below stop price
        assert order.check_trigger(47000.0) is True

    def test_trailing_stop_absolute(self):
        """Test trailing stop with absolute trail amount."""
        order = TrailingStopOrder(
            id="test_009",
            symbol="BTC/USDT",
            exchange="binance",
            side=Side.SELL,
            order_type=OrderType.TRAILING_STOP,
            quantity=0.1,
            trail_amount=1000.0,
            trail_percentage=False,
        )

        order.update_stop_price(50000.0)

        assert order.stop_price == 49000.0  # 50000 - 1000


class TestOCOGroup:
    """Test OCO (One-Cancels-the-Other) order functionality."""

    def test_oco_group_creation(self):
        """Test creating an OCO group."""
        oco = OCOGroup(id="oco_001")

        assert oco.id == "oco_001"
        assert len(oco.orders) == 0
        assert oco.filled_order_id is None
        assert len(oco.cancelled_order_ids) == 0

    def test_oco_add_order(self):
        """Test adding orders to OCO group."""
        oco = OCOGroup(id="oco_002")

        order1 = Order(
            id="order_001",
            symbol="BTC/USDT",
            exchange="binance",
            side=Side.SELL,
            order_type=OrderType.LIMIT,
            quantity=0.1,
            price=55000.0,
        )

        order2 = StopLimitOrder(
            id="order_002",
            symbol="BTC/USDT",
            exchange="binance",
            side=Side.SELL,
            order_type=OrderType.STOP_LIMIT,
            quantity=0.1,
            stop_price=45000.0,
            limit_price=44900.0,
        )

        oco.add_order(order1)
        oco.add_order(order2)

        assert len(oco.orders) == 2

    def test_oco_on_fill(self):
        """Test OCO fill cancels other orders."""
        oco = OCOGroup(id="oco_003")

        order1 = Order(
            id="order_001",
            symbol="BTC/USDT",
            exchange="binance",
            side=Side.SELL,
            order_type=OrderType.LIMIT,
            quantity=0.1,
            price=55000.0,
        )

        order2 = StopLimitOrder(
            id="order_002",
            symbol="BTC/USDT",
            exchange="binance",
            side=Side.SELL,
            order_type=OrderType.STOP_LIMIT,
            quantity=0.1,
            stop_price=45000.0,
            limit_price=44900.0,
        )

        oco.add_order(order1)
        oco.add_order(order2)

        # Fill order1
        cancelled = oco.on_fill("order_001")

        assert oco.filled_order_id == "order_001"
        assert len(cancelled) == 1
        assert cancelled[0].id == "order_002"
        assert cancelled[0].status == OrderStatus.CANCELLED
        assert "order_002" in oco.cancelled_order_ids

    def test_oco_to_dict(self):
        """Test OCO group serialization."""
        oco = OCOGroup(id="oco_004")

        order1 = Order(
            id="order_001",
            symbol="BTC/USDT",
            exchange="binance",
            side=Side.SELL,
            order_type=OrderType.LIMIT,
            quantity=0.1,
            price=55000.0,
        )

        oco.add_order(order1)

        oco_dict = oco.to_dict()

        assert oco_dict["id"] == "oco_004"
        assert len(oco_dict["orders"]) == 1
        assert oco_dict["filled_order_id"] is None


class TestIcebergOrder:
    """Test Iceberg order functionality."""

    def test_iceberg_order_creation(self):
        """Test creating an iceberg order."""
        order = IcebergOrder(
            id="test_010",
            symbol="BTC/USDT",
            exchange="binance",
            side=Side.BUY,
            order_type=OrderType.ICEBERG,
            quantity=10.0,
            price=50000.0,
            visible_quantity=0.1,
            hidden_quantity=9.9,
            slice_size=0.1,
        )

        assert order.visible_quantity == 0.1
        assert order.hidden_quantity == 9.9
        assert order.slice_size == 0.1
        assert order.slices_remaining == 99  # 9.9 / 0.1

    def test_iceberg_get_visible_quantity(self):
        """Test getting visible quantity."""
        order = IcebergOrder(
            id="test_011",
            symbol="BTC/USDT",
            exchange="binance",
            side=Side.BUY,
            order_type=OrderType.ICEBERG,
            quantity=10.0,
            price=50000.0,
            visible_quantity=0.1,
            hidden_quantity=9.9,
            slice_size=0.1,
        )

        visible = order.get_visible_quantity()

        assert visible == 0.1  # Should return slice_size, not visible_quantity

    def test_iceberg_on_fill_slice(self):
        """Test iceberg order fill replenishes slices."""
        order = IcebergOrder(
            id="test_012",
            symbol="BTC/USDT",
            exchange="binance",
            side=Side.BUY,
            order_type=OrderType.ICEBERG,
            quantity=10.0,
            price=50000.0,
            visible_quantity=0.1,
            hidden_quantity=9.9,
            slice_size=0.1,
        )

        # Fill exactly one slice
        remaining, should_replenish = order.on_fill(0.1)

        assert remaining == 0.0
        assert should_replenish is True
        assert order.slices_remaining == 98
        assert order.current_slice_filled == 0.0

    def test_iceberg_on_fill_partial(self):
        """Test iceberg order partial fill."""
        order = IcebergOrder(
            id="test_013",
            symbol="BTC/USDT",
            exchange="binance",
            side=Side.BUY,
            order_type=OrderType.ICEBERG,
            quantity=10.0,
            price=50000.0,
            visible_quantity=0.1,
            hidden_quantity=9.9,
            slice_size=0.1,
        )

        # Partial fill
        remaining, should_replenish = order.on_fill(0.05)

        assert remaining == 0.0
        assert should_replenish is False
        assert order.current_slice_filled == 0.05

    def test_iceberg_to_dict(self):
        """Test Iceberg order serialization."""
        order = IcebergOrder(
            id="test_014",
            symbol="BTC/USDT",
            exchange="binance",
            side=Side.BUY,
            order_type=OrderType.ICEBERG,
            quantity=10.0,
            price=50000.0,
            visible_quantity=0.1,
            hidden_quantity=9.9,
            slice_size=0.1,
        )

        order_dict = order.to_dict()

        assert order_dict["visible_quantity"] == 0.1
        assert order_dict["hidden_quantity"] == 9.9
        assert order_dict["slice_size"] == 0.1
        assert order_dict["slices_remaining"] == 99


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
