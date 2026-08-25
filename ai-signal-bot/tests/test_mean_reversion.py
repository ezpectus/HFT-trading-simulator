"""Tests for MeanReversionStrategy."""
import pytest
from src.strategies.strategies import MeanReversionStrategy
from src.strategies.signal import Signal, SignalDirection


def make_candles(n, start_price=65000, volatility=0.002):
    candles = []
    price = start_price
    for i in range(n):
        import random
        change = random.gauss(0, volatility)
        candles.append({
            "timestamp": 1700000000 + i * 60,
            "open": price,
            "high": price * (1 + abs(change)),
            "low": price * (1 - abs(change)),
            "close": price * (1 + change),
            "volume": 100,
        })
        price = price * (1 + change)
    return candles


class TestMeanReversionStrategy:
    @pytest.fixture
    def strategy(self):
        return MeanReversionStrategy(rsi_period=14, rsi_oversold=30, rsi_overbought=70)

    def test_insufficient_data_returns_neutral(self, strategy):
        result = strategy.analyze("BTC/USDT", make_candles(5))
        assert result.direction == SignalDirection.NEUTRAL

    def test_returns_signal_with_enough_data(self, strategy):
        result = strategy.analyze("BTC/USDT", make_candles(100))
        assert isinstance(result, Signal)
        assert result.strategy == "mean_reversion"

    def test_name_attribute(self, strategy):
        assert strategy.name == "mean_reversion"
