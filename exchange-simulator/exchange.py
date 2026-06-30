"""Simulated exchange — order matching engine with fees and slippage.

Each exchange (Binance, Bybit, OKX) has its own fee structure and slippage
model. Orders are matched against the simulated order book.
"""
import time
import uuid
from typing import Optional

from exchange_simulator.models import (
    Account, ClosedTrade, Order, OrderBook, OrderStatus, OrderType, Position, Side,
)
from exchange_simulator.market_simulator import MarketSimulator


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

    @property
    def symbols(self) -> list[str]:
        return self.market.symbols

    def get_price(self, symbol: str) -> float:
        return self.market.get_price(symbol, self.exchange_id)

    def get_order_book(self, symbol: str) -> OrderBook:
        return self.market.generate_order_book(self.exchange_id, symbol)

    def get_candles(self, symbol: str, n: int = 100):
        return self.market.get_history(self.exchange_id, symbol, n)

    def submit_order(
        self,
        symbol: str,
        side: Side,
        quantity: float,
        order_type: OrderType = OrderType.MARKET,
        price: Optional[float] = None,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
    ) -> Order:
        """Submit an order and return the result."""
        order_id = str(uuid.uuid4())[:8]
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
            return order

        # Apply slippage
        slippage_amount = mid_price * self.slippage_bps / 10000
        if side == Side.BUY:
            fill_price = mid_price + slippage_amount
        else:
            fill_price = mid_price - slippage_amount

        # Market impact: large orders move price further
        # Impact = k * (qty / typical_volume) where k is impact coefficient
        typical_volume = 500.0  # baseline volume for impact calc
        impact_coeff = 0.001  # 10bps per typical_volume unit
        order_ratio = quantity / typical_volume
        if order_ratio > 0.1:  # only apply for non-trivial sizes
            impact = mid_price * impact_coeff * order_ratio
            if side == Side.BUY:
                fill_price += impact
            else:
                fill_price -= impact

        # For limit orders, check if price is achievable
        if order_type == OrderType.LIMIT and price is not None:
            if side == Side.BUY and price < fill_price:
                order.status = OrderStatus.PENDING
                self._order_history.append(order)
                return order
            fill_price = price

        # Calculate fee
        notional = fill_price * quantity
        fee = notional * self.fee_pct / 100

        # Check balance
        margin_required = notional / self.account.leverage
        if margin_required + fee > self.account.balance:
            order.status = OrderStatus.REJECTED
            order.rejection_reason = f"INSUFFICIENT_MARGIN (need ${margin_required:.2f}, have ${self.account.balance:.2f})"
            self._order_history.append(order)
            return order

        # Check max position size (10% of balance as notional cap)
        max_notional = self.account.balance * self.account.leverage * 0.5
        if notional > max_notional:
            order.status = OrderStatus.REJECTED
            order.rejection_reason = f"MAX_POSITION_SIZE (notional ${notional:.2f} > limit ${max_notional:.2f})"
            self._order_history.append(order)
            return order

        # Fill the order
        order.status = OrderStatus.FILLED
        order.filled_price = round(fill_price, 2)
        order.filled_quantity = quantity
        order.fee = round(fee, 4)
        order.slippage = round(slippage_amount, 4)

        # Partial fill simulation for large orders
        # If order is large relative to typical volume, split across levels
        typical_vol = 500.0
        if quantity > typical_vol * 0.5:
            # Simulate partial fill at worse price for portion of order
            fill_ratio = min(1.0, typical_vol / quantity)
            if fill_ratio < 1.0:
                # First portion fills at normal price, rest at worse price
                worse_price = fill_price * (1 + (1 - fill_ratio) * 0.001 * (1 if side == Side.BUY else -1))
                avg_fill = fill_price * fill_ratio + worse_price * (1 - fill_ratio)
                order.filled_price = round(avg_fill, 2)
                order.slippage = round(avg_fill - mid_price, 4)

        # Update account
        self.account.balance -= fee
        self.account.total_fees += fee

        # Create or close position
        self._update_position(order, stop_loss, take_profit)

        self._order_history.append(order)
        return order

    def _update_position(
        self,
        order: Order,
        stop_loss: Optional[float],
        take_profit: Optional[float],
    ) -> None:
        """Update positions based on filled order."""
        # Check if we have an opposite position to close
        existing = None
        for p in self.account.positions:
            if p.symbol == order.symbol:
                existing = p
                break

        if existing:
            if existing.side != order.side:
                # Close position
                if existing.is_long:
                    pnl = (order.filled_price - existing.entry_price) * existing.quantity
                else:
                    pnl = (existing.entry_price - order.filled_price) * existing.quantity

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
                    quantity=existing.quantity,
                    entry_price=existing.entry_price,
                    exit_price=order.filled_price,
                    pnl=round(pnl, 2),
                    fee=order.fee,
                    reason="MANUAL",
                    opened_at=existing.opened_at,
                ))

                self.account.positions.remove(existing)
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

    def check_stop_loss_take_profit(self) -> list[Order]:
        """Check all positions for SL/TP/liquidation triggers and close them."""
        closed_orders = []
        positions_to_close = []

        for pos in self.account.positions:
            current_price = self.get_price(pos.symbol)
            pos.update_pnl(current_price)

            # Calculate margin and liquidation
            notional = pos.entry_price * pos.quantity
            margin = notional / self.account.leverage
            maintenance_margin = margin * 0.005  # 0.5% maintenance rate
            equity = self.account.balance + sum(
                p.unrealized_pnl for p in self.account.positions
            )

            # Liquidation: unrealized loss exceeds margin - maintenance
            is_liquidated = False
            if pos.is_long:
                liq_price = pos.entry_price * (1 - 1/self.account.leverage + 0.005)
                if current_price <= liq_price:
                    is_liquidated = True
            else:
                liq_price = pos.entry_price * (1 + 1/self.account.leverage - 0.005)
                if current_price >= liq_price:
                    is_liquidated = True

            if is_liquidated:
                positions_to_close.append((pos, "LIQUIDATION"))
                continue

            if pos.is_long:
                if current_price <= pos.stop_loss:
                    positions_to_close.append((pos, "STOP_LOSS"))
                elif current_price >= pos.take_profit:
                    positions_to_close.append((pos, "TAKE_PROFIT"))
            else:
                if current_price >= pos.stop_loss:
                    positions_to_close.append((pos, "STOP_LOSS"))
                elif current_price <= pos.take_profit:
                    positions_to_close.append((pos, "TAKE_PROFIT"))

        for pos, reason in positions_to_close:
            close_side = Side.SELL if pos.is_long else Side.BUY
            order = self.submit_order(
                symbol=pos.symbol,
                side=close_side,
                quantity=pos.quantity,
                order_type=OrderType.MARKET,
            )
            order.status = OrderStatus.FILLED
            # Update the last trade history entry with the correct reason
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
            notional = pos.entry_price * pos.quantity
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
