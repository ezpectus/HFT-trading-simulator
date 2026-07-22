"""Tests for FFT-based market cycle analysis — FFT, power spectrum, cycles, regime."""
import math

import pytest

from src.technical_analysis.fft_analysis import (
    _fft,
    _ifft,
    cycle_strength,
    dominant_cycles,
    fft_cycle_indicator,
    fft_filter,
    power_spectrum,
    spectral_trend_score,
)


class TestFFT:
    def test_single_element(self):
        result = _fft([complex(1, 0)])
        assert len(result) == 1
        assert result[0] == complex(1, 0)

    def test_dc_signal(self):
        # Constant signal → all energy in DC bin
        n = 8
        signal = [complex(1, 0)] * n
        result = _fft(signal)
        assert len(result) == n
        # DC bin should be N (sum of all values)
        assert abs(result[0]) == pytest.approx(n, rel=1e-6)
        # All other bins should be ~0
        for i in range(1, n):
            assert abs(result[i]) < 1e-6

    def test_power_of_2_input(self):
        signal = [complex(i, 0) for i in range(8)]
        result = _fft(signal)
        assert len(result) == 8

    def test_non_power_of_2_padded(self):
        signal = [complex(i, 0) for i in range(5)]
        result = _fft(signal)
        # Should pad to 8
        assert len(result) == 8

    def test_ifft_recovers_original(self):
        signal = [complex(i, 0) for i in range(8)]
        transformed = _fft(signal)
        recovered = _ifft(transformed)
        for i in range(8):
            assert abs(recovered[i].real - i) < 1e-6
            assert abs(recovered[i].imag) < 1e-6


class TestPowerSpectrum:
    def test_basic(self):
        closes = [100 + i for i in range(64)]
        freqs, power = power_spectrum(closes)
        assert len(freqs) > 0
        assert len(freqs) == len(power)
        # Power should be normalized (sum ≈ 1)
        assert sum(power) == pytest.approx(1.0, rel=1e-3)

    def test_too_short(self):
        freqs, power = power_spectrum([1, 2])
        assert freqs == []
        assert power == []

    def test_constant_prices(self):
        freqs, power = power_spectrum([100] * 64)
        # Constant signal → all power in DC (freq=0)
        assert power[0] > 0.9  # Most power in DC bin


class TestDominantCycles:
    def test_finds_cycles(self):
        # Create a signal with a known 16-bar cycle
        n = 128
        closes = [100 + 10 * math.sin(2 * math.pi * i / 16) for i in range(n)]
        cycles = dominant_cycles(closes, top_n=3)
        assert len(cycles) > 0
        # Should find a cycle near period 16
        periods = [c[0] for c in cycles]
        assert any(10 < p < 25 for p in periods)

    def test_empty_input(self):
        cycles = dominant_cycles([], top_n=3)
        assert cycles == []

    def test_short_input(self):
        cycles = dominant_cycles([1, 2, 3], top_n=3)
        assert cycles == []

    def test_top_n_limit(self):
        closes = [100 + i * 0.1 for i in range(128)]
        cycles = dominant_cycles(closes, top_n=2)
        assert len(cycles) <= 2


class TestCycleStrength:
    def test_range_market_high_strength(self):
        # Strong cyclical signal
        n = 128
        closes = [100 + 10 * math.sin(2 * math.pi * i / 16) for i in range(n)]
        strength = cycle_strength(closes)
        assert strength > 0.3  # Should have meaningful cyclical strength

    def test_trend_market_low_strength(self):
        # Strong trend — less cyclical
        closes = [100 + i * 2 for i in range(128)]
        strength = cycle_strength(closes)
        # Trend-dominated → lower cycle strength
        assert strength < 0.8

    def test_empty_input(self):
        strength = cycle_strength([])
        assert strength == 0.0

    def test_range_0_to_1(self):
        closes = [100 + i for i in range(64)]
        strength = cycle_strength(closes)
        assert 0.0 <= strength <= 1.0


class TestSpectralTrendScore:
    def test_trending_market_positive(self):
        # Strong uptrend
        closes = [100 + i * 3 for i in range(128)]
        score = spectral_trend_score(closes)
        assert score > 0  # Should be positive (trending)

    def test_range_market_negative(self):
        # Oscillating signal — high frequency dominant
        n = 128
        closes = [100 + 5 * math.sin(2 * math.pi * i / 4) for i in range(n)]
        score = spectral_trend_score(closes)
        assert score < 0  # Should be negative (ranging)

    def test_empty_input(self):
        score = spectral_trend_score([])
        assert score == 0.0

    def test_range_neg1_to_pos1(self):
        closes = [100 + i for i in range(64)]
        score = spectral_trend_score(closes)
        assert -1.0 <= score <= 1.0


class TestFFTFilter:
    def test_smooths_signal(self):
        # Noisy signal
        closes = [100 + i + (1 if i % 2 == 0 else -1) for i in range(64)]
        smoothed = fft_filter(closes, keep_ratio=0.1)
        assert len(smoothed) == len(closes)
        # Smoothed should have less variance than original
        orig_var = sum((c - sum(closes)/len(closes))**2 for c in closes) / len(closes)
        smooth_var = sum((s - sum(smoothed)/len(smoothed))**2 for s in smoothed) / len(smoothed)
        assert smooth_var < orig_var

    def test_short_input_returns_copy(self):
        closes = [1, 2, 3]
        smoothed = fft_filter(closes, keep_ratio=0.2)
        assert smoothed == closes

    def test_preserves_length(self):
        closes = [100 + i for i in range(50)]
        smoothed = fft_filter(closes, keep_ratio=0.15)
        assert len(smoothed) == 50

    def test_preserves_mean(self):
        closes = [100 + i for i in range(64)]
        smoothed = fft_filter(closes, keep_ratio=0.2)
        orig_mean = sum(closes) / len(closes)
        smooth_mean = sum(smoothed) / len(smoothed)
        assert smooth_mean == pytest.approx(orig_mean, rel=1e-3)


class TestFFTCycleIndicator:
    def test_returns_all_fields(self):
        closes = [100 + i for i in range(128)]
        result = fft_cycle_indicator(closes)
        assert "dominant_cycles" in result
        assert "cycle_strength" in result
        assert "trend_score" in result
        assert "smoothed_price" in result
        assert "regime" in result
        assert "top_cycle_period" in result

    def test_regime_is_valid(self):
        closes = [100 + i * 2 for i in range(128)]
        result = fft_cycle_indicator(closes)
        assert result["regime"] in ("TRENDING", "RANGING", "MIXED")

    def test_trending_regime(self):
        # Strong uptrend
        closes = [100 + i * 5 for i in range(128)]
        result = fft_cycle_indicator(closes)
        assert result["regime"] == "TRENDING"

    def test_smoothed_price_length(self):
        closes = [100 + i for i in range(64)]
        result = fft_cycle_indicator(closes)
        assert len(result["smoothed_price"]) == 64

    def test_cycle_strength_in_range(self):
        closes = [100 + i for i in range(128)]
        result = fft_cycle_indicator(closes)
        assert 0.0 <= result["cycle_strength"] <= 1.0

    def test_trend_score_in_range(self):
        closes = [100 + i for i in range(128)]
        result = fft_cycle_indicator(closes)
        assert -1.0 <= result["trend_score"] <= 1.0
