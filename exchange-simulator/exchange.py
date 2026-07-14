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
        self.insurance_fund: float = 0.0
        self.partial_liquidation_ratio: float = 0.5  # 50% partial liq before full

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
        force_close: bool = False,
    ) -> Order:
        """Submit an order and return the result.

        Args:
            force_close: If True, skip margin/position checks (for SL/TP/liquidation closes).
        """
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

        # Check max position size (50% of balance * leverage as notional cap)
        # Use mid_price notional so slippage doesn't cause boundary rejection
        mid_notional = mid_price * quantity
        max_notional = self.account.balance * self.account.leverage * 0.5
        if not force_close and mid_notional > max_notional:
            order.status = OrderStatus.REJECTED
            order.rejection_reason = f"MAX_POSITION_SIZE (notional ${notional:.2f} > limit ${max_notional:.2f})"
            self._order_history.append(order)
            return order

        # Check balance
        margin_required = notional / self.account.leverage
        if not force_close and margin_required + fee > self.account.balance:
            order.status = OrderStatus.REJECTED
            order.rejection_reason = f"INSUFFICIENT_MARGIN (need ${margin_required:.2f}, have ${self.account.balance:.2f})"
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
            if pos.is_long:
                liq_price = pos.entry_price * (1 - 1/self.account.leverage + 0.005)
                partial_liq_price = pos.entry_price * (
                    1 - 1/self.account.leverage * self.partial_liquidation_ratio + 0.005
                )
            else:
                liq_price = pos.entry_price * (1 + 1/self.account.leverage - 0.005)
                partial_liq_price = pos.entry_price * (
                    1 + 1/self.account.leverage * self.partial_liquidation_ratio - 0.005
                )

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
                order = Order(
                    id=str(uuid.uuid4())[:8],
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
                    self.insurance_fund += deficit
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
