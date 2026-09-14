"""Tests for position lifecycle — open/average/close/residual via SimulatedExchange."""
from unittest.mock import MagicMock

import pytest

from exchange_simulator.exchange import SimulatedExchange
from exchange_simulator.models import OrderBook, Side


def make_market(price=50000.0):
    market = MagicMock()
    market.get_price.return_value = price
    market.symbols = ["BTC/USDT"]
    market.generate_order_book.return_value = OrderBook(
        symbol="BTC/USDT", exchange="binance",
        bids=[(price - 1, 1.0)], asks=[(price + 1, 1.0)],
    )
    market.get_history.return_value = []
    return market


def make_exchange(price=50000.0):
    return SimulatedExchange("binance", "Binance", 0.04, 1.0, make_market(price))


class TestOpenPosition:
    def test_market_buy_opens_long(self):
        ex = make_exchange(50000)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        pos = ex._positions_by_symbol["BTC/USDT"]
        assert pos.side == Side.BUY
        assert pos.quantity == pytest.approx(0.1)
        assert pos.entry_price == pytest.approx(50000, rel=0.01)
        assert pos in ex.account.positions
        # margin = notional / leverage = 5000 / 10
        assert pos.margin == pytest.approx(500.0, rel=0.01)

    def test_same_side_order_averages_entry(self):
        ex = make_exchange(50000)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        ex.market.get_price.return_value = 60000
        ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        pos = ex._positions_by_symbol["BTC/USDT"]
        assert pos.quantity == pytest.approx(0.2)
        # averaged entry between the two fills
        assert 50000 < pos.entry_price < 60000
        # margin from both fills accumulated
        assert pos.margin == pytest.approx(500.0 + 600.0, rel=0.01)


class TestClosePosition:
    def test_full_close_removes_position_and_books_pnl(self):
        ex = make_exchange(50000)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        ex.market.get_price.return_value = 55000
        ex.submit_order("BTC/USDT", Side.SELL, 0.1)
        assert "BTC/USDT" not in ex._positions_by_symbol
        assert ex.account.positions == []
        assert ex.account.total_pnl > 0
        assert len(ex.account.trade_history) == 1
        assert ex.account.trade_history[0].pnl > 0

    def test_partial_close_shrinks_and_realizes_slice(self):
        ex = make_exchange(50000)
        ex.submit_order("BTC/USDT", Side.BUY, 0.2)
        ex.market.get_price.return_value = 55000
        ex.submit_order("BTC/USDT", Side.SELL, 0.1)
        pos = ex._positions_by_symbol["BTC/USDT"]
        assert pos.quantity == pytest.approx(0.1)
        assert pos in ex.account.positions
        assert ex.account.total_pnl > 0
        assert ex.account.total_trades == 1

    def test_losing_close_books_negative_pnl(self):
        ex = make_exchange(50000)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        ex.market.get_price.return_value = 45000
        ex.submit_order("BTC/USDT", Side.SELL, 0.1)
        assert ex.account.total_pnl < 0
        assert ex.account.winning_trades == 0


class TestResidualPosition:
    def test_oversized_opposite_order_flips_side(self):
        ex = make_exchange(50000)
        ex.submit_order("BTC/USDT", Side.BUY, 0.1)
        ex.submit_order("BTC/USDT", Side.SELL, 0.15)
        pos = ex._positions_by_symbol["BTC/USDT"]
        # closed the 0.1 long, residual 0.05 opens SHORT
        assert pos.side == Side.SELL
        assert pos.quantity == pytest.approx(0.05)
        # residual inherits the sell fill price with default SL/TP above/below
        assert pos.stop_loss > pos.entry_price
        assert pos.take_profit < pos.entry_price


class TestClosePnlMath:
    def test_long_pnl_sign(self):
        ex = make_exchange(50000)
        pos_up = ex._compute_close_pnl(
            existing=type("P", (), {"is_long": True, "entry_price": 100.0})(),
            order=type("O", (), {"filled_price": 110.0})(),
            close_qty=2.0,
        )
        assert pos_up == pytest.approx(20.0)

    def test_short_pnl_sign(self):
        ex = make_exchange(50000)
        pos_up = ex._compute_close_pnl(
            existing=type("P", (), {"is_long": False, "entry_price": 100.0})(),
            order=type("O", (), {"filled_price": 110.0})(),
            close_qty=2.0,
        )
        assert pos_up == pytest.approx(-20.0)
