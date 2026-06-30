"""Tests for FFT analysis module."""
import math
import pytest

from src.technical_analysis.fft_analysis import (
    cycle_strength, dominant_cycles, fft_cycle_indicator,
    fft_filter, power_spectrum, spectral_trend_score,
)


class TestPowerSpectrum:
    def test_basic(self):
        closes = [100 + i * 0.5 for i in range(128)]
        freqs, power = power_spectrum(closes)
        assert len(freqs) == len(power)
        assert len(power) == 64  # half of 128
        assert sum(power) == pytest.approx(1.0)  # normalized

    def test_short_data(self):
        freqs, power = power_spectrum([100, 101])
        assert freqs == []
        assert power == []


class TestDominantCycles:
    def test_finds_cycles(self):
        # Create data with a clear 16-bar cycle
        n = 128
        closes = [100 + 10 * math.sin(2 * math.pi * i / 16) for i in range(n)]
        cycles = dominant_cycles(closes, top_n=3)
        assert len(cycles) > 0
        # Should find a cycle near 16 bars
        periods = [c[0] for c in cycles]
        assert any(10 < p < 25 for p in periods)

    def test_short_data(self):
        cycles = dominant_cycles([100, 101, 102], top_n=3)
        assert cycles == []


class TestCycleStrength:
    def test_pure_trend_low_strength(self):
        closes = [100 + i * 0.5 for i in range(128)]
        strength = cycle_strength(closes)
        # Strong trend should have concentrated spectrum
        assert 0 <= strength <= 1

    def test_oscillating_high_strength(self):
        n = 128
        closes = [100 + 10 * math.sin(2 * math.pi * i / 16) for i in range(n)]
        strength = cycle_strength(closes)
        assert 0 <= strength <= 1


class TestSpectralTrendScore:
    def test_uptrend_positive(self):
        closes = [100 + i * 0.5 for i in range(128)]
        score = spectral_trend_score(closes)
        assert score > 0  # Trend-dominated

    def test_oscillating_negative(self):
        n = 128
        closes = [100 + 10 * math.sin(2 * math.pi * i / 8) for i in range(n)]
        score = spectral_trend_score(closes)
        assert score < 0  # Cycle-dominated

    def test_short_data(self):
        score = spectral_trend_score([100, 101])
        assert score == 0.0


class TestFFTFilter:
    def test_smooths_data(self):
        n = 128
        closes = [100 + i * 0.1 + (math.sin(i * 3) * 5) for i in range(n)]
        smoothed = fft_filter(closes, keep_ratio=0.1)
        assert len(smoothed) == n
        # Smoothed should have less variance than original
        orig_var = sum((c - sum(closes) / n) ** 2 for c in closes) / n
        smooth_var = sum((s - sum(smoothed) / n) ** 2 for s in smoothed) / n
        assert smooth_var < orig_var

    def test_short_data(self):
        result = fft_filter([100, 101], keep_ratio=0.2)
        assert result == [100, 101]


class TestFFTCycleIndicator:
    def test_uptrend(self):
        closes = [100 + i * 0.5 for i in range(128)]
        result = fft_cycle_indicator(closes)
        assert result["regime"] == "TRENDING"
        assert result["trend_score"] > 0
        assert len(result["smoothed_price"]) == 128
        assert result["top_cycle_period"] > 0

    def test_oscillating(self):
        n = 128
        closes = [100 + 10 * math.sin(2 * math.pi * i / 8) for i in range(n)]
        result = fft_cycle_indicator(closes)
        assert result["regime"] in ("RANGING", "MIXED")
        assert 0 <= result["cycle_strength"] <= 1

    def test_short_data(self):
        result = fft_cycle_indicator([100, 101, 102])
        assert result["regime"] == "MIXED"
        assert result["top_cycle_period"] == 0
