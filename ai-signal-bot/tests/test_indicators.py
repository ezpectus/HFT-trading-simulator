"""Tests for technical indicators."""
import math
import pytest

from src.technical_analysis.indicators import (
    adx, atr, bollinger_bands, ema, macd, rsi, sma, vwap,
)


def make_candles(closes: list[float], volume: float = 100.0) -> list[dict]:
    """Build candle dicts from close prices."""
    candles = []
    for i, c in enumerate(closes):
        candles.append({
            "timestamp": 1704067200 + i * 300,
            "open": closes[i - 1] if i > 0 else c,
            "high": c * 1.01,
            "low": c * 0.99,
            "close": c,
            "volume": volume,
        })
    return candles


class TestSMA:
    def test_basic(self):
        result = sma([1, 2, 3, 4, 5], 3)
        assert math.isnan(result[0])
        assert math.isnan(result[1])
        assert result[2] == pytest.approx(2.0)
        assert result[3] == pytest.approx(3.0)
        assert result[4] == pytest.approx(4.0)

    def test_short_data(self):
        result = sma([1, 2], 5)
        assert all(math.isnan(v) for v in result)


class TestEMA:
    def test_basic(self):
        result = ema([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5)
        assert math.isnan(result[0])
        assert math.isnan(result[1])
        assert math.isnan(result[2])
        assert math.isnan(result[3])
        assert result[4] == pytest.approx(3.0)  # SMA seed
        # EMA should be between min and max
        assert result[4] <= result[9] <= 10.0

    def test_short_data(self):
        result = ema([1], 5)
        assert all(math.isnan(v) for v in result)


class TestRSI:
    def test_all_gains(self):
        candles = make_candles([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
                                111, 112, 113, 114, 115])
        result = rsi(candles, 14)
        assert math.isnan(result[0])
        assert result[14] == pytest.approx(100.0)

    def test_all_losses(self):
        closes = [115, 114, 113, 112, 111, 110, 109, 108, 107, 106, 105, 104, 103, 102, 101, 100]
        candles = make_candles(closes)
        result = rsi(candles, 14)
        assert result[14] == pytest.approx(0.0, abs=0.01)

    def test_short_data(self):
        candles = make_candles([100, 101])
        result = rsi(candles, 14)
        assert all(math.isnan(v) for v in result)


class TestMACD:
    def test_basic(self):
        closes = [100 + i * 0.5 for i in range(50)]
        candles = make_candles(closes)
        macd_line, signal_line, hist = macd(candles, 12, 26, 9)
        assert len(macd_line) == 50
        assert len(signal_line) == 50
        assert len(hist) == 50
        # MACD should be positive in uptrend
        assert macd_line[-1] > 0


class TestBollingerBands:
    def test_basic(self):
        closes = [100, 101, 99, 102, 98, 103, 97, 104, 96, 105,
                  95, 106, 94, 107, 93, 108, 92, 109, 91, 110]
        candles = make_candles(closes)
        mid, upper, lower = bollinger_bands(candles, 20, 2.0)
        assert math.isnan(mid[0])
        assert not math.isnan(mid[19])
        assert upper[19] > mid[19] > lower[19]


class TestATR:
    def test_basic(self):
        closes = [100, 102, 98, 103, 97, 104, 96, 105, 95, 106,
                  94, 107, 93, 108, 92, 109]
        candles = make_candles(closes)
        result = atr(candles, 14)
        assert math.isnan(result[0])
        assert not math.isnan(result[14])
        assert result[14] > 0


class TestVWAP:
    def test_basic(self):
        candles = make_candles([100, 102, 98, 101], volume=100.0)
        result = vwap(candles)
        assert not math.isnan(result[0])
        assert result[-1] > 0
