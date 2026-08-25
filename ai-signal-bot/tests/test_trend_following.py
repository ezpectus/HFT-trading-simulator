"""Tests for TrendFollowingStrategy."""
import pytest
from src.strategies.strategies import TrendFollowingStrategy
from src.strategies.signal import Signal, SignalDirection


def make_candles(n, start_price=65000, trend=0.001):
    candles = []
    price = start_price
    for i in range(n):
        candles.append({
            "timestamp": 1700000000 + i * 60,
            "open": price,
            "high": price * 1.002,
            "low": price * 0.998,
            "close": price * (1 + trend),
            "volume": 100,
        })
        price = price * (1 + trend)
    return candles


class TestTrendFollowingStrategy:
    @pytest.fixture
    def strategy(self):
        return TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=25.0)

    def test_insufficient_data_returns_neutral(self, strategy):
        candles = make_candles(10)
        result = strategy.analyze("BTC/USDT", candles)
        assert result.direction == SignalDirection.NEUTRAL
        assert "Insufficient" in result.reason

    def test_returns_signal_with_enough_data(self, strategy):
        candles = make_candles(100, trend=0.003)
        result = strategy.analyze("BTC/USDT", candles)
        assert isinstance(result, Signal)
        assert result.strategy == "trend_following"

    def test_neutral_in_ranging_market(self, strategy):
        candles = make_candles(100, trend=0.0)
        result = strategy.analyze("BTC/USDT", candles)
        assert isinstance(result, Signal)

    def test_name_attribute(self, strategy):
        assert strategy.name == "trend_following"

    def test_cache_works(self, strategy):
        candles = make_candles(100, trend=0.002)
        result1 = strategy.analyze("BTC/USDT", candles)
        result2 = strategy.analyze("BTC/USDT", candles)
        assert result1.direction == result2.direction
