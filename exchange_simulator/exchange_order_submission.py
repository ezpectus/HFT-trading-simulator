"""Order submission mixin for SimulatedExchange.

Extracted from exchange.py for file-size compliance.
Handles order creation, validation, and execution. Position open/close
lifecycle lives in exchange_position_lifecycle.py.
"""
from exchange_simulator.models import (
    AuditEventType,
    IcebergOrder,
    OCOGroup,
    Order,
    OrderStatus,
    OrderType,
    Side,
    StopLimitOrder,
    TrailingStopOrder,
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
        time_in_force: str = "GTC",
        post_only: bool = False,
        expire_ts: float | None = None,
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
            time_in_force: GTC | IOC | FOK | GTD (GTD requires expire_ts).
            post_only: LIMIT only — reject instead of filling when marketable.
            expire_ts: Unix seconds at which a resting order expires (GTD).
        """
        order_id = f"{self._order_counter:08x}"
        self._order_counter += 1

        MAX_QUANTITY = 1e9
        if quantity <= 0 or quantity != quantity:  # NaN check
            return self._reject_order(order_id, symbol, side, order_type, quantity, price,
                                      f"INVALID_QUANTITY (qty={quantity})")
        if quantity > MAX_QUANTITY:
            return self._reject_order(order_id, symbol, side, order_type, quantity, price,
                                      f"QUANTITY_TOO_LARGE (qty={quantity}, max={MAX_QUANTITY})")

        order = self._create_order(order_id, symbol, side, order_type, quantity, price,
                                   stop_price, limit_price, trail_amount, trail_percentage,
                                   iceberg_visible_qty)
        if order is None:
            return self._reject_order(order_id, symbol, side, order_type, quantity, price,
                                      "INVALID_ORDER_PARAMETERS")
        if time_in_force not in ("GTC", "IOC", "FOK", "GTD"):
            return self._reject_order(order_id, symbol, side, order_type, quantity, price,
                                      f"INVALID_TIME_IN_FORCE ({time_in_force})", order=order)
        if order_type != OrderType.LIMIT and (
                time_in_force != "GTC" or post_only or expire_ts is not None):
            return self._reject_order(order_id, symbol, side, order_type, quantity, price,
                                      "TIME_IN_FORCE_LIMIT_ONLY", order=order)
        if expire_ts is not None and time_in_force != "GTD":
            return self._reject_order(order_id, symbol, side, order_type, quantity, price,
                                      "EXPIRE_REQUIRES_GTD", order=order)
        order.time_in_force = time_in_force
        order.post_only = post_only
        if time_in_force == "GTD":
            if expire_ts is None:
                return self._reject_order(order_id, symbol, side, order_type, quantity, price,
                                          "GTD_MISSING_EXPIRY", order=order)
            order.expire_ts = expire_ts

        if oco_group_id:
            order.oco_group_id = oco_group_id
            group = self._oco_groups.get(oco_group_id)
            if group is None:
                group = OCOGroup(id=oco_group_id)
                self._oco_groups[oco_group_id] = group
            group.add_order(order)
            if group.filled_order_id is not None:
                order.status = OrderStatus.CANCELLED
                order.rejection_reason = "OCO_GROUP_RESOLVED"
                self._order_history.append(order)
                self._audit_logger.log(
                    event_type=AuditEventType.ORDER_CANCELLED,
                    exchange=self.exchange_id, symbol=symbol, order_id=order_id,
                    reason="OCO_GROUP_RESOLVED",
                    metadata={"oco_group_id": oco_group_id,
                              "filled_order_id": group.filled_order_id},
                )
                return order

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
                                         order_id, symbol, quantity, post_only):
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
                slice_size=iceberg_visible_qty, replenished=0,
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
                                 fill_price, order_id, symbol, quantity,
                                 post_only=False) -> bool:
        """Decide a LIMIT order's fate: rest, fill, cancel, or reject.

        - marketable + post_only → REJECTED (POST_ONLY_WOULD_TAKE)
        - not marketable + IOC/FOK → CANCELLED (never rests)
        - not marketable + GTC/GTD → PENDING (rests; GTD expires via expire_ts)
        Returns True if the order was consumed (rested/cancelled/rejected);
        False means it is marketable and should fill via _fill_market_order.
        """
        if order_type != OrderType.LIMIT or price is None:
            return False
        marketable = (side == Side.BUY and price >= fill_price) or \
                     (side == Side.SELL and price <= fill_price)
        if marketable:
            if post_only:
                order.status = OrderStatus.REJECTED
                order.rejection_reason = "POST_ONLY_WOULD_TAKE"
                self._order_history.append(order)
                self._audit_logger.log(
                    event_type=AuditEventType.ORDER_REJECTED,
                    exchange=self.exchange_id, symbol=symbol, order_id=order_id,
                    reason=order.rejection_reason,
                    metadata={"order_type": order_type.value, "price": price},
                )
                return True
            if order.time_in_force == "FOK" and not self._depth_covers(
                    symbol, side, price, quantity):
                order.status = OrderStatus.CANCELLED
                order.rejection_reason = "FOK_INSUFFICIENT_DEPTH"
                self._order_history.append(order)
                self._audit_logger.log(
                    event_type=AuditEventType.ORDER_CANCELLED,
                    exchange=self.exchange_id, symbol=symbol, order_id=order_id,
                    reason=order.rejection_reason,
                    metadata={"order_type": order_type.value, "price": price,
                              "quantity": quantity},
                )
                return True
            return False
        if order.time_in_force in ("IOC", "FOK"):
            order.status = OrderStatus.CANCELLED
            order.rejection_reason = f"{order.time_in_force}_UNFILLED"
            self._order_history.append(order)
            self._audit_logger.log(
                event_type=AuditEventType.ORDER_CANCELLED,
                exchange=self.exchange_id, symbol=symbol, order_id=order_id,
                reason=order.rejection_reason,
                metadata={"order_type": order_type.value, "price": price,
                          "time_in_force": order.time_in_force},
            )
            return True
        order.status = OrderStatus.PENDING
        self._pending_limits[order_id] = order
        self._order_history.append(order)
        self._audit_logger.log(
            event_type=AuditEventType.ORDER_SUBMITTED,
            exchange=self.exchange_id, symbol=symbol, order_id=order_id,
            metadata={"order_type": order_type.value, "price": price, "quantity": quantity,
                      "time_in_force": order.time_in_force, "expire_ts": order.expire_ts},
        )
        return True

    def _depth_covers(self, symbol, side, limit_price, quantity) -> bool:
        """Cumulative book depth fillable at limit_price covers quantity (FOK check)."""
        try:
            book = self.get_order_book(symbol)
        except Exception:
            return True  # no book data → fall back to slippage model
        levels = book.asks if side == Side.BUY else book.bids
        depth = sum(qty for px, qty in levels
                    if (side == Side.BUY and px <= limit_price)
                    or (side == Side.SELL and px >= limit_price))
        return depth >= quantity

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
        order_margin = 0.0 if force_close else self._lock_margin(notional)
        self._update_position(order, stop_loss, take_profit, order_margin)
        self._order_history.append(order)
        self._resolve_oco(order)
        return order

    def _resolve_oco(self, order: Order) -> None:
        """Cancel sibling orders in the same OCO group when an order fills."""
        if not order.oco_group_id:
            return
        group = self._oco_groups.get(order.oco_group_id)
        if group is None or group.filled_order_id is not None:
            return
        for cancelled in group.on_fill(order.id):
            self._pending_stop_limits.pop(cancelled.id, None)
            self._pending_trailing_stops.pop(cancelled.id, None)
            self._pending_icebergs.pop(cancelled.id, None)
            self._pending_limits.pop(cancelled.id, None)
            self._audit_logger.log(
                event_type=AuditEventType.ORDER_CANCELLED,
                exchange=self.exchange_id, symbol=cancelled.symbol,
                order_id=cancelled.id, reason="OCO_SIBLING_FILLED",
                metadata={"oco_group_id": order.oco_group_id,
                          "filled_order_id": order.id},
            )

    def _lock_margin(self, notional: float) -> float:
        """Lock initial margin for a filled order. Returns the locked amount."""
        lev = self.account.leverage if self.account.leverage > 0 else 1
        margin = notional / lev
        old_balance = self.account.balance
        self.account.balance -= margin
        self._audit_logger.log(
            event_type=AuditEventType.ACCOUNT_BALANCE_CHANGE,
            exchange=self.exchange_id, old_value=old_balance,
            new_value=self.account.balance, reason="MARGIN_LOCKED",
            metadata={"margin": round(margin, 4), "notional": round(notional, 2)},
        )
        return margin

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
