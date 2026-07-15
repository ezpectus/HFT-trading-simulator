"""Tests for SimulatedExchange — order matching, fees, slippage, margin, SL/TP."""
import pytest

from exchange_simulator.arbitrage import ArbitrageDetector
from exchange_simulator.exchange import SimulatedExchange
from exchange_simulator.market_simulator import MarketSimulator
from exchange_simulator.models import OrderStatus, OrderType, Side


@pytest.fixture
def setup():
    """Create a single exchange with a warmed-up market."""
    market = MarketSimulator(
        symbols=["BTC/USDT"],
        exchanges=["binance"],
        initial_prices={"BTC/USDT": 65000},
        volatility={"BTC/USDT": 0.75},
        seed=42,
        warmup_candles=50,
        order_book_depth=10,
    )
    exchange = SimulatedExchange(
        exchange_id="binance",
        name="Binance",
        fee_pct=0.04,
        slippage_bps=2.0,
        market=market,
        initial_balance=10000,
        leverage=10,
    )
    return exchange, market


class TestSimulatedExchange:
    def test_initialization(self, setup):
        ex, _ = setup
        assert ex.exchange_id == "binance"
        assert ex.account.balance == 10000
        assert ex.account.leverage == 10
        assert len(ex.account.positions) == 0

    def test_get_price(self, setup):
        ex, _ = setup
        price = ex.get_price("BTC/USDT")
        assert price > 0

    def test_market_buy_order_fills(self, setup):
        ex, _ = setup
        order = ex.submit_order(
            symbol="BTC/USDT", side=Side.BUY, quantity=0.1,
            order_type=OrderType.MARKET,
        )
        assert order.status == OrderStatus.FILLED
        assert order.filled_price > 0
        assert order.filled_quantity == 0.1
        assert order.fee > 0

    def test_market_sell_order_fills(self, setup):
        ex, _ = setup
        # First buy to open a position
        ex.submit_order(symbol="BTC/USDT", side=Side.BUY, quantity=0.1)
        # Then sell to close
        order = ex.submit_order(
            symbol="BTC/USDT", side=Side.SELL, quantity=0.1,
            order_type=OrderType.MARKET,
        )
        assert order.status == OrderStatus.FILLED

    def test_slippage_applied(self, setup):
        ex, _ = setup
        mid_price = ex.get_price("BTC/USDT")
        order = ex.submit_order(
            symbol="BTC/USDT", side=Side.BUY, quantity=0.01,
            order_type=OrderType.MARKET,
        )
        # Buy fill should be above mid price (slippage makes it worse)
        assert order.filled_price >= mid_price

    def test_fee_deducted_from_balance(self, setup):
        ex, _ = setup
        initial_balance = ex.account.balance
        ex.submit_order(symbol="BTC/USDT", side=Side.BUY, quantity=0.01)
        assert ex.account.balance < initial_balance
        assert ex.account.total_fees > 0

    def test_insufficient_margin_rejected(self, setup):
        ex, _ = setup
        # Try to buy way more than balance allows
        order = ex.submit_order(
            symbol="BTC/USDT", side=Side.BUY, quantity=100,
            order_type=OrderType.MARKET,
        )
        assert order.status == OrderStatus.REJECTED
        assert "INSUFFICIENT_MARGIN" in (order.rejection_reason or "")

    def test_max_position_size_rejected(self, setup):
        ex, _ = setup
        # Large enough to exceed max notional but not margin (with leverage)
        # max_notional = balance * leverage * 0.5 = 10000 * 10 * 0.5 = 50000
        # BTC at ~65000, so 1 BTC = 65000 > 50000
        order = ex.submit_order(
            symbol="BTC/USDT", side=Side.BUY, quantity=1.0,
            order_type=OrderType.MARKET,
        )
        assert order.status == OrderStatus.REJECTED
        assert "MAX_POSITION_SIZE" in (order.rejection_reason or "")

    def test_limit_order_pending_if_price_too_low(self, setup):
        ex, _ = setup
        mid_price = ex.get_price("BTC/USDT")
        # Buy limit below current price — should be pending
        order = ex.submit_order(
            symbol="BTC/USDT", side=Side.BUY, quantity=0.01,
            order_type=OrderType.LIMIT, price=mid_price * 0.5,
        )
        assert order.status == OrderStatus.PENDING

    def test_limit_order_fills_if_price_meets(self, setup):
        ex, _ = setup
        mid_price = ex.get_price("BTC/USDT")
        # Buy limit above current price — should fill at limit price
        order = ex.submit_order(
            symbol="BTC/USDT", side=Side.BUY, quantity=0.01,
            order_type=OrderType.LIMIT, price=mid_price * 1.5,
        )
        assert order.status == OrderStatus.FILLED
        assert order.filled_price == round(mid_price * 1.5, 2)

    def test_position_created_on_buy(self, setup):
        ex, _ = setup
        ex.submit_order(symbol="BTC/USDT", side=Side.BUY, quantity=0.1)
        assert len(ex.account.positions) == 1
        pos = ex.account.positions[0]
        assert pos.side == Side.BUY
        assert pos.symbol == "BTC/USDT"

    def test_default_stop_loss_take_profit(self, setup):
        ex, _ = setup
        ex.submit_order(symbol="BTC/USDT", side=Side.BUY, quantity=0.01)
        pos = ex.account.positions[0]
        # Default SL = entry * 0.98, TP = entry * 1.04
        assert pos.stop_loss == pytest.approx(pos.entry_price * 0.98, rel=1e-3)
        assert pos.take_profit == pytest.approx(pos.entry_price * 1.04, rel=1e-3)

    def test_custom_stop_loss_take_profit(self, setup):
        ex, _ = setup
        ex.submit_order(
            symbol="BTC/USDT", side=Side.BUY, quantity=0.01,
            stop_loss=60000, take_profit=70000,
        )
        pos = ex.account.positions[0]
        assert pos.stop_loss == 60000
        assert pos.take_profit == 70000

    def test_position_closed_on_opposite_order(self, setup):
        ex, _ = setup
        ex.submit_order(symbol="BTC/USDT", side=Side.BUY, quantity=0.1)
        assert len(ex.account.positions) == 1
        ex.submit_order(symbol="BTC/USDT", side=Side.SELL, quantity=0.1)
        assert len(ex.account.positions) == 0
        assert ex.account.total_trades == 1

    def test_trade_history_recorded(self, setup):
        ex, _ = setup
        ex.submit_order(symbol="BTC/USDT", side=Side.BUY, quantity=0.1)
        ex.submit_order(symbol="BTC/USDT", side=Side.SELL, quantity=0.1)
        assert len(ex.account.trade_history) == 1
        trade = ex.account.trade_history[0]
        assert trade.symbol == "BTC/USDT"
        assert trade.reason == "MANUAL"

    def test_order_history(self, setup):
        ex, _ = setup
        ex.submit_order(symbol="BTC/USDT", side=Side.BUY, quantity=0.01)
        history = ex.get_order_history()
        assert len(history) == 1
        assert history[0].status == OrderStatus.FILLED

    def test_update_positions_pnl(self, setup):
        ex, _ = setup
        ex.submit_order(symbol="BTC/USDT", side=Side.BUY, quantity=0.1)
        ex.update_positions_pnl()
        pos = ex.account.positions[0]
        # PnL should be updated (could be positive or negative)
        assert pos.unrealized_pnl != 0 or pos.entry_price == ex.get_price("BTC/USDT")

    def test_get_account_status(self, setup):
        ex, _ = setup
        status = ex.get_account_status()
        assert "exchange" in status
        assert "balance" in status
        assert "equity" in status
        assert "positions" in status

    def test_charge_funding(self, setup):
        ex, _ = setup
        ex.submit_order(symbol="BTC/USDT", side=Side.BUY, quantity=0.1)
        initial_balance = ex.account.balance
        notifications = ex.charge_funding(0.0001)  # 0.01% funding
        # Long pays positive funding
        assert ex.account.balance < initial_balance
        assert isinstance(notifications, list)

    def test_charge_funding_short_position(self, setup):
        ex, _ = setup
        # Need to open a short — first buy then sell more
        ex.submit_order(symbol="BTC/USDT", side=Side.BUY, quantity=0.1)
        ex.submit_order(symbol="BTC/USDT", side=Side.SELL, quantity=0.1)
        # Now open short
        ex.submit_order(symbol="BTC/USDT", side=Side.SELL, quantity=0.05)
        assert len(ex.account.positions) == 1
        pos = ex.account.positions[0]
        assert pos.side == Side.SELL
        initial_balance = ex.account.balance
        ex.charge_funding(0.0001)  # Short receives positive funding
        assert ex.account.balance > initial_balance

    def test_symbols_property(self, setup):
        ex, _ = setup
        assert "BTC/USDT" in ex.symbols

    def test_get_candles(self, setup):
        ex, _ = setup
        candles = ex.get_candles("BTC/USDT", n=10)
        assert len(candles) <= 10

    def test_get_order_book(self, setup):
        ex, _ = setup
        ob = ex.get_order_book("BTC/USDT")
        assert ob.symbol == "BTC/USDT"
        assert ob.exchange == "binance"
        assert len(ob.bids) > 0
        assert len(ob.asks) > 0

    def test_force_close_bypasses_margin_check(self, setup):
        ex, _ = setup
        # Open a position first
        ex.submit_order(symbol="BTC/USDT", side=Side.BUY, quantity=0.01)
        assert len(ex.account.positions) == 1
        # Drain balance to near zero
        ex.account.balance = 0.01
        # Normal close would be rejected (insufficient margin for fee)
        # But force_close should bypass the check
        close_order = ex.submit_order(
            symbol="BTC/USDT", side=Side.SELL, quantity=0.01,
            force_close=True,
        )
        assert close_order.status == OrderStatus.FILLED
        assert len(ex.account.positions) == 0
