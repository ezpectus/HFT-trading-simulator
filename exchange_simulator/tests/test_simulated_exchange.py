"""Tests for SimulatedExchange — order matching, fees, slippage, positions, SL/TP."""
import pytest
from unittest.mock import MagicMock

from exchange_simulator.models import (
    Account, Order, OrderBook, OrderStatus, OrderType, Position, Side,
)
from exchange_simulator.exchange import SimulatedExchange


def make_market(price=50000.0):
    """Create a mock MarketSimulator with a fixed price."""
    market = MagicMock()
    market.get_price.return_value = price
    market.symbols = ["BTC/USDT"]
    market.generate_order_book.return_value = OrderBook(
        symbol="BTC/USDT", exchange="binance",
        bids=[(50000, 1.0)], asks=[(50001, 1.0)],
    )
    market.get_history.return_value = []
    return market


class TestSimulatedExchangeInit:
    def test_defaults(self):
        market = make_market()
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        assert ex.exchange_id == "binance"
        assert ex.name == "Binance"
        assert ex.fee_pct == 0.04
        assert ex.slippage_bps == 1.0
        assert ex.account.balance == 10000.0
        assert ex.account.leverage == 10
        assert ex.account.currency == "USDT"

    def test_custom_params(self):
        market = make_market()
        ex = SimulatedExchange("okx", "OKX", 0.05, 2.0, market,
                               initial_balance=50000, leverage=20)
        assert ex.account.balance == 50000
        assert ex.account.leverage == 20

    def test_symbols_from_market(self):
        market = make_market()
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        assert ex.symbols == ["BTC/USDT"]


class TestMarketOrder:
    def test_buy_market_order_fills(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        assert order.status == OrderStatus.FILLED
        assert order.filled_quantity == 0.1
        assert order.filled_price > 50000  # slippage added
        assert order.fee > 0

    def test_sell_market_order_fills(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        # First buy to have a position
        ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        # Then sell
        order = ex.submit_order("BTC/USDT", Side.SELL, 0.1)
        assert order.status == OrderStatus.FILLED
        assert order.filled_price < 50000  # slippage subtracted

    def test_fee_deducted_from_balance(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        initial = ex.account.balance
        ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        assert ex.account.balance < initial
        assert ex.account.total_fees > 0

    def test_slippage_applied(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.0, 5.0, market)
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.01)
        expected_slippage = 50000 * 5.0 / 10000
        assert order.slippage == pytest.approx(expected_slippage, rel=0.01)


class TestLimitOrder:
    def test_limit_buy_pending_if_price_too_low(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                order_type=OrderType.LIMIT, price=49000)
        assert order.status == OrderStatus.PENDING

    def test_limit_buy_fills_if_price_meets(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        # Limit buy at price above fill price should fill
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                order_type=OrderType.LIMIT, price=55000)
        assert order.status == OrderStatus.FILLED
        assert order.filled_price == 55000


class TestOrderRejection:
    def test_rejected_no_price(self):
        market = make_market(0)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        assert order.status == OrderStatus.REJECTED
        assert order.rejection_reason == "NO_PRICE_DATA"

    def test_rejected_insufficient_margin(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market,
                               initial_balance=10, leverage=10)
        order = ex.submit_order("BTC/USDT", Side.BUY, 1.0)
        assert order.status == OrderStatus.REJECTED
        assert "INSUFFICIENT_MARGIN" in order.rejection_reason

    def test_rejected_max_position_size(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market,
                               initial_balance=100, leverage=10)
        order = ex.submit_order("BTC/USDT", Side.BUY, 100.0)
        assert order.status == OrderStatus.REJECTED
        assert "MAX_POSITION_SIZE" in order.rejection_reason


class TestPositionManagement:
    def test_creates_long_position(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        ex.submit_order("BTC/USDT", Side.BUY, 0.5)
        assert len(ex.account.positions) == 1
        pos = ex.account.positions[0]
        assert pos.side == Side.BUY
        assert pos.symbol == "BTC/USDT"
        assert pos.quantity == 0.5

    def test_closes_position_on_opposite_order(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        ex.submit_order("BTC/USDT", Side.BUY, 0.5)
        assert len(ex.account.positions) == 1
        ex.submit_order("BTC/USDT", Side.SELL, 0.5)
        assert len(ex.account.positions) == 0
        assert len(ex.account.trade_history) == 1
        assert ex.account.total_trades == 1

    def test_adds_to_same_side_position(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        ex.submit_order("BTC/USDT", Side.BUY, 0.3)
        ex.submit_order("BTC/USDT", Side.BUY, 0.2)
        assert len(ex.account.positions) == 1
        assert ex.account.positions[0].quantity == pytest.approx(0.5)

    def test_default_stop_loss_take_profit(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        pos = ex.account.positions[0]
        assert pos.stop_loss < pos.entry_price
        assert pos.take_profit > pos.entry_price

    def test_custom_stop_loss_take_profit(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                        stop_loss=49000, take_profit=51000)
        pos = ex.account.positions[0]
        assert pos.stop_loss == 49000
        assert pos.take_profit == 51000


class TestStopLossTakeProfit:
    def test_stop_loss_triggers(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                        stop_loss=49900, take_profit=60000)
        # Price drops below stop loss
        market.get_price.return_value = 49800
        closed = ex.check_stop_loss_take_profit()
        assert len(closed) == 1
        assert len(ex.account.positions) == 0
        assert ex.account.trade_history[-1].reason == "STOP_LOSS"

    def test_take_profit_triggers(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                        stop_loss=49000, take_profit=50100)
        market.get_price.return_value = 50200
        closed = ex.check_stop_loss_take_profit()
        assert len(closed) == 1
        assert ex.account.trade_history[-1].reason == "TAKE_PROFIT"

    def test_no_trigger_in_range(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                        stop_loss=49000, take_profit=51000)
        closed = ex.check_stop_loss_take_profit()
        assert len(closed) == 0
        assert len(ex.account.positions) == 1

    def test_short_stop_loss_triggers(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        ex.submit_order("BTC/USDT", Side.SELL, 0.1,
                        stop_loss=50100, take_profit=49000)
        market.get_price.return_value = 50200
        closed = ex.check_stop_loss_take_profit()
        assert len(closed) == 1
        assert ex.account.trade_history[-1].reason == "STOP_LOSS"


class TestFundingRate:
    def test_long_pays_positive_funding(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        initial = ex.account.balance
        ex.charge_funding(0.0001)
        assert ex.account.balance < initial

    def test_short_receives_positive_funding(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        ex.submit_order("BTC/USDT", Side.SELL, 0.1)
        initial = ex.account.balance
        ex.charge_funding(0.0001)
        assert ex.account.balance > initial

    def test_no_positions_no_funding(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        notifications = ex.charge_funding(0.0001)
        assert notifications == []


class TestOrderHistory:
    def test_history_stored(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        ex.submit_order("BTC/USDT", Side.SELL, 0.1)
        history = ex.get_order_history()
        assert len(history) == 2

    def test_history_limit(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        for _ in range(5):
            ex.submit_order("BTC/USDT", Side.BUY, 0.01)
            ex.submit_order("BTC/USDT", Side.SELL, 0.01)
        history = ex.get_order_history(limit=3)
        assert len(history) == 3


class TestAccountStatus:
    def test_get_account_status(self):
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        status = ex.get_account_status()
        assert status["exchange"] == "binance"
        assert status["balance"] > 0
        assert len(status["positions"]) == 1
        assert "equity" in status
        assert "win_rate" in status
