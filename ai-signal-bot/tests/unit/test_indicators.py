"""Tests for technical analysis indicators — SMA, EMA, RSI, MACD, BB, ATR, VWAP, ADX."""
import math

import pytest

from src.technical_analysis.indicators import (
    NAN,
    adx,
    atr,
    bollinger_bands,
    ema,
    macd,
    rsi,
    sma,
    vwap,
)


def make_candles(closes, highs=None, lows=None, volumes=None):
    """Build candle dicts from close prices."""
    n = len(closes)
    highs = highs or [c * 1.01 for c in closes]
    lows = lows or [c * 0.99 for c in closes]
    volumes = volumes or [1000.0] * n
    return [
        {"close": c, "high": h, "low": low, "volume": v, "open": c, "timestamp": i * 300}
        for i, (c, h, low, v) in enumerate(zip(closes, highs, lows, volumes, strict=False))
    ]


class TestSMA:
    def test_basic(self):
        result = sma([1, 2, 3, 4, 5], period=3)
        assert len(result) == 5
        assert math.isnan(result[0])
        assert math.isnan(result[1])
        assert result[2] == pytest.approx(2.0)
        assert result[3] == pytest.approx(3.0)
        assert result[4] == pytest.approx(4.0)

    def test_period_equals_length(self):
        result = sma([1, 2, 3], period=3)
        assert result[2] == pytest.approx(2.0)

    def test_empty(self):
        result = sma([], period=3)
        assert result == []

    def test_period_larger_than_data(self):
        result = sma([1, 2], period=5)
        assert all(math.isnan(v) for v in result)


class TestEMA:
    def test_basic(self):
        result = ema([1, 2, 3, 4, 5], period=3)
        assert len(result) == 5
        assert math.isnan(result[0])
        assert math.isnan(result[1])
        assert result[2] == pytest.approx(2.0)  # SMA seed
        # EMA: mult = 2/(3+1) = 0.5
        # result[3] = 4 * 0.5 + 2.0 * 0.5 = 3.0
        assert result[3] == pytest.approx(3.0)
        # result[4] = 5 * 0.5 + 3.0 * 0.5 = 4.0
        assert result[4] == pytest.approx(4.0)

    def test_insufficient_data(self):
        result = ema([1, 2], period=5)
        assert all(math.isnan(v) for v in result)

    def test_period_1(self):
        result = ema([1, 2, 3], period=1)
        # mult = 2/2 = 1.0, so EMA = values
        assert result[0] == pytest.approx(1.0)
        assert result[1] == pytest.approx(2.0)
        assert result[2] == pytest.approx(3.0)


class TestRSI:
    def test_all_gains(self):
        candles = make_candles([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
                                111, 112, 113, 114, 115])
        result = rsi(candles, period=14)
        assert len(result) == 16
        assert math.isnan(result[0])
        # All gains, no losses → RSI = 100
        assert result[14] == pytest.approx(100.0)
        assert result[15] == pytest.approx(100.0)

    def test_all_losses(self):
        candles = make_candles([115, 114, 113, 112, 111, 110, 109, 108, 107, 106, 105,
                                104, 103, 102, 101, 100])
        result = rsi(candles, period=14)
        # All losses, no gains → RSI = 0
        assert result[14] == pytest.approx(0.0)

    def test_mixed(self):
        candles = make_candles([100, 102, 100, 102, 100, 102, 100, 102, 100, 102, 100,
                                102, 100, 102, 100, 102])
        result = rsi(candles, period=14)
        assert 0 < result[14] < 100

    def test_insufficient_data(self):
        candles = make_candles([100, 101, 102])
        result = rsi(candles, period=14)
        assert all(math.isnan(v) for v in result)


class TestMACD:
    def test_returns_three_lists(self):
        candles = make_candles([100 + i for i in range(50)])
        macd_line, signal_line, histogram = macd(candles)
        assert len(macd_line) == 50
        assert len(signal_line) == 50
        assert len(histogram) == 50

    def test_nan_before_valid(self):
        candles = make_candles([100 + i for i in range(50)])
        macd_line, _, _ = macd(candles, fast=12, slow=26)
        # MACD line should be NaN before slow EMA is available
        assert math.isnan(macd_line[0])
        assert not math.isnan(macd_line[-1])

    def test_histogram_is_difference(self):
        candles = make_candles([100 + i for i in range(50)])
        macd_line, signal_line, histogram = macd(candles)
        for i in range(len(candles)):
            if not math.isnan(macd_line[i]) and not math.isnan(signal_line[i]):
                assert histogram[i] == pytest.approx(macd_line[i] - signal_line[i])


class TestBollingerBands:
    def test_basic(self):
        candles = make_candles([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
                                111, 112, 113, 114, 115, 116, 117, 118, 119, 120])
        mid, upper, lower = bollinger_bands(candles, period=20, std_dev=2.0)
        assert len(mid) == 21
        assert math.isnan(mid[0])
        assert not math.isnan(mid[19])
        # Upper > mid > lower
        for i in range(19, 21):
            assert upper[i] > mid[i]
            assert lower[i] < mid[i]

    def test_constant_prices(self):
        candles = make_candles([100] * 25)
        mid, upper, lower = bollinger_bands(candles, period=20)
        # With constant prices, std = 0, so upper = mid = lower
        assert mid[19] == pytest.approx(100.0)
        assert upper[19] == pytest.approx(100.0)
        assert lower[19] == pytest.approx(100.0)


class TestATR:
    def test_basic(self):
        candles = make_candles(
            closes=[100, 102, 101, 103, 102, 104, 103, 105, 104, 106, 105, 107, 106, 108, 107, 109],
            highs=[101, 103, 102, 104, 103, 105, 104, 106, 105, 107, 106, 108, 107, 109, 108, 110],
            lows=[99, 101, 100, 102, 101, 103, 102, 104, 103, 105, 104, 106, 105, 107, 106, 108],
        )
        result = atr(candles, period=14)
        assert len(result) == 16
        assert math.isnan(result[0])
        assert not math.isnan(result[14])
        assert result[14] > 0

    def test_insufficient_data(self):
        candles = make_candles([100, 102, 101])
        result = atr(candles, period=14)
        assert all(math.isnan(v) for v in result)


class TestVWAP:
    def test_basic(self):
        candles = make_candles(
            closes=[100, 102, 101],
            highs=[101, 103, 102],
            lows=[99, 101, 100],
            volumes=[1000, 2000, 1500],
        )
        result = vwap(candles)
        assert len(result) == 3
        assert not math.isnan(result[0])
        # First: TP = (101+99+100)/3 = 100, VWAP = 100*1000/1000 = 100
        assert result[0] == pytest.approx(100.0, rel=0.01)

    def test_zero_volume(self):
        candles = make_candles(
            closes=[100, 102],
            highs=[101, 103],
            lows=[99, 101],
            volumes=[0, 1000],
        )
        result = vwap(candles)
        assert math.isnan(result[0])
        assert not math.isnan(result[1])


class TestADX:
    def test_basic(self):
        # Need at least period*2+1 = 29 candles
        candles = make_candles([100 + i * 0.5 for i in range(35)])
        result = adx(candles, period=14)
        assert len(result) == 35
        assert math.isnan(result[0])
        # ADX should be valid after period*2
        assert not math.isnan(result[-1])

    def test_insufficient_data(self):
        candles = make_candles([100, 102, 101, 103, 102])
        result = adx(candles, period=14)
        assert all(math.isnan(v) for v in result)

    def test_trending_market_high_adx(self):
        # Strong uptrend: consistently higher highs
        candles = make_candles(
            closes=[100 + i * 2 for i in range(35)],
            highs=[101 + i * 2 for i in range(35)],
            lows=[99 + i * 2 for i in range(35)],
        )
        result = adx(candles, period=14)
        # ADX should be relatively high in a strong trend
        assert result[-1] > 20
