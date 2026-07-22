"""Tests for exchange simulator models and market simulator."""
import pytest

from exchange_simulator.market_simulator import MarketSimulator
from exchange_simulator.models import (
    Account,
    Candle,
    Order,
    OrderBook,
    OrderBookLevel,
    OrderStatus,
    OrderType,
    Position,
    Side,
)


class TestCandle:
    def test_to_dict(self):
        c = Candle(timestamp=100, open=50, high=55, low=45, close=52, volume=100)
        d = c.to_dict()
        assert d["open"] == 50
        assert d["close"] == 52
        assert d["volume"] == 100


class TestOrderBook:
    def test_properties(self):
        ob = OrderBook(
            symbol="BTC/USDT",
            exchange="binance",
            bids=[OrderBookLevel(99, 1), OrderBookLevel(98, 2)],
            asks=[OrderBookLevel(101, 1), OrderBookLevel(102, 2)],
        )
        assert ob.best_bid == 99
        assert ob.best_ask == 101
        assert ob.spread == 2
        assert ob.mid_price == 100


class TestPosition:
    def test_long_pnl(self):
        pos = Position("BTC/USDT", "binance", Side.BUY, 1.0, 100, 95, 110)
        pos.update_pnl(105)
        assert pos.unrealized_pnl == pytest.approx(5.0)

    def test_short_pnl(self):
        pos = Position("BTC/USDT", "binance", Side.SELL, 1.0, 100, 105, 90)
        pos.update_pnl(95)
        assert pos.unrealized_pnl == pytest.approx(5.0)


class TestAccount:
    def test_equity(self):
        acc = Account("binance", 10000)
        pos = Position("BTC/USDT", "binance", Side.BUY, 1.0, 100, 95, 110)
        pos.update_pnl(105)
        acc.positions.append(pos)
        assert acc.equity == pytest.approx(10005.0)

    def test_win_rate(self):
        acc = Account("binance", 10000)
        acc.total_trades = 10
        acc.winning_trades = 6
        assert acc.win_rate == 60.0

    def test_win_rate_no_trades(self):
        acc = Account("binance", 10000)
        assert acc.win_rate == 0.0


class TestMarketSimulator:
    def test_initialization(self):
        market = MarketSimulator(
            symbols=["BTC/USDT", "ETH/USDT"],
            exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000, "ETH/USDT": 3500},
            volatility={"BTC/USDT": 0.75, "ETH/USDT": 0.85},
            seed=42,
            warmup_candles=100,
        )
        # Should have 100 warmup candles
        btc_history = market.get_history("binance", "BTC/USDT", 200)
        assert len(btc_history) == 100

    def test_next_candle(self):
        market = MarketSimulator(
            symbols=["BTC/USDT"],
            exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000},
            volatility={"BTC/USDT": 0.75},
            seed=42,
            warmup_candles=50,
        )
        candles = market.next_candle()
        assert len(candles) == 1
        assert candles[0].symbol == "BTC/USDT"
        assert candles[0].close > 0

    def test_reproducible(self):
        m1 = MarketSimulator(
            symbols=["BTC/USDT"], exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000},
            volatility={"BTC/USDT": 0.75},
            seed=42, warmup_candles=50,
        )
        m2 = MarketSimulator(
            symbols=["BTC/USDT"], exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000},
            volatility={"BTC/USDT": 0.75},
            seed=42, warmup_candles=50,
        )
        c1 = m1.next_candle()
        c2 = m2.next_candle()
        assert c1[0].close == c2[0].close

    def test_order_book(self):
        market = MarketSimulator(
            symbols=["BTC/USDT"], exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000},
            volatility={"BTC/USDT": 0.75},
            seed=42, warmup_candles=50,
            order_book_depth=10,
        )
        ob = market.generate_order_book("binance", "BTC/USDT")
        assert ob.symbol == "BTC/USDT"
        assert len(ob.bids) == 10
        assert len(ob.asks) == 10
        assert ob.best_bid < ob.best_ask
