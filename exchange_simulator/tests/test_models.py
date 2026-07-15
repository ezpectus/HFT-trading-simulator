"""Tests for data models — Candle, OrderBook, Order, Position, Account."""
import pytest

from exchange_simulator.models import (
    Account, Candle, ClosedTrade, Order, OrderBook, OrderBookLevel,
    OrderStatus, OrderType, Position, Side,
)


class TestCandle:
    def test_creation(self):
        c = Candle(timestamp=1704067200, open=65000, high=65100, low=64900, close=65050, volume=500, symbol="BTC/USDT", exchange="binance")
        assert c.symbol == "BTC/USDT"
        assert c.exchange == "binance"
        assert c.close == 65050

    def test_defaults(self):
        c = Candle(timestamp=100, open=1, high=2, low=0.5, close=1.5, volume=10)
        assert c.symbol == ""
        assert c.exchange == ""

    def test_to_dict(self):
        c = Candle(timestamp=100, open=1, high=2, low=0.5, close=1.5, volume=10, symbol="ETH/USDT", exchange="bybit")
        d = c.to_dict()
        assert d["timestamp"] == 100
        assert d["open"] == 1
        assert d["high"] == 2
        assert d["low"] == 0.5
        assert d["close"] == 1.5
        assert d["volume"] == 10
        assert d["symbol"] == "ETH/USDT"
        assert d["exchange"] == "bybit"


class TestOrderBook:
    def test_empty_book(self):
        ob = OrderBook(symbol="BTC/USDT", exchange="binance")
        assert ob.best_bid == 0.0
        assert ob.best_ask == 0.0
        assert ob.spread == 0.0
        assert ob.mid_price == 0.0

    def test_best_bid_ask(self):
        ob = OrderBook(
            symbol="BTC/USDT", exchange="binance",
            bids=[OrderBookLevel(price=64990, quantity=1.0), OrderBookLevel(price=64980, quantity=2.0)],
            asks=[OrderBookLevel(price=65010, quantity=0.5), OrderBookLevel(price=65020, quantity=1.5)],
        )
        assert ob.best_bid == 64990
        assert ob.best_ask == 65010

    def test_spread(self):
        ob = OrderBook(
            symbol="BTC/USDT", exchange="binance",
            bids=[OrderBookLevel(price=64990, quantity=1.0)],
            asks=[OrderBookLevel(price=65010, quantity=0.5)],
        )
        assert ob.spread == 20

    def test_mid_price(self):
        ob = OrderBook(
            symbol="BTC/USDT", exchange="binance",
            bids=[OrderBookLevel(price=64990, quantity=1.0)],
            asks=[OrderBookLevel(price=65010, quantity=0.5)],
        )
        assert ob.mid_price == 65000

    def test_mid_price_empty(self):
        ob = OrderBook(symbol="BTC/USDT", exchange="binance", bids=[], asks=[])
        assert ob.mid_price == 0.0

    def test_to_dict_truncates_to_10_levels(self):
        bids = [OrderBookLevel(price=64000 - i, quantity=1.0) for i in range(15)]
        asks = [OrderBookLevel(price=66000 + i, quantity=1.0) for i in range(15)]
        ob = OrderBook(symbol="BTC/USDT", exchange="binance", bids=bids, asks=asks)
        d = ob.to_dict()
        assert len(d["bids"]) == 10
        assert len(d["asks"]) == 10


class TestPosition:
    def test_is_long(self):
        pos = Position(symbol="BTC/USDT", exchange="binance", side=Side.BUY, quantity=1.0, entry_price=65000, stop_loss=63700, take_profit=67600)
        assert pos.is_long is True

    def test_is_short(self):
        pos = Position(symbol="BTC/USDT", exchange="binance", side=Side.SELL, quantity=1.0, entry_price=65000, stop_loss=66300, take_profit=62400)
        assert pos.is_long is False

    def test_update_pnl_long(self):
        pos = Position(symbol="BTC/USDT", exchange="binance", side=Side.BUY, quantity=2.0, entry_price=65000, stop_loss=63700, take_profit=67600)
        pos.update_pnl(66000)
        assert pos.unrealized_pnl == 2000

    def test_update_pnl_short(self):
        pos = Position(symbol="BTC/USDT", exchange="binance", side=Side.SELL, quantity=2.0, entry_price=65000, stop_loss=66300, take_profit=62400)
        pos.update_pnl(64000)
        assert pos.unrealized_pnl == 2000

    def test_update_pnl_long_negative(self):
        pos = Position(symbol="BTC/USDT", exchange="binance", side=Side.BUY, quantity=1.0, entry_price=65000, stop_loss=63700, take_profit=67600)
        pos.update_pnl(64000)
        assert pos.unrealized_pnl == -1000

    def test_to_dict(self):
        pos = Position(symbol="BTC/USDT", exchange="binance", side=Side.BUY, quantity=1.0, entry_price=65000, stop_loss=63700, take_profit=67600)
        d = pos.to_dict()
        assert d["side"] == "BUY"
        assert d["entry_price"] == 65000
        assert d["symbol"] == "BTC/USDT"


class TestAccount:
    def test_equity_no_positions(self):
        acc = Account(exchange="binance", balance=10000)
        assert acc.equity == 10000

    def test_equity_with_positions(self):
        acc = Account(exchange="binance", balance=10000)
        pos = Position(symbol="BTC/USDT", exchange="binance", side=Side.BUY, quantity=1.0, entry_price=65000, stop_loss=63700, take_profit=67600)
        pos.unrealized_pnl = 500
        acc.positions.append(pos)
        assert acc.equity == 10500

    def test_win_rate_no_trades(self):
        acc = Account(exchange="binance", balance=10000)
        assert acc.win_rate == 0.0

    def test_win_rate_with_trades(self):
        acc = Account(exchange="binance", balance=10000, total_trades=10, winning_trades=7)
        assert acc.win_rate == 70.0

    def test_to_dict(self):
        acc = Account(exchange="binance", balance=10000, leverage=20)
        d = acc.to_dict()
        assert d["exchange"] == "binance"
        assert d["balance"] == 10000
        assert d["equity"] == 10000
        assert d["leverage"] == 20
        assert d["win_rate"] == 0.0
        assert d["positions"] == []
        assert d["trade_history"] == []

    def test_to_dict_truncates_trade_history(self):
        acc = Account(exchange="binance", balance=10000)
        for i in range(30):
            acc.trade_history.append(ClosedTrade(
                symbol="BTC/USDT", exchange="binance", side="BUY",
                quantity=1.0, entry_price=65000, exit_price=65100,
                pnl=100, fee=5, reason="TAKE_PROFIT", opened_at=1000 + i,
            ))
        d = acc.to_dict()
        assert len(d["trade_history"]) == 20  # truncated to last 20


class TestOrder:
    def test_defaults(self):
        o = Order(id="abc123", symbol="BTC/USDT", exchange="binance", side=Side.BUY, order_type=OrderType.MARKET, quantity=1.0)
        assert o.status == OrderStatus.PENDING
        assert o.filled_price == 0.0
        assert o.filled_quantity == 0.0
        assert o.fee == 0.0
        assert o.price is None
        assert o.rejection_reason is None

    def test_to_dict(self):
        o = Order(id="abc123", symbol="BTC/USDT", exchange="binance", side=Side.SELL, order_type=OrderType.LIMIT, quantity=0.5, price=66000)
        d = o.to_dict()
        assert d["side"] == "SELL"
        assert d["order_type"] == "LIMIT"
        assert d["price"] == 66000
        assert d["status"] == "PENDING"


class TestClosedTrade:
    def test_creation(self):
        t = ClosedTrade(
            symbol="BTC/USDT", exchange="binance", side="BUY",
            quantity=1.0, entry_price=65000, exit_price=66000,
            pnl=1000, fee=26, reason="TAKE_PROFIT", opened_at=1000,
        )
        assert t.reason == "TAKE_PROFIT"
        assert t.pnl == 1000

    def test_to_dict(self):
        t = ClosedTrade(
            symbol="ETH/USDT", exchange="bybit", side="SELL",
            quantity=2.0, entry_price=3500, exit_price=3400,
            pnl=200, fee=10, reason="STOP_LOSS", opened_at=2000,
        )
        d = t.to_dict()
        assert d["symbol"] == "ETH/USDT"
        assert d["reason"] == "STOP_LOSS"
        assert d["pnl"] == 200
