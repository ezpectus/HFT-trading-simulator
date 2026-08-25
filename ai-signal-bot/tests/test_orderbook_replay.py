"""Tests for OrderBookReplay."""
import pytest
from src.backtesting.order_book_replay import OrderBookReplay, ReplayOrderBook


class TestOrderBookReplay:
    @pytest.fixture
    def replay(self):
        return OrderBookReplay(depth=10, seed=42)

    @pytest.fixture
    def candle(self):
        return {
            "timestamp": 1700000000,
            "open": 65000, "high": 65200, "low": 64800,
            "close": 65100, "volume": 500,
        }

    def test_creation(self, replay):
        assert replay.depth == 10

    def test_from_candle_returns_orderbook(self, replay, candle):
        ob = replay.from_candle(candle, symbol="BTC/USDT", exchange="binance")
        assert isinstance(ob, ReplayOrderBook)
        assert ob.symbol == "BTC/USDT"
        assert ob.exchange == "binance"
        assert len(ob.bids) == 10
        assert len(ob.asks) == 10

    def test_mid_price_in_range(self, replay, candle):
        ob = replay.from_candle(candle, symbol="BTC/USDT", exchange="binance")
        assert ob.low <= ob.mid_price <= ob.high or 64800 <= ob.mid_price <= 65200

    def test_bids_below_asks(self, replay, candle):
        ob = replay.from_candle(candle, symbol="BTC/USDT", exchange="binance")
        if ob.bids and ob.asks:
            assert ob.bids[0].price <= ob.asks[0].price

    def test_spread_positive(self, replay, candle):
        ob = replay.from_candle(candle, symbol="BTC/USDT", exchange="binance")
        assert ob.spread_bps >= 0

    def test_deterministic_with_seed(self, replay, candle):
        ob1 = replay.from_candle(candle, symbol="BTC/USDT", exchange="binance")
        replay2 = OrderBookReplay(depth=10, seed=42)
        ob2 = replay2.from_candle(candle, symbol="BTC/USDT", exchange="binance")
        assert ob1.mid_price == ob2.mid_price
