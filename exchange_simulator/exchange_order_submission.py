"""Order submission and position management mixin for SimulatedExchange.

Extracted from exchange.py for file-size compliance.
Handles order creation, validation, execution, and position updates.
"""
from exchange_simulator.models import (
    AuditEventType,
    IcebergOrder,
    Order,
    OrderStatus,
    OrderType,
    Position,
    Side,
    StopLimitOrder,
    TrailingStopOrder,
    ClosedTrade,
)

_TYPICAL_VOLUME = 500.0


class OrderSubmissionMixin:
    """Mixin providing order submission and position management for SimulatedExchange."""

    def submit_order(
        self,
        symbol: str,
        side: Side,
        quantity: float,
        order_type: OrderType = OrderType.MARKET,
        price: float | None = None,
        stop_loss: float | None = None,
        take_profit: float | None = None,
        force_close: bool = False,
        stop_price: float | None = None,
        limit_price: float | None = None,
        trail_amount: float | None = None,
        trail_percentage: bool = True,
        iceberg_visible_qty: float | None = None,
        oco_group_id: str | None = None,
    ) -> Order:
        """Submit an order and return the result.

        Args:
            force_close: If True, skip margin/position checks (for SL/TP/liquidation closes).
            stop_price: Stop price for Stop-Limit orders (Phase 3).
            limit_price: Limit price for Stop-Limit orders (Phase 3).
            trail_amount: Trailing amount for Trailing Stop orders (Phase 3).
            trail_percentage: If True, trail_amount is percentage (Phase 3).
            iceberg_visible_qty: Visible quantity for Iceberg orders (Phase 3).
            oco_group_id: Group ID for OCO orders (Phase 3).
        """
        order_id = f"{self._order_counter:08x}"
        self._order_counter += 1

        if quantity <= 0 or quantity != quantity:  # NaN check
            return self._reject_order(order_id, symbol, side, order_type, quantity, price,
                                      f"INVALID_QUANTITY (qty={quantity})")

        order = self._create_order(order_id, symbol, side, order_type, quantity, price,
                                   stop_price, limit_price, trail_amount, trail_percentage,
                                   iceberg_visible_qty)
        if order is None:
            return self._reject_order(order_id, symbol, side, order_type, quantity, price,
                                      "INVALID_ORDER_PARAMETERS")

        mid_price = self.get_price(symbol)
        if mid_price == 0:
            return self._reject_order(order_id, symbol, side, order_type, quantity, price,
                                      "NO_PRICE_DATA", order=order)

        fill_price = self._calculate_fill_price(mid_price, side, quantity)

        if self._try_advanced_order(order, order_type, order_id, symbol, quantity,
                                    stop_price, limit_price, trail_amount,
                                    trail_percentage, iceberg_visible_qty):
            return order

        if self._try_limit_order_pending(order, order_type, side, price, fill_price,
                                         order_id, symbol, quantity):
            return order

        return self._fill_market_order(order, order_id, symbol, side, quantity, price,
                                       fill_price, mid_price, stop_loss, take_profit,
                                       force_close)

    def _reject_order(self, order_id, symbol, side, order_type, quantity, price,
                      reason, order=None) -> Order:
        """Create and log a rejected order."""
        if order is None:
            order = Order(
                id=order_id, symbol=symbol, exchange=self.exchange_id,
                side=side, order_type=order_type, quantity=quantity, price=price,
            )
        order.status = OrderStatus.REJECTED
        order.rejection_reason = reason
        self._order_history.append(order)
        self._audit_logger.log(
            event_type=AuditEventType.ORDER_REJECTED,
            exchange=self.exchange_id,
            symbol=symbol,
            order_id=order_id,
            reason=reason,
            metadata={"quantity": quantity, "order_type": order_type.value},
        )
        return order

    def _create_order(self, order_id, symbol, side, order_type, quantity, price,
                      stop_price, limit_price, trail_amount, trail_percentage,
                      iceberg_visible_qty) -> Order | None:
        """Create the appropriate order type based on order_type."""
        if order_type == OrderType.STOP_LIMIT:
            if stop_price is None or limit_price is None:
                return None
            return StopLimitOrder(
                id=order_id, symbol=symbol, exchange=self.exchange_id,
                side=side, order_type=order_type, quantity=quantity, price=price,
                stop_price=stop_price, limit_price=limit_price, triggered=False,
            )
        elif order_type == OrderType.TRAILING_STOP:
            if trail_amount is None or trail_amount <= 0:
                return None
            return TrailingStopOrder(
                id=order_id, symbol=symbol, exchange=self.exchange_id,
                side=side, order_type=order_type, quantity=quantity, price=price,
                trail_amount=trail_amount, trail_percentage=trail_percentage,
                stop_price=0.0, highest_price=0.0, lowest_price=0.0, activated=False,
            )
        elif order_type == OrderType.ICEBERG:
            if iceberg_visible_qty is None or iceberg_visible_qty <= 0 or iceberg_visible_qty >= quantity:
                return None
            return IcebergOrder(
                id=order_id, symbol=symbol, exchange=self.exchange_id,
                side=side, order_type=order_type, quantity=quantity, price=price,
                visible_quantity=iceberg_visible_qty, hidden_quantity=quantity - iceberg_visible_qty,
                replenished=0,
            )
        else:
            return Order(
                id=order_id, symbol=symbol, exchange=self.exchange_id,
                side=side, order_type=order_type, quantity=quantity, price=price,
            )

    def _calculate_fill_price(self, mid_price: float, side: Side, quantity: float) -> float:
        """Calculate fill price with slippage and market impact."""
        slippage_amount = mid_price * self.slippage_bps / 10000
        if side == Side.BUY:
            fill_price = mid_price + slippage_amount
        else:
            fill_price = mid_price - slippage_amount

        impact_coeff = 0.001
        order_ratio = quantity / _TYPICAL_VOLUME
        if order_ratio > 0.1:
            impact = mid_price * impact_coeff * order_ratio
            if side == Side.BUY:
                fill_price += impact
            else:
                fill_price -= impact

        return fill_price

    def _try_advanced_order(self, order, order_type, order_id, symbol, quantity,
                            stop_price, limit_price, trail_amount,
                            trail_percentage, iceberg_visible_qty) -> bool:
        """Handle advanced order types (stop-limit, trailing stop, iceberg).

        Returns True if the order was handled as an advanced order.
        """
        if order_type == OrderType.STOP_LIMIT:
            self._register_stop_limit(order, order_id, symbol, quantity, stop_price, limit_price)
            return True
        elif order_type == OrderType.TRAILING_STOP:
            self._register_trailing_stop(order, order_id, symbol, quantity, trail_amount, trail_percentage)
            return True
        elif order_type == OrderType.ICEBERG:
            self._register_iceberg(order, order_id, symbol, quantity, iceberg_visible_qty)
            return True
        return False

    def _register_stop_limit(self, order, order_id, symbol, quantity,
                             stop_price, limit_price) -> None:
        """Register a stop-limit order as pending."""
        order.status = OrderStatus.PENDING
        self._pending_stop_limits[order_id] = order
        self._order_history.append(order)
        self._audit_logger.log(
            event_type=AuditEventType.ORDER_SUBMITTED,
            exchange=self.exchange_id, symbol=symbol, order_id=order_id,
            metadata={"order_type": OrderType.STOP_LIMIT.value, "stop_price": stop_price,
                      "limit_price": limit_price, "quantity": quantity},
        )

    def _register_trailing_stop(self, order, order_id, symbol, quantity,
                                trail_amount, trail_percentage) -> None:
        """Register a trailing stop order as pending."""
        order.status = OrderStatus.PENDING
        mid_price = self.get_price(symbol)
        order.highest_price = mid_price if order.side == Side.SELL else 0.0
        order.lowest_price = mid_price if order.side == Side.BUY else 0.0
        self._pending_trailing_stops[order_id] = order
        self._order_history.append(order)
        self._audit_logger.log(
            event_type=AuditEventType.ORDER_SUBMITTED,
            exchange=self.exchange_id, symbol=symbol, order_id=order_id,
            metadata={"order_type": OrderType.TRAILING_STOP.value, "trail_amount": trail_amount,
                      "trail_percentage": trail_percentage, "quantity": quantity},
        )

    def _register_iceberg(self, order, order_id, symbol, quantity,
                          iceberg_visible_qty) -> None:
        """Register an iceberg order as pending."""
        order.status = OrderStatus.PENDING
        self._pending_icebergs[order_id] = order
        self._order_history.append(order)
        self._audit_logger.log(
            event_type=AuditEventType.ORDER_SUBMITTED,
            exchange=self.exchange_id, symbol=symbol, order_id=order_id,
            metadata={"order_type": OrderType.ICEBERG.value, "visible_quantity": iceberg_visible_qty,
                      "total_quantity": quantity},
        )

    def _try_limit_order_pending(self, order, order_type, side, price,
                                 fill_price, order_id, symbol, quantity) -> bool:
        """Check if a limit order should go pending.

        Returns True if the order was set to pending.
        """
        if order_type == OrderType.LIMIT and price is not None:
            if side == Side.BUY and price < fill_price:
                order.status = OrderStatus.PENDING
                self._order_history.append(order)
                self._audit_logger.log(
                    event_type=AuditEventType.ORDER_SUBMITTED,
                    exchange=self.exchange_id, symbol=symbol, order_id=order_id,
                    metadata={"order_type": order_type.value, "price": price, "quantity": quantity},
                )
                return True
            if side == Side.SELL and price > fill_price:
                order.status = OrderStatus.PENDING
                self._order_history.append(order)
                self._audit_logger.log(
                    event_type=AuditEventType.ORDER_SUBMITTED,
                    exchange=self.exchange_id, symbol=symbol, order_id=order_id,
                    metadata={"order_type": order_type.value, "price": price, "quantity": quantity},
                )
                return True
        return False

    def _fill_market_order(self, order, order_id, symbol, side, quantity, price,
                           fill_price, mid_price, stop_loss, take_profit,
                           force_close) -> Order:
        """Fill a market/limit order after all checks pass."""
        if order.order_type == OrderType.LIMIT and price is not None:
            fill_price = price

        notional = fill_price * quantity
        fee = notional * self.fee_pct / 100

        rejected = self._check_margin_and_size(order, order_id, symbol, side, quantity,
                                                price, notional, fee, mid_price, force_close)
        if rejected is not None:
            return rejected

        order.status = OrderStatus.FILLED
        order.filled_price = round(fill_price, 2)
        order.filled_quantity = quantity
        order.fee = round(fee, 4)
        order.slippage = round(fill_price - mid_price, 4)

        self._log_order_filled(order_id, symbol, side, quantity, fee, fill_price, mid_price)
        self._apply_partial_fill(order, fill_price, mid_price, side, quantity)
        self._charge_fee(order_id, fee)
        self._update_position(order, stop_loss, take_profit)
        self._order_history.append(order)
        return order

    def _check_margin_and_size(self, order, order_id, symbol, side, quantity, price,
                               notional, fee, mid_price, force_close) -> Order | None:
        """Check margin and position size limits. Returns rejected order or None."""
        lev = self.account.leverage if self.account.leverage > 0 else 1
        margin_required = notional / lev
        if not force_close and margin_required + fee > self.account.balance:
            return self._reject_order(order_id, symbol, side, order.order_type, quantity, price,
                                      f"INSUFFICIENT_MARGIN (need ${margin_required:.2f}, have ${self.account.balance:.2f})",
                                      order=order)
        mid_notional = mid_price * quantity
        max_notional = self.account.balance * self.account.leverage * 0.5
        if not force_close and mid_notional > max_notional:
            return self._reject_order(order_id, symbol, side, order.order_type, quantity, price,
                                      f"MAX_POSITION_SIZE (notional ${notional:.2f} > limit ${max_notional:.2f})",
                                      order=order)
        return None

    def _log_order_filled(self, order_id, symbol, side, quantity, fee,
                          fill_price, mid_price) -> None:
        """Log order filled event."""
        self._audit_logger.log(
            event_type=AuditEventType.ORDER_FILLED,
            exchange=self.exchange_id, symbol=symbol, order_id=order_id,
            old_value=mid_price, new_value=fill_price,
            metadata={"side": side.value, "quantity": quantity, "fee": fee,
                      "slippage": round(fill_price - mid_price, 4),
                      "order_type": "MARKET"},
        )

    def _apply_partial_fill(self, order, fill_price, mid_price, side, quantity) -> None:
        """Apply partial fill logic for large orders."""
        if quantity <= _TYPICAL_VOLUME * 0.5:
            return
        fill_ratio = min(1.0, _TYPICAL_VOLUME / quantity)
        if fill_ratio >= 1.0:
            return
        worse_price = fill_price * (1 + (1 - fill_ratio) * 0.001 * (1 if side == Side.BUY else -1))
        avg_fill = fill_price * fill_ratio + worse_price * (1 - fill_ratio)
        order.filled_price = round(avg_fill, 2)
        order.slippage = round(avg_fill - mid_price, 4)

    def _charge_fee(self, order_id: str, fee: float) -> None:
        """Deduct fee from account balance and log."""
        old_balance = self.account.balance
        self.account.balance -= fee
        self.account.total_fees += fee
        self._audit_logger.log(
            event_type=AuditEventType.ACCOUNT_BALANCE_CHANGE,
            exchange=self.exchange_id, old_value=old_balance,
            new_value=self.account.balance, reason="FEE",
            metadata={"fee": fee, "order_id": order_id},
        )

    def _update_position(
        self,
        order: Order,
        stop_loss: float | None,
        take_profit: float | None,
    ) -> None:
        """Update positions based on filled order."""
        existing = self._positions_by_symbol.get(order.symbol)

        if existing:
            if existing.side != order.side:
                self._close_position(existing, order)
                return
            else:
                total_qty = existing.quantity + order.filled_quantity
                avg_price = (
                    (existing.entry_price * existing.quantity + order.filled_price * order.filled_quantity)
                    / total_qty
                )
                existing.quantity = total_qty
                existing.entry_price = avg_price
                return

        self._open_new_position(order, stop_loss, take_profit)

    def _close_position(self, existing: Position, order: Order) -> None:
        """Close or partially close an existing position."""
        close_qty = min(order.filled_quantity, existing.quantity)
        pnl = self._compute_close_pnl(existing, order, close_qty)

        old_balance = self.account.balance
        self.account.balance += pnl
        self.account.total_pnl += pnl
        self.account.total_trades += 1
        if pnl > 0:
            self.account.winning_trades += 1

        self.account.trade_history.append(ClosedTrade(
            symbol=existing.symbol, exchange=self.exchange_id,
            side=existing.side.value, quantity=close_qty,
            entry_price=existing.entry_price, exit_price=order.filled_price,
            pnl=round(pnl, 2), fee=order.fee, reason="MANUAL",
            opened_at=existing.opened_at,
        ))
        self._log_position_closed(existing, order, close_qty, pnl, old_balance)

        if close_qty >= existing.quantity:
            self.account.positions.remove(existing)
            del self._positions_by_symbol[order.symbol]
        else:
            existing.quantity -= close_qty

    def _compute_close_pnl(self, existing: Position, order: Order, close_qty: float) -> float:
        """Compute PnL for closing a position."""
        if existing.is_long:
            return (order.filled_price - existing.entry_price) * close_qty
        return (existing.entry_price - order.filled_price) * close_qty

    def _log_position_closed(self, existing: Position, order: Order,
                             close_qty: float, pnl: float, old_balance: float) -> None:
        """Log position closed and balance change events."""
        self._audit_logger.log(
            event_type=AuditEventType.POSITION_CLOSED,
            exchange=self.exchange_id, symbol=order.symbol,
            position_id=f"{order.symbol}_{existing.opened_at}",
            old_value=existing.entry_price, new_value=order.filled_price,
            reason="MANUAL",
            metadata={"side": existing.side.value, "quantity": close_qty,
                      "pnl": pnl, "order_id": order.id},
        )
        self._audit_logger.log(
            event_type=AuditEventType.ACCOUNT_BALANCE_CHANGE,
            exchange=self.exchange_id, old_value=old_balance,
            new_value=self.account.balance, reason="PNL",
            metadata={"pnl": pnl, "symbol": order.symbol},
        )

    def _open_new_position(self, order: Order, stop_loss: float | None,
                           take_profit: float | None) -> None:
        """Open a new position from a filled order."""
        if stop_loss is None:
            if order.side == Side.BUY:
                stop_loss = order.filled_price * 0.98
            else:
                stop_loss = order.filled_price * 1.02
        if take_profit is None:
            if order.side == Side.BUY:
                take_profit = order.filled_price * 1.04
            else:
                take_profit = order.filled_price * 0.96

        position = Position(
            symbol=order.symbol, exchange=self.exchange_id,
            side=order.side, quantity=order.filled_quantity,
            entry_price=order.filled_price, stop_loss=stop_loss,
            take_profit=take_profit,
        )
        self.account.positions.append(position)
        self._positions_by_symbol[order.symbol] = position

        self._audit_logger.log(
            event_type=AuditEventType.POSITION_OPENED,
            exchange=self.exchange_id, symbol=order.symbol,
            position_id=f"{order.symbol}_{position.opened_at}",
            new_value=order.filled_price,
            metadata={"side": order.side.value, "quantity": order.filled_quantity,
                      "stop_loss": stop_loss, "take_profit": take_profit,
                      "order_id": order.id},
        )
