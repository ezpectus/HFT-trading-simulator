"""Liquidation and SL/TP checking mixin for SimulatedExchange.

Extracted from exchange.py for file-size compliance.
Handles stop-loss, take-profit, partial and full liquidation checks.
"""
from exchange_simulator.models import (
    Order,
    OrderStatus,
    OrderType,
    Side,
)


class LiquidationMixin:
    """Mixin providing SL/TP and liquidation checking for SimulatedExchange."""

    def check_stop_loss_take_profit(self) -> list[Order]:
        """Check all positions for SL/TP/liquidation triggers and close them."""
        closed_orders: list[Order] = []
        positions_to_close: list[tuple] = []

        for pos in self.account.positions:
            current_price = self.get_price(pos.symbol)
            pos.update_pnl(current_price)
            self._check_position_triggers(pos, current_price, positions_to_close)

        for pos, reason, close_qty in positions_to_close:
            self._close_triggered_position(pos, reason, close_qty, closed_orders)

        return closed_orders

    def _check_position_triggers(self, pos, current_price: float,
                                 positions_to_close: list) -> None:
        """Check a single position for liquidation, SL, and TP triggers."""
        lev = self.account.leverage if self.account.leverage > 0 else 1
        liq_price, partial_liq_price = self._compute_liq_prices(pos, lev)

        if self._is_full_liquidation(pos, current_price, liq_price):
            positions_to_close.append((pos, "LIQUIDATION", pos.quantity))
        elif self._is_partial_liquidation(pos, current_price, partial_liq_price):
            partial_qty = pos.quantity * self.partial_liquidation_ratio
            positions_to_close.append((pos, "PARTIAL_LIQUIDATION", partial_qty))
        else:
            self._check_sl_tp(pos, current_price, positions_to_close)

    def _compute_liq_prices(self, pos, lev: int) -> tuple[float, float]:
        """Compute full and partial liquidation prices for a position."""
        mmr = getattr(self, 'maintenance_margin_rate', 0.005)
        if pos.is_long:
            liq = round(pos.entry_price * (1 - 1/lev + mmr), 2)
            partial = round(pos.entry_price * (
                1 - 1/lev * self.partial_liquidation_ratio + mmr), 2)
        else:
            liq = round(pos.entry_price * (1 + 1/lev - mmr), 2)
            partial = round(pos.entry_price * (
                1 + 1/lev * self.partial_liquidation_ratio - mmr), 2)
        return liq, partial

    def _is_full_liquidation(self, pos, current_price: float, liq_price: float) -> bool:
        """Check if position should be fully liquidated."""
        if pos.is_long:
            return current_price <= liq_price
        return current_price >= liq_price

    def _is_partial_liquidation(self, pos, current_price: float, partial_liq_price: float) -> bool:
        """Check if position should be partially liquidated."""
        if pos.is_long:
            return current_price <= partial_liq_price
        return current_price >= partial_liq_price

    def _check_sl_tp(self, pos, current_price: float, positions_to_close: list) -> None:
        """Check stop-loss and take-profit triggers for a position."""
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

    def _close_triggered_position(self, pos, reason: str, close_qty: float,
                                  closed_orders: list) -> None:
        """Close a position that triggered SL/TP/liquidation."""
        close_side = Side.SELL if pos.is_long else Side.BUY

        order = self.submit_order(
            symbol=pos.symbol, side=close_side, quantity=close_qty,
            order_type=OrderType.MARKET, force_close=True,
        )

        if reason == "LIQUIDATION":
            self._handle_insurance_fund_deficit()
        if order.status == OrderStatus.FILLED:
            # Reason travels on the order — a batch of closes can no
            # longer all inherit trade_history[-1]'s reason downstream.
            order.close_reason = reason
            for trade in reversed(self.account.trade_history):
                if trade.order_id == order.id:
                    trade.reason = reason
                    break
        closed_orders.append(order)

    def _handle_insurance_fund_deficit(self) -> None:
        """Cover negative balance from insurance fund after liquidation."""
        if self.account.balance < 0:
            deficit = abs(self.account.balance)
            self.insurance_fund -= deficit
            self.account.balance = 0.0
