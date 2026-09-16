"""Per-tick exchange-event processing mixin for ExchangeWebSocketServer.

Extracted from ws_broadcast.py — the exchange-side work done each tick
(SL/TP checks, funding charges, fill draining, arbitrage scan/execute).
Client-delivery mechanics stay in ws_broadcast.py.
"""
import time

from exchange_simulator.models import OrderType, Side
from exchange_simulator.ws_constants import logger


class ExchangeEventsMixin:
    """Mixin providing per-tick exchange-event processing for ExchangeWebSocketServer."""

    async def _process_exchange_events(self) -> None:
        """Check SL/TP, update positions, charge funding, broadcast fills."""
        for ex_id, exchange in self.exchanges.items():
            closed_orders = exchange.check_stop_loss_take_profit()
            closed_orders += exchange.check_advanced_orders()
            exchange.update_positions_pnl()

            funding_rates = self.market.get_funding_rates()
            if self.market.candles_to_next_funding == self.market._funding_interval:
                rate = funding_rates.get(ex_id, 0)
                if rate != 0:
                    notifications = exchange.charge_funding(rate)
                    for note in notifications:
                        logger.info("  FUNDING: %s rate=%.6f | %s", ex_id, rate, note)

            batched_fills = []
            for order in closed_orders:
                if order.status.value == "FILLED":
                    # Reason is stamped on the order at trigger time
                    # reading trade_history[-1] mislabeled every close in a
                    # batch and any fill that appended no trade.
                    close_reason = order.close_reason or ""
                    logger.info(
                        f"  {close_reason or 'SL/TP'} CLOSED: {order.symbol} @ {order.filled_price:.2f} "
                        f"qty={order.filled_quantity:.4f} | {ex_id}"
                    )
                    if self.trade_logger is not None:
                        self.trade_logger.log_fill({
                            "timestamp": time.time(),
                            "exchange": ex_id,
                            "symbol": order.symbol,
                            "side": order.side.value,
                            "type": order.order_type.value,
                            "price": order.filled_price,
                            "quantity": order.filled_quantity,
                            "fee": order.fee,
                            "order_id": order.id,
                            "status": f"CLOSED_{close_reason or 'SLTP'}",
                        })
                else:
                    # Terminal non-fill (GTD expiry, IOC/FOK no-fill cancel) —
                    # clients must see it or the order strands in openOrders.
                    logger.info(
                        f"  ORDER {order.status.value}: {order.symbol} "
                        f"| {ex_id} | {order.rejection_reason or ''}"
                    )
                batched_fills.append(order.to_dict())

            if batched_fills:
                await self._broadcast_fills_batch(batched_fills)

    async def _process_arbitrage(self) -> dict | None:
        """Scan for arbitrage opportunities and auto-execute if profitable."""
        if not self.arb_detector:
            return None

        new_arbs = self.arb_detector.scan()
        if not new_arbs:
            return None

        arb_dict = self.arb_detector.to_dict()

        for opp in new_arbs:
            if opp.spread_bps > 20.0 and opp.max_quantity > 0.01 and self._trading_active:
                await self._execute_arbitrage(opp)

        # Return the raw dict — the broadcast encodes it per client encoding.
        return arb_dict

    async def _execute_arbitrage(self, opp) -> None:
        """Auto-execute an arbitrage opportunity."""
        buy_ex = self.exchanges.get(opp.buy_exchange)
        sell_ex = self.exchanges.get(opp.sell_exchange)
        if not (buy_ex and sell_ex):
            return

        exec_qty = min(opp.max_quantity, 1.0)
        buy_order = buy_ex.submit_order(
            symbol=opp.symbol, side=Side.BUY,
            quantity=exec_qty, order_type=OrderType.MARKET,
        )
        sell_order = sell_ex.submit_order(
            symbol=opp.symbol, side=Side.SELL,
            quantity=exec_qty, order_type=OrderType.MARKET,
        )
        buy_filled = buy_order.status.value == "FILLED"
        sell_filled = sell_order.status.value == "FILLED"
        if not (buy_filled and sell_filled):
            self.arb_detector.close_opportunity(
                opp.symbol, opp.buy_exchange, opp.sell_exchange, "FAILED"
            )
            logger.warning(
                f"  ARB EXEC FAILED: {opp.symbol} "
                f"buy={opp.buy_exchange}:{buy_order.status.value}"
                f"({buy_order.rejection_reason or '-'}) "
                f"sell={opp.sell_exchange}:{sell_order.status.value}"
                f"({sell_order.rejection_reason or '-'})"
            )
            return

        self.arb_detector.close_opportunity(
            opp.symbol, opp.buy_exchange, opp.sell_exchange, "AUTO_EXECUTED"
        )
        logger.info(
            f"  ARB AUTO-EXEC: {opp.symbol} "
            f"buy={opp.buy_exchange}@{opp.buy_price:.2f} "
            f"sell={opp.sell_exchange}@{opp.sell_price:.2f} "
            f"qty={exec_qty:.4f} profit~${opp.net_spread * exec_qty:.2f}"
        )
        arb_ts = time.time()
        if self.trade_logger is not None:
            self.trade_logger.log_batch([
                {"timestamp": arb_ts, "exchange": opp.buy_exchange, "symbol": opp.symbol,
                 "side": "BUY", "type": "ARB", "price": buy_order.filled_price,
                 "quantity": buy_order.filled_quantity, "fee": buy_order.fee,
                 "order_id": buy_order.id, "status": "ARB_BUY"},
                {"timestamp": arb_ts, "exchange": opp.sell_exchange, "symbol": opp.symbol,
                 "side": "SELL", "type": "ARB", "price": sell_order.filled_price,
                 "quantity": sell_order.filled_quantity, "fee": sell_order.fee,
                 "order_id": sell_order.id, "status": "ARB_SELL"},
            ])
        for fill_order in (buy_order, sell_order):
            if fill_order.status.value == "FILLED":
                await self._broadcast_fills_batch([fill_order.to_dict()])
