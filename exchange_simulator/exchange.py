"""Simulated exchange — order matching engine with fees and slippage.

Each exchange (Binance, Bybit, OKX) has its own fee structure and slippage
model. Orders are matched against the simulated order book.
"""

from exchange_simulator.market_simulator import MarketSimulator
from exchange_simulator.models import (
    Account,
    AuditEventType,
    ClosedTrade,
    IcebergOrder,
    OCOGroup,
    Order,
    OrderBook,
    OrderStatus,
    OrderType,
    Position,
    Side,
    StopLimitOrder,
    TrailingStopOrder,
)
from exchange_simulator.audit_logger import get_audit_logger

# Constant for market impact and partial fill calculations
_TYPICAL_VOLUME = 500.0


class SimulatedExchange:
    """A single simulated exchange with order matching.

    Handles market and limit orders, applies fees and slippage,
    tracks positions and account balance.
    """

    def __init__(
        self,
        exchange_id: str,
        name: str,
        fee_pct: float,
        slippage_bps: float,
        market: MarketSimulator,
        initial_balance: float = 10000.0,
        leverage: int = 10,
    ):
        self.exchange_id = exchange_id
        self.name = name
        self.fee_pct = fee_pct
        self.slippage_bps = slippage_bps
        self.market = market
        self.account = Account(
            exchange=exchange_id,
            balance=initial_balance,
            leverage=leverage,
        )
        self._order_history: list[Order] = []
        self._order_counter: int = 0
        self.insurance_fund: float = 0.0
        self.partial_liquidation_ratio: float = 0.5  # 50% partial liq before full
        # O(1) position lookup by symbol — maintained alongside account.positions
        self._positions_by_symbol: dict[str, Position] = {}
        # Audit logger
        self._audit_logger = get_audit_logger()
        
        # Advanced order tracking (Phase 3)
        self._pending_stop_limits: dict[str, StopLimitOrder] = {}  # order_id -> order
        self._pending_trailing_stops: dict[str, TrailingStopOrder] = {}  # order_id -> order
        self._pending_icebergs: dict[str, IcebergOrder] = {}  # order_id -> order
        self._oco_groups: dict[str, OCOGroup] = {}  # group_id -> OCOGroup
        
        # Log system start
        self._audit_logger.log(
            event_type=AuditEventType.SYSTEM_START,
            exchange=exchange_id,
            metadata={"name": name, "initial_balance": initial_balance, "leverage": leverage},
        )

    @property
    def symbols(self) -> list[str]:
        return self.market.symbols

    def get_price(self, symbol: str) -> float:
        return self.market.get_price(symbol, self.exchange_id)

    def get_order_book(self, symbol: str) -> OrderBook:
        return self.market.generate_order_book(self.exchange_id, symbol)

    def get_candles(self, symbol: str, n: int = 100):
        return self.market.get_history(self.exchange_id, symbol, n)

    def check_advanced_orders(self) -> list[Order]:
        """Check and process pending advanced orders (Phase 3).
        
        Returns:
            List of orders that were filled during this check.
        """
        filled_orders = []
        current_prices = {symbol: self.get_price(symbol) for symbol in self.symbols}

        # Check Stop-Limit orders
        to_remove = []
        for order_id, order in self._pending_stop_limits.items():
            current_price = current_prices.get(order.symbol, 0)
            if current_price == 0:
                continue
            
            if order.check_trigger(current_price):
                # Stop price hit, now execute as limit order
                if order.side == Side.BUY:
                    # Buy stop-limit: buy at limit price or better
                    if current_price <= order.limit_price:
                        filled_order = self._execute_limit_order(order, order.limit_price)
                        filled_orders.append(filled_order)
                        to_remove.append(order_id)
                else:
                    # Sell stop-limit: sell at limit price or better
                    if current_price >= order.limit_price:
                        filled_order = self._execute_limit_order(order, order.limit_price)
                        filled_orders.append(filled_order)
                        to_remove.append(order_id)
        
        for order_id in to_remove:
            self._pending_stop_limits.pop(order_id, None)

        # Check Trailing Stop orders
        to_remove = []
        for order_id, order in self._pending_trailing_stops.items():
            current_price = current_prices.get(order.symbol, 0)
            if current_price == 0:
                continue
            
            order.update_stop_price(current_price)
            
            # Check if stop price is hit
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

        # Check Iceberg orders
        to_remove = []
        for order_id, order in self._pending_icebergs.items():
            current_price = current_prices.get(order.symbol, 0)
            if current_price == 0:
                continue
            
            # Execute visible quantity
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

        return filled_orders

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
        
        # Update account
        self.account.balance -= order.fee
        self._update_position(order, None, None)
        
        self._audit_logger.log(
            event_type=AuditEventType.ORDER_FILLED,
            exchange=self.exchange_id,
            symbol=order.symbol,
            order_id=order.id,
            old_value=price,
            new_value=price,
            metadata={"order_type": order.order_type.value, "quantity": order.quantity, "fee": order.fee},
        )
        
        return order

    def _execute_market_order(self, order: Order, price: float) -> Order:
        """Execute a market order at current price (Phase 3 helper).

        Applies slippage consistent with submit_order() so advanced orders
        (trailing stops) experience realistic execution prices.
        """
        # Apply slippage
        slippage_amount = price * self.slippage_bps / 10000
        if order.side == Side.BUY:
            fill_price = price + slippage_amount
        else:
            fill_price = price - slippage_amount

        if not self._check_margin(order, fill_price):
            return order
        order.status = OrderStatus.FILLED
        order.filled_price = round(fill_price, 2)
        order.filled_quantity = order.quantity
        order.slippage = round(slippage_amount, 4)
        notional = fill_price * order.quantity
        order.fee = round(notional * self.fee_pct / 100, 4)

        # Update account
        self.account.balance -= order.fee
        self._update_position(order, None, None)

        self._audit_logger.log(
            event_type=AuditEventType.ORDER_FILLED,
            exchange=self.exchange_id,
            symbol=order.symbol,
            order_id=order.id,
            old_value=price,
            new_value=fill_price,
            metadata={"order_type": order.order_type.value, "quantity": order.quantity, "fee": order.fee, "slippage": order.slippage},
        )

        return order

    def _execute_iceberg_slice(self, order: IcebergOrder, price: float) -> Order:
        """Execute a slice of an iceberg order (Phase 3 helper)."""
        slice_qty = min(order.visible_quantity, order.hidden_quantity)

        slice_order = Order(
            id=f"{order.id}_slice_{order.replenished + 1}",
            symbol=order.symbol,
            exchange=self.exchange_id,
            side=order.side,
            order_type=OrderType.MARKET,
            quantity=slice_qty,
            price=price,
        )

        notional = price * slice_qty
        slice_order.fee = round(notional * self.fee_pct / 100, 4)

        if not self._check_margin(slice_order, price):
            return slice_order

        # Margin passed — commit the slice
        order.hidden_quantity -= slice_qty
        order.replenished += 1

        slice_order.status = OrderStatus.FILLED
        slice_order.filled_price = round(price, 2)
        slice_order.filled_quantity = slice_qty

        # Update account
        self.account.balance -= slice_order.fee
        self._update_position(slice_order, None, None)
        
        self._audit_logger.log(
            event_type=AuditEventType.ORDER_FILLED,
            exchange=self.exchange_id,
            symbol=order.symbol,
            order_id=slice_order.id,
            old_value=price,
            new_value=price,
            metadata={"order_type": "ICEBERG_SLICE", "quantity": slice_qty, "fee": slice_order.fee, "parent_order": order.id},
        )
        
        return slice_order

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
        stop_price: float | None = None,  # Phase 3: for Stop-Limit
        limit_price: float | None = None,  # Phase 3: for Stop-Limit
        trail_amount: float | None = None,  # Phase 3: for Trailing Stop
        trail_percentage: bool = True,  # Phase 3: for Trailing Stop
        iceberg_visible_qty: float | None = None,  # Phase 3: for Iceberg
        oco_group_id: str | None = None,  # Phase 3: for OCO
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
            order = Order(
                id=order_id, symbol=symbol, exchange=self.exchange_id,
                side=side, order_type=order_type, quantity=quantity, price=price,
            )
            order.status = OrderStatus.REJECTED
            order.rejection_reason = f"INVALID_QUANTITY (qty={quantity})"
            self._order_history.append(order)
            
            # Log order rejection
            self._audit_logger.log(
                event_type=AuditEventType.ORDER_REJECTED,
                exchange=self.exchange_id,
                symbol=symbol,
                order_id=order_id,
                reason=order.rejection_reason,
                metadata={"quantity": quantity, "order_type": order_type.value},
            )
            return order

        # Phase 3: Create appropriate order type based on order_type
        if order_type == OrderType.STOP_LIMIT:
            if stop_price is None or limit_price is None:
                order = Order(
                    id=order_id, symbol=symbol, exchange=self.exchange_id,
                    side=side, order_type=order_type, quantity=quantity, price=price,
                )
                order.status = OrderStatus.REJECTED
                order.rejection_reason = "STOP_LIMIT_REQUIRES_STOP_AND_LIMIT_PRICE"
                self._order_history.append(order)
                self._audit_logger.log(
                    event_type=AuditEventType.ORDER_REJECTED,
                    exchange=self.exchange_id,
                    symbol=symbol,
                    order_id=order_id,
                    reason=order.rejection_reason,
                    metadata={"order_type": order_type.value},
                )
                return order
            order = StopLimitOrder(
                id=order_id, symbol=symbol, exchange=self.exchange_id,
                side=side, order_type=order_type, quantity=quantity, price=price,
                stop_price=stop_price, limit_price=limit_price, triggered=False,
            )
        elif order_type == OrderType.TRAILING_STOP:
            if trail_amount is None or trail_amount <= 0:
                order = Order(
                    id=order_id, symbol=symbol, exchange=self.exchange_id,
                    side=side, order_type=order_type, quantity=quantity, price=price,
                )
                order.status = OrderStatus.REJECTED
                order.rejection_reason = "TRAILING_STOP_REQUIRES_TRAIL_AMOUNT"
                self._order_history.append(order)
                self._audit_logger.log(
                    event_type=AuditEventType.ORDER_REJECTED,
                    exchange=self.exchange_id,
                    symbol=symbol,
                    order_id=order_id,
                    reason=order.rejection_reason,
                    metadata={"order_type": order_type.value},
                )
                return order
            order = TrailingStopOrder(
                id=order_id, symbol=symbol, exchange=self.exchange_id,
                side=side, order_type=order_type, quantity=quantity, price=price,
                trail_amount=trail_amount, trail_percentage=trail_percentage,
                stop_price=0.0, highest_price=0.0, lowest_price=0.0, activated=False,
            )
        elif order_type == OrderType.ICEBERG:
            if iceberg_visible_qty is None or iceberg_visible_qty <= 0 or iceberg_visible_qty >= quantity:
                order = Order(
                    id=order_id, symbol=symbol, exchange=self.exchange_id,
                    side=side, order_type=order_type, quantity=quantity, price=price,
                )
                order.status = OrderStatus.REJECTED
                order.rejection_reason = "ICEBERG_REQUIRES_VALID_VISIBLE_QTY"
                self._order_history.append(order)
                self._audit_logger.log(
                    event_type=AuditEventType.ORDER_REJECTED,
                    exchange=self.exchange_id,
                    symbol=symbol,
                    order_id=order_id,
                    reason=order.rejection_reason,
                    metadata={"order_type": order_type.value},
                )
                return order
            order = IcebergOrder(
                id=order_id, symbol=symbol, exchange=self.exchange_id,
                side=side, order_type=order_type, quantity=quantity, price=price,
                visible_quantity=iceberg_visible_qty, hidden_quantity=quantity - iceberg_visible_qty,
                replenished=0,
            )
        else:
            order = Order(
                id=order_id,
                symbol=symbol,
                exchange=self.exchange_id,
                side=side,
                order_type=order_type,
                quantity=quantity,
                price=price,
            )

        mid_price = self.get_price(symbol)
        if mid_price == 0:
            order.status = OrderStatus.REJECTED
            order.rejection_reason = "NO_PRICE_DATA"
            self._order_history.append(order)
            
            self._audit_logger.log(
                event_type=AuditEventType.ORDER_REJECTED,
                exchange=self.exchange_id,
                symbol=symbol,
                order_id=order_id,
                reason=order.rejection_reason,
                metadata={"order_type": order_type.value},
            )
            return order

        # Apply slippage
        slippage_amount = mid_price * self.slippage_bps / 10000
        if side == Side.BUY:
            fill_price = mid_price + slippage_amount
        else:
            fill_price = mid_price - slippage_amount

        # Market impact: large orders move price further
        # Impact = k * (qty / typical_volume) where k is impact coefficient
        impact_coeff = 0.001  # 10bps per typical_volume unit
        order_ratio = quantity / _TYPICAL_VOLUME
        if order_ratio > 0.1:  # only apply for non-trivial sizes
            impact = mid_price * impact_coeff * order_ratio
            if side == Side.BUY:
                fill_price += impact
            else:
                fill_price -= impact

        # Phase 3: Handle advanced order types
        if order_type == OrderType.STOP_LIMIT:
            # Stop-Limit: wait for stop price to trigger, then becomes limit order
            order.status = OrderStatus.PENDING
            self._pending_stop_limits[order_id] = order
            self._order_history.append(order)
            self._audit_logger.log(
                event_type=AuditEventType.ORDER_SUBMITTED,
                exchange=self.exchange_id,
                symbol=symbol,
                order_id=order_id,
                metadata={"order_type": order_type.value, "stop_price": stop_price, "limit_price": limit_price, "quantity": quantity},
            )
            return order
        elif order_type == OrderType.TRAILING_STOP:
            # Trailing Stop: track price movement and update stop price
            order.status = OrderStatus.PENDING
            order.highest_price = mid_price if side == Side.SELL else 0.0
            order.lowest_price = mid_price if side == Side.BUY else 0.0
            self._pending_trailing_stops[order_id] = order
            self._order_history.append(order)
            self._audit_logger.log(
                event_type=AuditEventType.ORDER_SUBMITTED,
                exchange=self.exchange_id,
                symbol=symbol,
                order_id=order_id,
                metadata={"order_type": order_type.value, "trail_amount": trail_amount, "trail_percentage": trail_percentage, "quantity": quantity},
            )
            return order
        elif order_type == OrderType.ICEBERG:
            # Iceberg: execute visible quantity first, hide the rest
            order.status = OrderStatus.PENDING
            self._pending_icebergs[order_id] = order
            self._order_history.append(order)
            self._audit_logger.log(
                event_type=AuditEventType.ORDER_SUBMITTED,
                exchange=self.exchange_id,
                symbol=symbol,
                order_id=order_id,
                metadata={"order_type": order_type.value, "visible_quantity": iceberg_visible_qty, "total_quantity": quantity},
            )
            return order

        # For limit orders, check if price is achievable
        if order_type == OrderType.LIMIT and price is not None:
            if side == Side.BUY and price < fill_price:
                order.status = OrderStatus.PENDING
                self._order_history.append(order)
                
                self._audit_logger.log(
                    event_type=AuditEventType.ORDER_SUBMITTED,
                    exchange=self.exchange_id,
                    symbol=symbol,
                    order_id=order_id,
                    metadata={"order_type": order_type.value, "price": price, "quantity": quantity},
                )
                return order
            if side == Side.SELL and price > fill_price:
                order.status = OrderStatus.PENDING
                self._order_history.append(order)
                
                self._audit_logger.log(
                    event_type=AuditEventType.ORDER_SUBMITTED,
                    exchange=self.exchange_id,
                    symbol=symbol,
                    order_id=order_id,
                    metadata={"order_type": order_type.value, "price": price, "quantity": quantity},
                )
                return order
            fill_price = price

        # Calculate fee
        notional = fill_price * quantity
        fee = notional * self.fee_pct / 100

        # Check balance first — if you can't afford it, reject before size check
        lev = self.account.leverage if self.account.leverage > 0 else 1
        margin_required = notional / lev
        if not force_close and margin_required + fee > self.account.balance:
            order.status = OrderStatus.REJECTED
            order.rejection_reason = f"INSUFFICIENT_MARGIN (need ${margin_required:.2f}, have ${self.account.balance:.2f})"
            self._order_history.append(order)
            
            self._audit_logger.log(
                event_type=AuditEventType.ORDER_REJECTED,
                exchange=self.exchange_id,
                symbol=symbol,
                order_id=order_id,
                reason=order.rejection_reason,
                metadata={"margin_required": margin_required, "balance": self.account.balance},
            )
            return order

        # Check max position size (50% of balance * leverage as notional cap)
        # Use mid_price notional so slippage doesn't cause boundary rejection
        mid_notional = mid_price * quantity
        max_notional = self.account.balance * self.account.leverage * 0.5
        if not force_close and mid_notional > max_notional:
            order.status = OrderStatus.REJECTED
            order.rejection_reason = f"MAX_POSITION_SIZE (notional ${notional:.2f} > limit ${max_notional:.2f})"
            self._order_history.append(order)
            
            self._audit_logger.log(
                event_type=AuditEventType.ORDER_REJECTED,
                exchange=self.exchange_id,
                symbol=symbol,
                order_id=order_id,
                reason=order.rejection_reason,
                metadata={"notional": notional, "max_notional": max_notional},
            )
            return order

        # Fill the order
        order.status = OrderStatus.FILLED
        order.filled_price = round(fill_price, 2)
        order.filled_quantity = quantity
        order.fee = round(fee, 4)
        order.slippage = round(slippage_amount, 4)
        
        # Log order fill
        self._audit_logger.log(
            event_type=AuditEventType.ORDER_FILLED,
            exchange=self.exchange_id,
            symbol=symbol,
            order_id=order_id,
            old_value=mid_price,
            new_value=fill_price,
            metadata={
                "side": side.value,
                "quantity": quantity,
                "fee": fee,
                "slippage": order.slippage,
                "order_type": order_type.value,
            },
        )

        # Partial fill simulation for large orders
        if quantity > _TYPICAL_VOLUME * 0.5:
            # Simulate partial fill at worse price for portion of order
            fill_ratio = min(1.0, _TYPICAL_VOLUME / quantity)
            if fill_ratio < 1.0:
                # First portion fills at normal price, rest at worse price
                worse_price = fill_price * (1 + (1 - fill_ratio) * 0.001 * (1 if side == Side.BUY else -1))
                avg_fill = fill_price * fill_ratio + worse_price * (1 - fill_ratio)
                order.filled_price = round(avg_fill, 2)
                order.slippage = round(avg_fill - mid_price, 4)

        # Update account
        old_balance = self.account.balance
        self.account.balance -= fee
        self.account.total_fees += fee
        
        # Log balance change (fee)
        self._audit_logger.log(
            event_type=AuditEventType.ACCOUNT_BALANCE_CHANGE,
            exchange=self.exchange_id,
            old_value=old_balance,
            new_value=self.account.balance,
            reason="FEE",
            metadata={"fee": fee, "order_id": order_id},
        )

        # Create or close position
        self._update_position(order, stop_loss, take_profit)

        self._order_history.append(order)
        return order

    def _update_position(
        self,
        order: Order,
        stop_loss: float | None,
        take_profit: float | None,
    ) -> None:
        """Update positions based on filled order."""
        # O(1) lookup by symbol — replaces linear scan through positions list
        existing = self._positions_by_symbol.get(order.symbol)

        if existing:
            if existing.side != order.side:
                close_qty = min(order.filled_quantity, existing.quantity)

                # Close position (full or partial)
                if existing.is_long:
                    pnl = (order.filled_price - existing.entry_price) * close_qty
                else:
                    pnl = (existing.entry_price - order.filled_price) * close_qty

                old_balance = self.account.balance
                self.account.balance += pnl
                self.account.total_pnl += pnl
                self.account.total_trades += 1
                if pnl > 0:
                    self.account.winning_trades += 1

                # Record closed trade
                self.account.trade_history.append(ClosedTrade(
                    symbol=existing.symbol,
                    exchange=self.exchange_id,
                    side=existing.side.value,
                    quantity=close_qty,
                    entry_price=existing.entry_price,
                    exit_price=order.filled_price,
                    pnl=round(pnl, 2),
                    fee=order.fee,
                    reason="MANUAL",
                    opened_at=existing.opened_at,
                ))

                # Log position close
                self._audit_logger.log(
                    event_type=AuditEventType.POSITION_CLOSED,
                    exchange=self.exchange_id,
                    symbol=order.symbol,
                    position_id=f"{order.symbol}_{existing.opened_at}",
                    old_value=existing.entry_price,
                    new_value=order.filled_price,
                    reason="MANUAL",
                    metadata={
                        "side": existing.side.value,
                        "quantity": close_qty,
                        "pnl": pnl,
                        "order_id": order.id,
                    },
                )

                # Log balance change (PnL)
                self._audit_logger.log(
                    event_type=AuditEventType.ACCOUNT_BALANCE_CHANGE,
                    exchange=self.exchange_id,
                    old_value=old_balance,
                    new_value=self.account.balance,
                    reason="PNL",
                    metadata={"pnl": pnl, "symbol": order.symbol},
                )

                if close_qty >= existing.quantity:
                    # Full close
                    self.account.positions.remove(existing)
                    del self._positions_by_symbol[order.symbol]
                else:
                    # Partial close — reduce position, keep remainder
                    existing.quantity -= close_qty
                return
            else:
                # Same side — add to position (simplified)
                total_qty = existing.quantity + order.filled_quantity
                avg_price = (
                    (existing.entry_price * existing.quantity + order.filled_price * order.filled_quantity)
                    / total_qty
                )
                existing.quantity = total_qty
                existing.entry_price = avg_price
                return

        # New position
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
            symbol=order.symbol,
            exchange=self.exchange_id,
            side=order.side,
            quantity=order.filled_quantity,
            entry_price=order.filled_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
        )
        self.account.positions.append(position)
        self._positions_by_symbol[order.symbol] = position
        
        # Log position open
        self._audit_logger.log(
            event_type=AuditEventType.POSITION_OPENED,
            exchange=self.exchange_id,
            symbol=order.symbol,
            position_id=f"{order.symbol}_{position.opened_at}",
            new_value=order.filled_price,
            metadata={
                "side": order.side.value,
                "quantity": order.filled_quantity,
                "stop_loss": stop_loss,
                "take_profit": take_profit,
                "order_id": order.id,
            },
        )

    def check_stop_loss_take_profit(self) -> list[Order]:
        """Check all positions for SL/TP/liquidation triggers and close them.

        Liquidation engine supports partial liquidation: when a position hits
        the liquidation price, a portion is closed first (partial_liquidation_ratio).
        If the position continues to deteriorate, the remainder is fully liquidated.
        Any residual loss after full liquidation is covered by the insurance fund.
        """
        closed_orders = []
        positions_to_close = []

        for pos in self.account.positions:
            current_price = self.get_price(pos.symbol)
            pos.update_pnl(current_price)

            # Calculate liquidation prices
            lev = self.account.leverage if self.account.leverage > 0 else 1
            if pos.is_long:
                liq_price = round(pos.entry_price * (1 - 1/lev + 0.005), 2)
                partial_liq_price = round(pos.entry_price * (
                    1 - 1/lev * self.partial_liquidation_ratio + 0.005
                ), 2)
            else:
                liq_price = round(pos.entry_price * (1 + 1/lev - 0.005), 2)
                partial_liq_price = round(pos.entry_price * (
                    1 + 1/lev * self.partial_liquidation_ratio - 0.005
                ), 2)

            # Full liquidation check
            is_full_liquidation = False
            is_partial_liquidation = False
            if pos.is_long:
                if current_price <= liq_price:
                    is_full_liquidation = True
                elif current_price <= partial_liq_price:
                    is_partial_liquidation = True
            else:
                if current_price >= liq_price:
                    is_full_liquidation = True
                elif current_price >= partial_liq_price:
                    is_partial_liquidation = True

            if is_full_liquidation:
                positions_to_close.append((pos, "LIQUIDATION", pos.quantity))
                continue

            if is_partial_liquidation:
                partial_qty = pos.quantity * self.partial_liquidation_ratio
                positions_to_close.append((pos, "PARTIAL_LIQUIDATION", partial_qty))
                continue

            # SL/TP checks
            if pos.is_long:
                if current_price <= pos.stop_loss:
                    positions_to_close.append((pos, "STOP_LOSS", pos.quantity))
                elif current_price >= pos.take_profit:
                    positions_to_close.append((pos, "TAKE_PROFIT", pos.quantity))
            else:
                if current_price >= pos.stop_loss:
                    positions_to_close.append((pos, "STOP_LOSS", pos.quantity))
                elif current_price <= pos.take_profit:
                    positions_to_close.append((pos, "TAKE_PROFIT", pos.quantity))

        for pos, reason, close_qty in positions_to_close:
            close_side = Side.SELL if pos.is_long else Side.BUY
            current_price = self.get_price(pos.symbol)

            if reason == "PARTIAL_LIQUIDATION":
                # Handle partial close directly — don't call submit_order
                # because it would close the entire position
                if pos.is_long:
                    pnl = (current_price - pos.entry_price) * close_qty
                else:
                    pnl = (pos.entry_price - current_price) * close_qty

                self.account.balance += pnl
                self.account.total_pnl += pnl
                self.account.total_trades += 1
                if pnl > 0:
                    self.account.winning_trades += 1

                self.account.trade_history.append(ClosedTrade(
                    symbol=pos.symbol,
                    exchange=self.exchange_id,
                    side=pos.side.value,
                    quantity=close_qty,
                    entry_price=pos.entry_price,
                    exit_price=current_price,
                    pnl=round(pnl, 2),
                    fee=0.0,
                    reason=reason,
                    opened_at=pos.opened_at,
                ))

                pos.quantity -= close_qty
                if pos.quantity <= 1e-12:
                    self.account.positions.remove(pos)
                    self._positions_by_symbol.pop(pos.symbol, None)
                self._order_counter += 1
                order = Order(
                    id=f"ord-{self._order_counter:08d}",
                    symbol=pos.symbol,
                    exchange=self.exchange_id,
                    side=close_side,
                    order_type=OrderType.MARKET,
                    quantity=close_qty,
                )
                order.status = OrderStatus.FILLED
                order.filled_price = current_price
                order.filled_quantity = close_qty
                closed_orders.append(order)
                continue

            order = self.submit_order(
                symbol=pos.symbol,
                side=close_side,
                quantity=close_qty,
                order_type=OrderType.MARKET,
                force_close=True,
            )
            order.status = OrderStatus.FILLED

            # Full close — check if insurance fund is needed
            if reason == "LIQUIDATION":
                # If balance went negative from liquidation, cover from insurance fund
                if self.account.balance < 0:
                    deficit = abs(self.account.balance)
                    self.insurance_fund -= deficit
                    self.account.balance = 0.0
            if self.account.trade_history:
                self.account.trade_history[-1].reason = reason
            closed_orders.append(order)

        return closed_orders

    def update_positions_pnl(self) -> None:
        """Update unrealized PnL for all open positions."""
        for pos in self.account.positions:
            current_price = self.get_price(pos.symbol)
            pos.update_pnl(current_price)

    def charge_funding(self, funding_rate: float) -> list[str]:
        """Charge funding rate to all open positions.
        Positive rate: longs pay shorts. Negative: shorts pay longs.
        Returns list of funding notifications.
        """
        notifications = []
        for pos in self.account.positions:
            notional = self.get_price(pos.symbol) * pos.quantity
            # Funding payment: positive rate means longs pay
            if pos.is_long:
                payment = -notional * funding_rate
            else:
                payment = notional * funding_rate

            self.account.balance += payment
            if abs(payment) > 0.01:
                notifications.append(
                    f"{'+' if payment > 0 else ''}{payment:.2f} on {pos.symbol} ({pos.side.value})"
                )

        return notifications

    def get_order_history(self, limit: int = 50) -> list[Order]:
        return self._order_history[-limit:]

    def get_account_status(self) -> dict:
        self.update_positions_pnl()
        return self.account.to_dict()

    def get_depth_snapshot(self, symbol: str, levels: int = 20) -> dict:
        """Return a depth snapshot for a symbol — cumulative bid/ask volumes,
        imbalance, spread, and per-level breakdown.

        Useful for REST API endpoints and depth profile visualization.
        """
        ob = self.get_order_book(symbol)
        if not ob.bids or not ob.asks:
            return {"symbol": symbol, "exchange": self.exchange_id, "bids": [], "asks": [],
                    "spread_bps": 0, "imbalance": 0, "bid_depth": 0, "ask_depth": 0}

        n = min(levels, len(ob.bids), len(ob.asks))
        bid_levels = []
        ask_levels = []
        cum_bid = 0.0
        cum_ask = 0.0

        for i in range(n):
            cum_bid += ob.bids[i].quantity
            cum_ask += ob.asks[i].quantity
            bid_levels.append({
                "price": ob.bids[i].price,
                "quantity": ob.bids[i].quantity,
                "cumulative": round(cum_bid, 4),
            })
            ask_levels.append({
                "price": ob.asks[i].price,
                "quantity": ob.asks[i].quantity,
                "cumulative": round(cum_ask, 4),
            })

        mid = (ob.bids[0].price + ob.asks[0].price) / 2
        spread = ob.asks[0].price - ob.bids[0].price
        spread_bps = (spread / mid * 10000) if mid > 0 else 0
        total = cum_bid + cum_ask
        imbalance = (cum_bid - cum_ask) / total if total > 0 else 0

        return {
            "symbol": symbol,
            "exchange": self.exchange_id,
            "timestamp": self.market.current_timestamp,
            "mid_price": round(mid, 2),
            "spread_bps": round(spread_bps, 2),
            "imbalance": round(imbalance, 4),
            "bid_depth": round(cum_bid, 4),
            "ask_depth": round(cum_ask, 4),
            "bids": bid_levels,
            "asks": ask_levels,
        }
