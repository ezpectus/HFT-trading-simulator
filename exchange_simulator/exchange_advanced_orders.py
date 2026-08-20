"""Advanced order handling mixin for SimulatedExchange.

Extracted from exchange.py for file-size compliance.
Handles stop-limit, trailing stop, and iceberg order processing,
plus margin checking and order execution helpers.
"""
from exchange_simulator.models import (
    AuditEventType,
    IcebergOrder,
    Order,
    OrderStatus,
    OrderType,
    Side,
)

_TYPICAL_VOLUME = 500.0


class AdvancedOrderMixin:
    """Mixin providing advanced order handling for SimulatedExchange."""

    def check_advanced_orders(self) -> list[Order]:
        """Check and process pending advanced orders (Phase 3).

        Returns:
            List of orders that were filled during this check.
        """
        filled_orders = []
        current_prices = {symbol: self.get_price(symbol) for symbol in self.symbols}

        self._check_stop_limit_orders(current_prices, filled_orders)
        self._check_trailing_stop_orders(current_prices, filled_orders)
        self._check_iceberg_orders(current_prices, filled_orders)

        return filled_orders

    def _check_stop_limit_orders(
        self, current_prices: dict, filled_orders: list
    ) -> None:
        """Check and trigger pending stop-limit orders."""
        to_remove = []
        for order_id, order in self._pending_stop_limits.items():
            current_price = current_prices.get(order.symbol, 0)
            if current_price == 0:
                continue

            if order.check_trigger(current_price):
                if order.side == Side.BUY:
                    if current_price <= order.limit_price:
                        filled_order = self._execute_limit_order(order, order.limit_price)
                        filled_orders.append(filled_order)
                        to_remove.append(order_id)
                else:
                    if current_price >= order.limit_price:
                        filled_order = self._execute_limit_order(order, order.limit_price)
                        filled_orders.append(filled_order)
                        to_remove.append(order_id)

        for order_id in to_remove:
            self._pending_stop_limits.pop(order_id, None)

    def _check_trailing_stop_orders(
        self, current_prices: dict, filled_orders: list
    ) -> None:
        """Check and trigger pending trailing stop orders."""
        to_remove = []
        for order_id, order in self._pending_trailing_stops.items():
            current_price = current_prices.get(order.symbol, 0)
            if current_price == 0:
                continue

            order.update_stop_price(current_price)

            if order.side == Side.SELL and current_price <= order.stop_price:
                filled_order = self._execute_market_order(order, current_price)
                filled_orders.append(filled_order)
                to_remove.append(order_id)
            elif order.side == Side.BUY and current_price >= order.stop_price:
                filled_order = self._execute_market_order(order, current_price)
                filled_orders.append(filled_order)
                to_remove.append(order_id)

        for order_id in to_remove:
            self._pending_trailing_stops.pop(order_id, None)

    def _check_iceberg_orders(
        self, current_prices: dict, filled_orders: list
    ) -> None:
        """Check and execute pending iceberg order slices."""
        to_remove = []
        for order_id, order in self._pending_icebergs.items():
            current_price = current_prices.get(order.symbol, 0)
            if current_price == 0:
                continue

            if order.hidden_quantity > 0:
                fill_price = current_price
                if order.price is not None:
                    fill_price = order.price

                filled_order = self._execute_iceberg_slice(order, fill_price)
                filled_orders.append(filled_order)

                if order.hidden_quantity <= 0:
                    to_remove.append(order_id)

        for order_id in to_remove:
            self._pending_icebergs.pop(order_id, None)

    def _check_margin(self, order: Order, fill_price: float) -> bool:
        """Check if account has sufficient margin for an order.

        Returns True if margin is sufficient, False otherwise.
        Sets order.rejection_reason if check fails.
        """
        notional = fill_price * order.quantity
        fee = notional * self.fee_pct / 100
        lev = self.account.leverage if self.account.leverage > 0 else 1
        margin_required = notional / lev
        if margin_required + fee > self.account.balance:
            order.status = OrderStatus.REJECTED
            order.rejection_reason = f"INSUFFICIENT_MARGIN (need ${margin_required:.2f}, have ${self.account.balance:.2f})"
            self._order_history.append(order)
            self._audit_logger.log(
                event_type=AuditEventType.ORDER_REJECTED,
                exchange=self.exchange_id,
                symbol=order.symbol,
                order_id=order.id,
                reason=order.rejection_reason,
                metadata={"margin_required": margin_required, "balance": self.account.balance},
            )
            return False
        max_notional = self.account.balance * self.account.leverage * 0.5
        if notional > max_notional:
            order.status = OrderStatus.REJECTED
            order.rejection_reason = f"MAX_POSITION_SIZE (notional ${notional:.2f} > limit ${max_notional:.2f})"
            self._order_history.append(order)
            self._audit_logger.log(
                event_type=AuditEventType.ORDER_REJECTED,
                exchange=self.exchange_id,
                symbol=order.symbol,
                order_id=order.id,
                reason=order.rejection_reason,
                metadata={"notional": notional, "max_notional": max_notional},
            )
            return False
        return True

    def _execute_limit_order(self, order: Order, price: float) -> Order:
        """Execute a limit order at specified price (Phase 3 helper)."""
        if not self._check_margin(order, price):
            return order
        order.status = OrderStatus.FILLED
        order.filled_price = round(price, 2)
        order.filled_quantity = order.quantity
        notional = price * order.quantity
        order.fee = round(notional * self.fee_pct / 100, 4)
        self._finalize_order_execution(order, price, price)
        return order

    def _execute_market_order(self, order: Order, price: float) -> Order:
        """Execute a market order at current price with slippage (Phase 3 helper)."""
        slippage_amount = price * self.slippage_bps / 10000
        fill_price = price + slippage_amount if order.side == Side.BUY else price - slippage_amount

        if not self._check_margin(order, fill_price):
            return order
        order.status = OrderStatus.FILLED
        order.filled_price = round(fill_price, 2)
        order.filled_quantity = order.quantity
        order.slippage = round(slippage_amount, 4)
        notional = fill_price * order.quantity
        order.fee = round(notional * self.fee_pct / 100, 4)
        self._finalize_order_execution(order, price, fill_price)
        return order

    def _finalize_order_execution(self, order: Order, ref_price: float,
                                  fill_price: float) -> None:
        """Deduct fee, update position, and log audit events for a filled order."""
        old_balance = self.account.balance
        self.account.balance -= order.fee
        self.account.total_fees += order.fee
        self._update_position(order, None, None)

        self._audit_logger.log(
            event_type=AuditEventType.ACCOUNT_BALANCE_CHANGE,
            exchange=self.exchange_id,
            old_value=old_balance,
            new_value=self.account.balance,
            reason="FEE",
            metadata={"fee": order.fee, "order_id": order.id},
        )
        self._audit_logger.log(
            event_type=AuditEventType.ORDER_FILLED,
            exchange=self.exchange_id,
            symbol=order.symbol,
            order_id=order.id,
            old_value=ref_price,
            new_value=fill_price,
            metadata={"order_type": order.order_type.value, "quantity": order.quantity, "fee": order.fee},
        )

    def _execute_iceberg_slice(self, order: IcebergOrder, price: float) -> Order:
        """Execute a slice of an iceberg order (Phase 3 helper)."""
        slice_qty = min(order.visible_quantity, order.hidden_quantity)
        slice_order = self._create_iceberg_slice_order(order, price, slice_qty)

        if not self._check_margin(slice_order, price):
            return slice_order

        order.hidden_quantity -= slice_qty
        order.replenished += 1
        slice_order.status = OrderStatus.FILLED
        slice_order.filled_price = round(price, 2)
        slice_order.filled_quantity = slice_qty

        self._finalize_iceberg_execution(slice_order, order, price)
        return slice_order

    def _create_iceberg_slice_order(self, parent: IcebergOrder, price: float,
                                    slice_qty: float) -> Order:
        """Create a slice order from an iceberg parent order."""
        slice_order = Order(
            id=f"{parent.id}_slice_{parent.replenished + 1}",
            symbol=parent.symbol,
            exchange=self.exchange_id,
            side=parent.side,
            order_type=OrderType.MARKET,
            quantity=slice_qty,
            price=price,
        )
        notional = price * slice_qty
        slice_order.fee = round(notional * self.fee_pct / 100, 4)
        return slice_order

    def _finalize_iceberg_execution(self, slice_order: Order, parent: IcebergOrder,
                                    price: float) -> None:
        """Deduct fee, update position, and log audit events for an iceberg slice."""
        old_balance = self.account.balance
        self.account.balance -= slice_order.fee
        self.account.total_fees += slice_order.fee
        self._update_position(slice_order, None, None)

        self._audit_logger.log(
            event_type=AuditEventType.ACCOUNT_BALANCE_CHANGE,
            exchange=self.exchange_id,
            old_value=old_balance,
            new_value=self.account.balance,
            reason="FEE",
            metadata={"fee": slice_order.fee, "order_id": slice_order.id},
        )
        self._audit_logger.log(
            event_type=AuditEventType.ORDER_FILLED,
            exchange=self.exchange_id,
            symbol=parent.symbol,
            order_id=slice_order.id,
            old_value=price,
            new_value=price,
            metadata={"order_type": "ICEBERG_SLICE", "quantity": slice_order.filled_quantity,
                      "fee": slice_order.fee, "parent_order": parent.id},
        )
