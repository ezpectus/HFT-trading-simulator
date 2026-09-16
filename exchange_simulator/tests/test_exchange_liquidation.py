"""Tests for LiquidationMixin — SL/TP/liquidation closes.

 — partial liquidation is routed through submit_order like every
other trigger, so it pays fees, takes slippage, and writes audit events.
"""
from unittest.mock import MagicMock

from exchange_simulator.exchange import SimulatedExchange
from exchange_simulator.models import (
    AuditEventType,
    OrderBook,
    OrderBookLevel,
    OrderStatus,
    Side,
)


def make_market(price=50000.0):
    market = MagicMock()
    market.get_price.return_value = price
    market.symbols = ["BTC/USDT"]
    market.generate_order_book.return_value = OrderBook(
        symbol="BTC/USDT", exchange="binance",
        bids=[OrderBookLevel(price=50000 - i * 5, quantity=1.0 + i * 0.1) for i in range(20)],
        asks=[OrderBookLevel(price=50001 + i * 5, quantity=0.8 + i * 0.1) for i in range(20)],
        timestamp=1704067200,
    )
    market.get_history.return_value = []
    market.current_timestamp = 1704067200
    return market


class TestPartialLiquidationRouting:
    """Partial liquidation must behave like a real forced close."""

    def test_partial_liquidation_charges_fee(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.1, 0.0, market,
                               initial_balance=10000, leverage=10)
        ex.submit_order("BTC/USDT", Side.BUY, 0.2)
        fees_before = ex.account.total_fees
        market.get_price.return_value = 47750
        ex.check_stop_loss_take_profit()
        assert ex.account.total_fees > fees_before
        trade = ex.account.trade_history[-1]
        assert trade.fee > 0
        assert trade.reason == "PARTIAL_LIQUIDATION"

    def test_partial_liquidation_takes_slippage(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.0, 10.0, market,
                               initial_balance=10000, leverage=10)
        ex.submit_order("BTC/USDT", Side.BUY, 0.2)
        market.get_price.return_value = 47750
        closed = ex.check_stop_loss_take_profit()
        assert closed[0].status == OrderStatus.FILLED
        # long closed by a SELL — slippage pushes the fill below the mark
        assert closed[0].filled_price < 47750

    def test_partial_liquidation_writes_audit_events(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.0, 0.0, market,
                               initial_balance=10000, leverage=10)
        ex.submit_order("BTC/USDT", Side.BUY, 0.2)
        market.get_price.return_value = 47750
        closed = ex.check_stop_loss_take_profit()
        order_id = closed[0].id
        filled_events = ex._audit_logger.get_logs(
            event_type=AuditEventType.ORDER_FILLED, order_id=order_id)
        assert filled_events

    def test_partial_liquidation_keeps_remainder_position(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.0, 0.0, market,
                               initial_balance=10000, leverage=10)
        ex.submit_order("BTC/USDT", Side.BUY, 0.2)
        market.get_price.return_value = 47750
        ex.check_stop_loss_take_profit()
        assert len(ex.account.positions) == 1
        assert ex.account.positions[0].quantity < 0.2
