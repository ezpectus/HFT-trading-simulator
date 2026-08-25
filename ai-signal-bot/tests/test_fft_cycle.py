"""Tests for FFTCycleStrategy."""
import pytest
from src.strategies.strategies import FFTCycleStrategy
from src.strategies.signal import Signal, SignalDirection


def make_candles(n, start_price=65000, period=30):
    import math
    candles = []
    for i in range(n):
        price = start_price + 100 * math.sin(2 * math.pi * i / period)
        candles.append({
            "timestamp": 1700000000 + i * 60,
            "open": price,
            "high": price + 50,
            "low": price - 50,
            "close": price,
            "volume": 100,
        })
    return candles


class TestFFTCycleStrategy:
    @pytest.fixture
    def strategy(self):
        return FFTCycleStrategy()

    def test_insufficient_data_returns_neutral(self, strategy):
        result = strategy.analyze("BTC/USDT", make_candles(10))
        assert result.direction == SignalDirection.NEUTRAL

    def test_returns_signal_with_enough_data(self, strategy):
        result = strategy.analyze("BTC/USDT", make_candles(200))
        assert isinstance(result, Signal)
        assert result.strategy == "fft_cycle"

    def test_name_attribute(self, strategy):
        assert strategy.name == "fft_cycle"
