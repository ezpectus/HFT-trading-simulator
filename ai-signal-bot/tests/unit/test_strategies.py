"""Unit tests for strategies."""

import pytest
import math
from src.strategies.strategies import (
    Signal, SignalDirection, TrendFollowingStrategy, MeanReversionStrategy,
)
from src.strategies.statistical_arbitrage import StatisticalArbitrage, KalmanFilterHedge
from src.strategies.market_making import MarketMakingStrategy, MarketMakingConfig
from src.strategies.sentiment import SentimentStrategy, NewsEvent, EventType


def make_candles(n=50, start_price=50000.0, trend=0.0):
    """Generate test candle data."""
    candles = []
    price = start_price
    for i in range(n):
        ret = 0.001 * trend + (i % 5 - 2) * 0.0005
        o = price
        c = price * (1 + ret)
        h = max(o, c) * 1.001
        l = min(o, c) * 0.999
        candles.append({"timestamp": i * 60, "open": o, "high": h, "low": l, "close": c, "volume": 100.0})
        price = c
    return candles


class TestSignal:
    def test_signal_creation(self):
        s = Signal("BTCUSDT", SignalDirection.LONG, 80, "test", 50000, 49000, 52000)
        assert s.symbol == "BTCUSDT"
        assert s.direction == SignalDirection.LONG
        assert s.confidence == 80
        assert s.is_actionable

    def test_neutral_not_actionable(self):
        s = Signal("BTCUSDT", SignalDirection.NEUTRAL, 0, "test", 50000, 0, 0)
        assert not s.is_actionable

    def test_rr_ratio_long(self):
        s = Signal("BTC", SignalDirection.LONG, 80, "test", 50000, 49000, 55000)
        assert s.rr_ratio == pytest.approx(5.0, rel=0.01)

    def test_rr_ratio_short(self):
        s = Signal("BTC", SignalDirection.SHORT, 80, "test", 50000, 51000, 45000)
        assert s.rr_ratio == pytest.approx(5.0, rel=0.01)

    def test_to_dict(self):
        s = Signal("BTC", SignalDirection.LONG, 80, "test", 50000, 49000, 52000)
        d = s.to_dict()
        assert d["symbol"] == "BTC"
        assert d["direction"] == "LONG"


class TestTrendFollowing:
    def test_insufficient_data(self):
        strat = TrendFollowingStrategy()
        signal = strat.analyze("BTCUSDT", make_candles(5))
        assert signal.direction == SignalDirection.NEUTRAL

    def test_returns_signal(self):
        strat = TrendFollowingStrategy()
        candles = make_candles(50, trend=1.0)
        signal = strat.analyze("BTCUSDT", candles)
        assert signal.strategy == "trend_following"
        assert signal.symbol == "BTCUSDT"


class TestMeanReversion:
    def test_insufficient_data(self):
        strat = MeanReversionStrategy()
        signal = strat.analyze("BTCUSDT", make_candles(5))
        assert signal.direction == SignalDirection.NEUTRAL


class TestKalmanFilter:
    def test_initialization(self):
        kf = KalmanFilterHedge()
        kf.init(1.5, 0.0)
        assert kf.hedge_ratio == 1.5

    def test_update_converges(self):
        kf = KalmanFilterHedge()
        kf.init(1.0, 0.0)
        for i in range(100):
            kf.update(100 + i * 0.1, 50 + i * 0.05)
        assert 0.5 < kf.hedge_ratio < 3.0


class TestMarketMaking:
    def test_generate_quotes(self):
        strat = MarketMakingStrategy(MarketMakingConfig(max_inventory=5.0))
        quote = strat.generate_quotes(50000.0)
        assert quote.bid_price < quote.ask_price
        assert quote.mid_price == 50000.0

    def test_max_inventory(self):
        strat = MarketMakingStrategy(MarketMakingConfig(max_inventory=5.0))
        strat.inventory = 5.0
        quote = strat.generate_quotes(50000.0)
        assert quote.bid_price == 0  # Only ask side

    def test_toxicity_cancel(self):
        strat = MarketMakingStrategy(MarketMakingConfig(toxicity_threshold=0.5))
        strat.update_toxicity(0.8)
        quote = strat.generate_quotes(50000.0)
        assert quote.should_cancel


class TestSentiment:
    def test_no_events(self):
        strat = SentimentStrategy()
        signal = strat.analyze("BTCUSDT", make_candles(20))
        assert signal.direction == SignalDirection.NEUTRAL

    def test_hack_event(self):
        strat = SentimentStrategy()
        event = NewsEvent(
            event_type=EventType.HACK, symbol="BTCUSDT",
            timestamp=0, magnitude=0.9, expected=False,
        )
        strat.on_news_event(event)
        signal = strat.analyze("BTCUSDT", make_candles(20))
        # Hack is very negative → fade (contrarian LONG)
        assert signal.direction in (SignalDirection.LONG, SignalDirection.NEUTRAL)

    def test_listing_event(self):
        strat = SentimentStrategy()
        event = NewsEvent(
            event_type=EventType.LISTING, symbol="BTCUSDT",
            timestamp=0, magnitude=0.8, expected=True,
        )
        strat.on_news_event(event)
        signal = strat.analyze("BTCUSDT", make_candles(20))
        assert signal.direction in (SignalDirection.LONG, SignalDirection.NEUTRAL)
