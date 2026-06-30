"""Sentiment strategy — news event consumption and sentiment-based trading.

Consumes news events from the simulator, computes sentiment scores,
pre-positions before scheduled events, fades or follows post-event.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from typing import Optional
from collections import deque
from enum import Enum

from src.strategies.strategies import Signal, SignalDirection

import logging
logger = logging.getLogger(__name__)


class EventType(Enum):
    FOMC = "fomc"                # Fed meeting
    CPI = "cpi"                  # Inflation data
    NFP = "nfp"                  # Non-farm payrolls
    EARNINGS = "earnings"
    REGULATION = "regulation"
    HACK = "hack"                # Exchange hack
    WHALE = "whale"              # Large wallet movement
    LISTING = "listing"          # New exchange listing
    LIQUIDATION = "liquidation"  # Large liquidation event
    UNKNOWN = "unknown"


EVENT_SENTIMENT_MAP = {
    EventType.FOMC: 0.0,         # Neutral until outcome
    EventType.CPI: 0.0,          # Depends on actual vs expected
    EventType.NFP: 0.0,
    EventType.EARNINGS: 0.0,
    EventType.REGULATION: -0.6,  # Typically negative for crypto
    EventType.HACK: -0.9,        # Very negative
    EventType.WHALE: -0.3,       # Mildly negative (sell pressure)
    EventType.LISTING: 0.7,      # Positive (new demand)
    EventType.LIQUIDATION: -0.4, # Negative (cascade risk)
    EventType.UNKNOWN: 0.0,
}

EVENT_VOLATILITY_MAP = {
    EventType.FOMC: 3.0,
    EventType.CPI: 2.0,
    EventType.NFP: 2.0,
    EventType.EARNINGS: 1.5,
    EventType.REGULATION: 2.5,
    EventType.HACK: 4.0,
    EventType.WHALE: 1.5,
    EventType.LISTING: 2.0,
    EventType.LIQUIDATION: 2.5,
    EventType.UNKNOWN: 1.0,
}


@dataclass
class NewsEvent:
    event_type: EventType
    symbol: str
    timestamp: float
    magnitude: float             # 0-1, severity/importance
    sentiment: float = 0.0       # -1 to 1
    expected: bool = True        # Scheduled vs unexpected
    details: str = ""


@dataclass
class SentimentConfig:
    pre_event_window_s: int = 60       # Pre-position 60s before scheduled events
    post_event_window_s: int = 120     # Trade post-event for 120s
    fade_threshold: float = 0.7        # Fade if sentiment > this
    follow_threshold: float = 0.3      # Follow if sentiment < this
    min_magnitude: float = 0.3         # Ignore low-magnitude events
    max_position_multiplier: float = 2.0  # Size multiplier for high-impact events
    decay_rate: float = 0.95           # Sentiment decay per second


class SentimentStrategy:
    """News/sentiment-based trading strategy."""

    def __init__(self, config: SentimentConfig = None):
        self.config = config or SentimentConfig()
        self.name = "sentiment"
        self.recent_events: deque[NewsEvent] = deque(maxlen=100)
        self.current_sentiment: float = 0.0
        self.sentiment_by_symbol: dict[str, float] = {}
        self.event_count: int = 0
        self._last_update: float = time.time()

    def on_news_event(self, event: NewsEvent) -> None:
        """Process a news event."""
        if event.magnitude < self.config.min_magnitude:
            return

        # Compute sentiment
        base_sentiment = EVENT_SENTIMENT_MAP.get(event.event_type, 0.0)
        # Adjust by magnitude
        event.sentiment = base_sentiment * event.magnitude
        # Add noise for unexpected events
        if not event.expected:
            import numpy as np
            event.sentiment += np.random.normal(0, 0.2) * event.magnitude

        self.recent_events.append(event)
        self.event_count += 1

        # Update current sentiment
        self.current_sentiment = event.sentiment
        self.sentiment_by_symbol[event.symbol] = event.sentiment

        logger.info(
            f"[Sentiment] Event: {event.event_type.value} for {event.symbol} "
            f"sentiment={event.sentiment:.2f} magnitude={event.magnitude:.2f}"
        )

    def _decay_sentiment(self) -> None:
        """Decay sentiment over time."""
        now = time.time()
        dt = now - self._last_update
        if dt > 0:
            decay = self.config.decay_rate ** dt
            self.current_sentiment *= decay
            for sym in self.sentiment_by_symbol:
                self.sentiment_by_symbol[sym] *= decay
        self._last_update = now

    def _get_recent_event(self, symbol: str, window_s: float) -> Optional[NewsEvent]:
        """Get most recent event for symbol within window."""
        now = time.time()
        for event in reversed(self.recent_events):
            if event.symbol == symbol and (now - event.timestamp) < window_s:
                return event
        return None

    def analyze(self, symbol: str, candles: list[dict]) -> Signal:
        """Generate signal based on sentiment."""
        self._decay_sentiment()

        if not candles:
            return Signal(
                symbol=symbol, direction=SignalDirection.NEUTRAL,
                confidence=0, strategy=self.name, entry_price=0,
                stop_loss=0, take_profit=0, reason="No data",
            )

        price = candles[-1]["close"] if isinstance(candles[-1], dict) else candles[-1].close
        recent_event = self._get_recent_event(symbol, self.config.post_event_window_s)

        if recent_event is None and abs(self.current_sentiment) < 0.1:
            return Signal(
                symbol=symbol, direction=SignalDirection.NEUTRAL,
                confidence=0, strategy=self.name, entry_price=price,
                stop_loss=0, take_profit=0, reason="No recent sentiment events",
            )

        sentiment = self.sentiment_by_symbol.get(symbol, self.current_sentiment)
        magnitude = recent_event.magnitude if recent_event else 0.5
        event_type = recent_event.event_type if recent_event else EventType.UNKNOWN
        vol_mult = EVENT_VOLATILITY_MAP.get(event_type, 1.0)

        # Compute ATR for SL/TP
        closes = [c["close"] if isinstance(c, dict) else c.close for c in candles[-14:]]
        highs = [c["high"] if isinstance(c, dict) else c.high for c in candles[-14:]]
        lows = [c["low"] if isinstance(c, dict) else c.low for c in candles[-14:]]
        if len(closes) >= 14:
            trs = []
            for i in range(1, len(closes)):
                tr = max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
                trs.append(tr)
            current_atr = sum(trs[-14:]) / max(len(trs), 1)
        else:
            current_atr = price * 0.01

        # Wider SL/TP for high-volatility events
        sl_distance = current_atr * 2 * vol_mult
        tp_distance = current_atr * 3 * vol_mult

        # Sentiment-based signal
        if sentiment > self.config.fade_threshold:
            # Extreme positive sentiment → fade (contrarian)
            confidence = min(90, 40 + abs(sentiment) * 30)
            return Signal(
                symbol=symbol, direction=SignalDirection.SHORT,
                confidence=int(confidence), strategy=self.name,
                entry_price=price, stop_loss=price + sl_distance,
                take_profit=price - tp_distance,
                reason=f"Fade extreme positive sentiment ({sentiment:.2f}) from {event_type.value}",
            )
        elif sentiment < -self.config.fade_threshold:
            # Extreme negative sentiment → fade
            confidence = min(90, 40 + abs(sentiment) * 30)
            return Signal(
                symbol=symbol, direction=SignalDirection.LONG,
                confidence=int(confidence), strategy=self.name,
                entry_price=price, stop_loss=price - sl_distance,
                take_profit=price + tp_distance,
                reason=f"Fade extreme negative sentiment ({sentiment:.2f}) from {event_type.value}",
            )
        elif sentiment > self.config.follow_threshold:
            # Moderate positive → follow
            confidence = min(80, 30 + abs(sentiment) * 40)
            return Signal(
                symbol=symbol, direction=SignalDirection.LONG,
                confidence=int(confidence), strategy=self.name,
                entry_price=price, stop_loss=price - sl_distance,
                take_profit=price + tp_distance,
                reason=f"Follow positive sentiment ({sentiment:.2f}) from {event_type.value}",
            )
        elif sentiment < -self.config.follow_threshold:
            # Moderate negative → follow
            confidence = min(80, 30 + abs(sentiment) * 40)
            return Signal(
                symbol=symbol, direction=SignalDirection.SHORT,
                confidence=int(confidence), strategy=self.name,
                entry_price=price, stop_loss=price + sl_distance,
                take_profit=price - tp_distance,
                reason=f"Follow negative sentiment ({sentiment:.2f}) from {event_type.value}",
            )

        return Signal(
            symbol=symbol, direction=SignalDirection.NEUTRAL,
            confidence=0, strategy=self.name, entry_price=price,
            stop_loss=0, take_profit=0, reason=f"Sentiment {sentiment:.2f} in neutral zone",
        )

    def get_stats(self) -> dict:
        return {
            "event_count": self.event_count,
            "current_sentiment": self.current_sentiment,
            "sentiment_by_symbol": dict(self.sentiment_by_symbol),
            "recent_events": len(self.recent_events),
        }
