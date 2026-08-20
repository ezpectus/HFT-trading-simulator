"""Unit tests for strategies/sentiment.py.

Covers: EventType, NewsEvent, SentimentConfig, SentimentStrategy.
"""
import pytest

from src.strategies.strategies import SignalDirection


class TestEventType:
    def test_all_event_types(self):
        from src.strategies.sentiment import EventType
        assert EventType.FOMC.value == "fomc"
        assert EventType.HACK.value == "hack"
        assert EventType.LISTING.value == "listing"

    def test_sentiment_map(self):
        from src.strategies.sentiment import EVENT_SENTIMENT_MAP, EventType
        assert EVENT_SENTIMENT_MAP[EventType.HACK] == -0.9
        assert EVENT_SENTIMENT_MAP[EventType.LISTING] == 0.7
        assert EVENT_SENTIMENT_MAP[EventType.FOMC] == 0.0

    def test_volatility_map(self):
        from src.strategies.sentiment import EVENT_VOLATILITY_MAP, EventType
        assert EVENT_VOLATILITY_MAP[EventType.HACK] == 4.0
        assert EVENT_VOLATILITY_MAP[EventType.FOMC] == 3.0


class TestNewsEvent:
    def test_creation(self):
        from src.strategies.sentiment import EventType, NewsEvent
        ev = NewsEvent(
            event_type=EventType.FOMC,
            symbol="BTC/USDT",
            timestamp=1700000000.0,
            magnitude=0.8,
        )
        assert ev.event_type == EventType.FOMC
        assert ev.symbol == "BTC/USDT"
        assert ev.sentiment == 0.0
        assert ev.expected is True


class TestSentimentStrategy:
    @pytest.fixture
    def strategy(self):
        from src.strategies.sentiment import SentimentConfig, SentimentStrategy
        return SentimentStrategy(SentimentConfig())

    def test_init(self, strategy):
        assert strategy.name == "sentiment"
        assert strategy.event_count == 0
        assert strategy.current_sentiment == 0.0

    def test_on_news_event_low_magnitude_ignored(self, strategy):
        from src.strategies.sentiment import EventType, NewsEvent
        ev = NewsEvent(
            event_type=EventType.HACK,
            symbol="BTC/USDT",
            timestamp=1700000000.0,
            magnitude=0.1,
        )
        strategy.on_news_event(ev)
        assert strategy.event_count == 0

    def test_on_news_event_hack_negative_sentiment(self, strategy):
        from src.strategies.sentiment import EventType, NewsEvent
        ev = NewsEvent(
            event_type=EventType.HACK,
            symbol="BTC/USDT",
            timestamp=1700000000.0,
            magnitude=0.8,
        )
        strategy.on_news_event(ev)
        assert strategy.event_count == 1
        assert strategy.current_sentiment < 0

    def test_on_news_event_listing_positive_sentiment(self, strategy):
        from src.strategies.sentiment import EventType, NewsEvent
        ev = NewsEvent(
            event_type=EventType.LISTING,
            symbol="BTC/USDT",
            timestamp=1700000000.0,
            magnitude=0.8,
        )
        strategy.on_news_event(ev)
        assert strategy.event_count == 1
        assert strategy.current_sentiment > 0

    def test_analyze_no_candles(self, strategy):
        sig = strategy.analyze("BTC/USDT", [])
        assert sig.direction == SignalDirection.NEUTRAL
        assert "No data" in sig.reason

    def test_analyze_no_events_neutral(self, strategy, sample_candles):
        sig = strategy.analyze("BTC/USDT", sample_candles)
        assert sig.direction == SignalDirection.NEUTRAL

    def test_analyze_fade_extreme_positive(self, strategy, sample_candles):
        from src.strategies.sentiment import EventType, NewsEvent
        ev = NewsEvent(
            event_type=EventType.LISTING,
            symbol="BTC/USDT",
            timestamp=1700000000.0,
            magnitude=1.0,
        )
        strategy.on_news_event(ev)
        sig = strategy.analyze("BTC/USDT", sample_candles)
        assert sig.direction == SignalDirection.SHORT
        assert "Fade" in sig.reason

    def test_analyze_fade_extreme_negative(self, strategy, sample_candles):
        from src.strategies.sentiment import EventType, NewsEvent
        ev = NewsEvent(
            event_type=EventType.HACK,
            symbol="BTC/USDT",
            timestamp=1700000000.0,
            magnitude=1.0,
        )
        strategy.on_news_event(ev)
        sig = strategy.analyze("BTC/USDT", sample_candles)
        assert sig.direction == SignalDirection.LONG
        assert "Fade" in sig.reason

    def test_get_stats(self, strategy):
        from src.strategies.sentiment import EventType, NewsEvent
        ev = NewsEvent(
            event_type=EventType.LISTING,
            symbol="BTC/USDT",
            timestamp=1700000000.0,
            magnitude=0.8,
        )
        strategy.on_news_event(ev)
        stats = strategy.get_stats()
        assert stats["event_count"] == 1
        assert "current_sentiment" in stats
        assert "sentiment_by_symbol" in stats
