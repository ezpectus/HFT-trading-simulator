"""Liquidation and SL/TP checking mixin for SimulatedExchange.

Extracted from exchange.py for file-size compliance.
Handles stop-loss, take-profit, partial and full liquidation checks.
"""
from exchange_simulator.models import (
    AuditEventType,
    ClosedTrade,
    Order,
    OrderStatus,
    OrderType,
    Side,
)


class LiquidationMixin:
    """Mixin providing SL/TP and liquidation checking for SimulatedExchange."""

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

            if pos.is_long:
                if pos.stop_loss > 0 and current_price <= pos.stop_loss:
                    positions_to_close.append((pos, "STOP_LOSS", pos.quantity))
                elif pos.take_profit > 0 and current_price >= pos.take_profit:
                    positions_to_close.append((pos, "TAKE_PROFIT", pos.quantity))
            else:
                if pos.stop_loss > 0 and current_price >= pos.stop_loss:
                    positions_to_close.append((pos, "STOP_LOSS", pos.quantity))
                elif pos.take_profit > 0 and current_price <= pos.take_profit:
                    positions_to_close.append((pos, "TAKE_PROFIT", pos.quantity))

        for pos, reason, close_qty in positions_to_close:
            close_side = Side.SELL if pos.is_long else Side.BUY
            current_price = self.get_price(pos.symbol)

            if reason == "PARTIAL_LIQUIDATION":
                self._handle_partial_liquidation(pos, close_side, close_qty, current_price, closed_orders)
                continue

            order = self.submit_order(
                symbol=pos.symbol, side=close_side, quantity=close_qty,
                order_type=OrderType.MARKET, force_close=True,
            )
            order.status = OrderStatus.FILLED

            if reason == "LIQUIDATION":
                if self.account.balance < 0:
                    deficit = abs(self.account.balance)
                    self.insurance_fund -= deficit
                    self.account.balance = 0.0
            if self.account.trade_history:
                self.account.trade_history[-1].reason = reason
            closed_orders.append(order)

        return closed_orders

    def _handle_partial_liquidation(self, pos, close_side, close_qty,
                                    current_price, closed_orders) -> None:
        """Handle partial liquidation directly without calling submit_order."""
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
            symbol=pos.symbol, exchange=self.exchange_id,
            side=pos.side.value, quantity=close_qty,
            entry_price=pos.entry_price, exit_price=current_price,
            pnl=round(pnl, 2), fee=0.0, reason="PARTIAL_LIQUIDATION",
            opened_at=pos.opened_at,
        ))

        pos.quantity -= close_qty
        if pos.quantity <= 1e-12:
            self.account.positions.remove(pos)
            self._positions_by_symbol.pop(pos.symbol, None)
        self._order_counter += 1
        order = Order(
            id=f"ord-{self._order_counter:08d}",
            symbol=pos.symbol, exchange=self.exchange_id,
            side=close_side, order_type=OrderType.MARKET, quantity=close_qty,
        )
        order.status = OrderStatus.FILLED
        order.filled_price = current_price
        order.filled_quantity = close_qty
        closed_orders.append(order)
