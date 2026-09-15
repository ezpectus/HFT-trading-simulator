"""Position lifecycle mixin for SimulatedExchange.

Extracted from exchange_order_submission.py — the open/close/residual/PnL
half of position management. Order creation, validation and fill execution
stay in exchange_order_submission.py.
"""
from exchange_simulator.models import (
    AuditEventType,
    ClosedTrade,
    Order,
    Position,
    Side,
)


class PositionLifecycleMixin:
    """Mixin providing position open/close/residual management for SimulatedExchange."""

    def _update_position(
        self,
        order: Order,
        stop_loss: float | None,
        take_profit: float | None,
        order_margin: float = 0.0,
    ) -> None:
        """Update positions based on filled order."""
        existing = self._positions_by_symbol.get(order.symbol)

        if existing:
            if existing.side != order.side:
                self._close_position(existing, order, order_margin)
                return
            else:
                total_qty = existing.quantity + order.filled_quantity
                avg_price = (
                    (existing.entry_price * existing.quantity + order.filled_price * order.filled_quantity)
                    / total_qty
                )
                existing.quantity = total_qty
                existing.entry_price = avg_price
                existing.margin += order_margin
                return

        self._open_new_position(order, stop_loss, take_profit, order_margin)

    def _close_position(self, existing: Position, order: Order,
                        order_margin: float = 0.0) -> None:
        """Close or partially close an existing position."""
        close_qty = min(order.filled_quantity, existing.quantity)
        pnl = self._compute_close_pnl(existing, order, close_qty)

        released_margin = existing.margin * (close_qty / existing.quantity)
        close_margin_share = order_margin * (close_qty / order.filled_quantity)
        existing.margin -= released_margin

        old_balance = self.account.balance
        self.account.balance += released_margin + close_margin_share + pnl
        self.account.total_pnl += pnl
        self.account.total_trades += 1
        if pnl > 0:
            self.account.winning_trades += 1

        self.account.trade_history.append(ClosedTrade(
            symbol=existing.symbol, exchange=self.exchange_id,
            side=existing.side.value, quantity=close_qty,
            entry_price=existing.entry_price, exit_price=order.filled_price,
            pnl=round(pnl, 2), fee=order.fee, reason="MANUAL",
            opened_at=existing.opened_at, order_id=order.id,
        ))
        self._log_position_closed(existing, order, close_qty, pnl, old_balance)

        if close_qty >= existing.quantity:
            self.account.positions.remove(existing)
            del self._positions_by_symbol[order.symbol]
            residual_qty = order.filled_quantity - close_qty
            if residual_qty > 1e-12:
                self._open_residual_position(order, residual_qty,
                                             order_margin - close_margin_share)
        else:
            existing.quantity -= close_qty

    def _open_residual_position(self, order: Order, quantity: float,
                                margin: float) -> None:
        """Open a residual position when an opposite order exceeds the position."""
        if order.side == Side.BUY:
            stop_loss = order.filled_price * 0.98
            take_profit = order.filled_price * 1.04
        else:
            stop_loss = order.filled_price * 1.02
            take_profit = order.filled_price * 0.96

        position = Position(
            symbol=order.symbol, exchange=self.exchange_id,
            side=order.side, quantity=quantity,
            entry_price=order.filled_price, stop_loss=stop_loss,
            take_profit=take_profit, margin=margin,
        )
        self.account.positions.append(position)
        self._positions_by_symbol[order.symbol] = position
        self._audit_logger.log(
            event_type=AuditEventType.POSITION_OPENED,
            exchange=self.exchange_id, symbol=order.symbol,
            metadata={"side": order.side.value, "quantity": quantity,
                      "entry_price": order.filled_price, "order_id": order.id,
                      "residual": True},
        )

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
                           take_profit: float | None, margin: float = 0.0) -> None:
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
            take_profit=take_profit, margin=margin,
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
