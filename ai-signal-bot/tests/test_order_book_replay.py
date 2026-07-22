"""Tests for order book replay module."""
import pytest

from src.backtesting.backtester import Backtester
from src.backtesting.order_book_replay import (
    OrderBookBacktester,
    OrderBookReplay,
    ReplayOrderBook,
    ReplayOrderBookLevel,
)
from src.strategies import TrendFollowingStrategy


def make_candle(close=100, high=101, low=99, open_p=100, volume=500, ts=1704067200):
    return {
        "timestamp": ts, "open": open_p, "high": high,
        "low": low, "close": close, "volume": volume,
    }


def make_trending_candles(n=100, start=100, slope=0.3):
    import math
    candles = []
    for i in range(n):
        close = start + i * slope + math.sin(i * 0.1) * 2
        candles.append(make_candle(
            close=close, high=close + 1, low=close - 1,
            open_p=close - slope * 0.5, volume=500, ts=1704067200 + i * 300,
        ))
    return candles


class TestReplayOrderBook:
    def test_mid_price(self):
        ob = ReplayOrderBook(
            symbol="BTC/USDT", exchange="binance", timestamp=0,
            bids=[ReplayOrderBookLevel(99.0, 1.0)],
            asks=[ReplayOrderBookLevel(101.0, 1.0)],
        )
        assert ob.mid_price == 100.0

    def test_spread(self):
        ob = ReplayOrderBook(
            symbol="BTC/USDT", exchange="binance", timestamp=0,
            bids=[ReplayOrderBookLevel(99.0, 1.0)],
            asks=[ReplayOrderBookLevel(101.0, 1.0)],
        )
        assert ob.spread == 2.0

    def test_spread_bps(self):
        ob = ReplayOrderBook(
            symbol="BTC/USDT", exchange="binance", timestamp=0,
            bids=[ReplayOrderBookLevel(99.0, 1.0)],
            asks=[ReplayOrderBookLevel(101.0, 1.0)],
        )
        assert abs(ob.spread_bps - 200.0) < 0.1  # 2/100 * 10000

    def test_obi_balanced(self):
        ob = ReplayOrderBook(
            symbol="BTC/USDT", exchange="binance", timestamp=0,
            bids=[ReplayOrderBookLevel(99.0, 1.0)],
            asks=[ReplayOrderBookLevel(101.0, 1.0)],
        )
        assert ob.obi == 0.0

    def test_obi_bid_heavy(self):
        ob = ReplayOrderBook(
            symbol="BTC/USDT", exchange="binance", timestamp=0,
            bids=[ReplayOrderBookLevel(99.0, 3.0)],
            asks=[ReplayOrderBookLevel(101.0, 1.0)],
        )
        assert ob.obi == 0.5  # (3-1)/(3+1)

    def test_obi_empty(self):
        ob = ReplayOrderBook(symbol="BTC/USDT", exchange="binance", timestamp=0)
        assert ob.obi == 0.0
        assert ob.mid_price == 0.0

    def test_vwap_bid(self):
        ob = ReplayOrderBook(
            symbol="BTC/USDT", exchange="binance", timestamp=0,
            bids=[
                ReplayOrderBookLevel(99.0, 2.0),
                ReplayOrderBookLevel(98.0, 1.0),
            ],
            asks=[],
        )
        # (99*2 + 98*1) / (2+1) = 296/3 = 98.67
        assert abs(ob.vwap_bid - 98.6667) < 0.01

    def test_to_dict(self):
        ob = ReplayOrderBook(
            symbol="BTC/USDT", exchange="binance", timestamp=123,
            bids=[ReplayOrderBookLevel(99.0, 1.0)],
            asks=[ReplayOrderBookLevel(101.0, 1.0)],
        )
        d = ob.to_dict()
        assert d["symbol"] == "BTC/USDT"
        assert d["mid_price"] == 100.0
        assert len(d["bids"]) == 1
        assert len(d["asks"]) == 1


class TestOrderBookReplay:
    def test_from_candle_basic(self):
        replay = OrderBookReplay(depth=10, seed=42)
        candle = make_candle(close=65000, high=65100, low=64900, volume=1000)
        ob = replay.from_candle(candle, "BTC/USDT", "binance")
        assert ob.symbol == "BTC/USDT"
        assert ob.exchange == "binance"
        assert len(ob.bids) == 10
        assert len(ob.asks) == 10

    def test_bid_prices_below_close(self):
        replay = OrderBookReplay(depth=5, seed=42)
        candle = make_candle(close=100, high=101, low=99, volume=500)
        ob = replay.from_candle(candle)
        for level in ob.bids:
            assert level.price < 100

    def test_ask_prices_above_close(self):
        replay = OrderBookReplay(depth=5, seed=42)
        candle = make_candle(close=100, high=101, low=99, volume=500)
        ob = replay.from_candle(candle)
        for level in ob.asks:
            assert level.price > 100

    def test_positive_quantities(self):
        replay = OrderBookReplay(depth=10, seed=42)
        candle = make_candle(close=100, volume=500)
        ob = replay.from_candle(candle)
        for level in ob.bids:
            assert level.quantity > 0
        for level in ob.asks:
            assert level.quantity > 0

    def test_volume_decay(self):
        replay = OrderBookReplay(depth=10, seed=42, volume_decay=0.9)
        candle = make_candle(close=100, volume=1000)
        ob = replay.from_candle(candle)
        # First levels should have more volume than deeper levels (on average)
        first_bid = ob.bids[0].quantity
        last_bid = ob.bids[-1].quantity
        assert first_bid > last_bid

    def test_bullish_candle_more_bids(self):
        replay = OrderBookReplay(depth=20, seed=42)
        # Bullish candle: close > open
        bullish = make_candle(close=105, open_p=100, high=106, low=99, volume=1000)
        ob_bull = replay.from_candle(bullish)
        # Bearish candle: close < open
        bearish = make_candle(close=95, open_p=100, high=101, low=94, volume=1000)
        ob_bear = replay.from_candle(bearish)
        # Bullish should have higher OBI than bearish
        assert ob_bull.obi > ob_bear.obi

    def test_reproducible_with_seed(self):
        replay1 = OrderBookReplay(depth=5, seed=42)
        replay2 = OrderBookReplay(depth=5, seed=42)
        candle = make_candle(close=100, volume=500)
        ob1 = replay1.from_candle(candle)
        ob2 = replay2.from_candle(candle)
        assert ob1.bids[0].price == ob2.bids[0].price
        assert ob1.bids[0].quantity == ob2.bids[0].quantity

    def test_replay_series(self):
        replay = OrderBookReplay(depth=5, seed=42)
        candles = [make_candle(close=100 + i, volume=500, ts=1704067200 + i * 300) for i in range(20)]
        books = replay.replay_series(candles, "BTC/USDT", "binance")
        assert len(books) == 20
        assert all(ob.symbol == "BTC/USDT" for ob in books)

    def test_imbalance_injection(self):
        replay = OrderBookReplay(depth=10, seed=42)
        candles = [make_candle(close=100, volume=500, ts=1704067200 + i * 300) for i in range(50)]
        books = replay.replay_with_imbalance_injection(
            candles, inject_interval=10, inject_strength=0.5,
        )
        # At injection points, OBI should be more extreme
        normal_obi = abs(books[5].obi)
        injected_obi = abs(books[10].obi)  # injection at i=10
        assert injected_obi > normal_obi

    def test_spread_increases_with_volatility(self):
        replay = OrderBookReplay(depth=5, seed=42)
        low_vol = make_candle(close=100, high=100.5, low=99.5, volume=500)
        high_vol = make_candle(close=100, high=105, low=95, volume=500)
        ob_low = replay.from_candle(low_vol)
        ob_high = replay.from_candle(high_vol)
        assert ob_high.spread_bps > ob_low.spread_bps


class TestOrderBookBacktester:
    def test_run_with_order_books(self):
        candles = make_trending_candles(n=100, slope=0.5)
        bt = Backtester(initial_balance=10000)
        replay = OrderBookReplay(depth=10, seed=42)
        ob_bt = OrderBookBacktester(bt, replay)

        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=0)
        result, books = ob_bt.run_with_order_books(candles, strategy, warmup=50)

        assert result is not None
        assert len(books) == 100
        assert result.initial_balance == 10000

    def test_order_books_match_candles(self):
        candles = make_trending_candles(n=50, slope=0.3)
        bt = Backtester(initial_balance=10000)
        ob_bt = OrderBookBacktester(bt)
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=0)
        _, books = ob_bt.run_with_order_books(candles, strategy, warmup=20)

        # Each book's timestamp should match the corresponding candle
        for i, book in enumerate(books):
            assert book.timestamp == candles[i]["timestamp"]
