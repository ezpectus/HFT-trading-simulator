"""Tests for Hahn Decomposition model."""
import math

import pytest

from src.research.hahn import (
    HahnResult,
    compute_returns,
    hahn_analysis,
    hahn_decomposition,
    hahn_signal,
    rolling_decomposition,
)


def _prices(n=200):
    """Synthetic price series (periodic cycle, symmetric)."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


def _positive_returns(n=100):
    """Mostly positive returns."""
    return [0.01 + 0.001 * (i % 3) for i in range(n)]


class TestComputeReturns:
    def test_basic(self):
        returns = compute_returns([100.0, 110.0, 121.0])
        assert returns == pytest.approx([0.1, 0.1])

    def test_single_pair(self):
        returns = compute_returns([100.0, 105.0])
        assert returns == pytest.approx([0.05])

    def test_negative_returns(self):
        returns = compute_returns([100.0, 90.0])
        assert returns == pytest.approx([-0.1])


class TestHahnDecomposition:
    def test_bins_length(self):
        result = hahn_decomposition(_positive_returns(), 30)
        assert len(result["bins"]) == 30

    def test_signed_measure_formula(self):
        result = hahn_decomposition([0.1, 0.2], 2)
        # mid·freq for each bin
        assert result["bins"][0]["signed_measure"] == pytest.approx(result["bins"][0]["mid"] * result["bins"][0]["freq"])

    def test_positive_negative_split(self):
        result = hahn_decomposition(_positive_returns(), 30)
        assert len(result["positive_bins"]) > 0
        assert len(result["negative_bins"]) >= 0

    def test_mu_plus_non_negative(self):
        result = hahn_decomposition(_positive_returns(), 30)
        assert result["mu_plus"] >= 0

    def test_mu_minus_non_negative(self):
        result = hahn_decomposition(_positive_returns(), 30)
        assert result["mu_minus"] >= 0

    def test_total_variation_sum(self):
        result = hahn_decomposition(_positive_returns(), 30)
        assert result["total_variation"] == pytest.approx(result["mu_plus"] + result["mu_minus"])

    def test_snr_positive(self):
        result = hahn_decomposition(_positive_returns(), 30)
        assert result["snr"] > 0

    def test_positive_returns_high_snr(self):
        result = hahn_decomposition(_positive_returns(), 30)
        assert result["mu_plus"] > result["mu_minus"]

    def test_symmetric_returns_snr_approx_one(self):
        result = hahn_decomposition([0.01, -0.01] * 50, 30)
        assert result["snr"] == pytest.approx(1.0, abs=0.3)

    def test_cumulative_length(self):
        result = hahn_decomposition(_positive_returns(), 30)
        assert len(result["cumulative"]) == 30

    def test_cumulative_monotonic(self):
        result = hahn_decomposition(_positive_returns(), 30)
        cum = [c["cum_mu"] for c in result["cumulative"]]
        assert cum == sorted(cum)

    def test_freq_sum_one(self):
        result = hahn_decomposition(_positive_returns(), 30)
        assert sum(b["freq"] for b in result["bins"]) == pytest.approx(1.0)

    def test_threshold_effect(self):
        r1 = hahn_decomposition(_positive_returns(), 30, threshold=0.0)
        r2 = hahn_decomposition(_positive_returns(), 30, threshold=0.001)
        assert len(r2["positive_bins"]) <= len(r1["positive_bins"])


class TestRollingDecomposition:
    def test_non_empty(self):
        result = rolling_decomposition(_positive_returns(100))
        assert len(result) > 0

    def test_mu_plus_non_negative(self):
        result = rolling_decomposition(_positive_returns(100))
        assert all(d["mu_plus"] >= 0 for d in result)

    def test_mu_minus_non_negative(self):
        result = rolling_decomposition(_positive_returns(100))
        assert all(d["mu_minus"] >= 0 for d in result)

    def test_snr_positive(self):
        result = rolling_decomposition(_positive_returns(100))
        assert all(d["snr"] > 0 for d in result)

    def test_total_var_sum(self):
        result = rolling_decomposition(_positive_returns(100))
        for d in result:
            assert d["total_var"] == pytest.approx(d["mu_plus"] + d["mu_minus"])

    def test_bias_is_window_mean(self):
        returns = _positive_returns(100)
        result = rolling_decomposition(returns)
        window = returns[result[0]["idx"] : result[0]["idx"] + 30]
        assert result[0]["bias"] == pytest.approx(sum(window) / 30)

    def test_step(self):
        result = rolling_decomposition(_positive_returns(100))
        assert result[1]["idx"] - result[0]["idx"] == 7


class TestHahnSignal:
    def test_strong_long(self):
        signal, reason = hahn_signal(3.0, 0.001)
        assert signal == "STRONG_SIGNAL_LONG"

    def test_strong_short(self):
        signal, reason = hahn_signal(3.0, -0.001)
        assert signal == "STRONG_SIGNAL_SHORT"

    def test_weak(self):
        signal, reason = hahn_signal(1.5, 0.001)
        assert signal == "WEAK_SIGNAL"

    def test_balanced(self):
        signal, reason = hahn_signal(1.0, 0.0)
        assert signal == "BALANCED"

    def test_boundary_strong(self):
        signal, reason = hahn_signal(2.0, 0.001)
        assert signal == "WEAK_SIGNAL"

    def test_boundary_weak(self):
        signal, reason = hahn_signal(1.2, 0.001)
        assert signal == "BALANCED"


class TestHahnAnalysis:
    def test_basic_analysis(self):
        result = hahn_analysis(_prices(200))
        assert isinstance(result, HahnResult)

    def test_insufficient_prices_returns_none(self):
        assert hahn_analysis(_prices(10)) is None

    def test_empty_returns_none(self):
        assert hahn_analysis([]) is None

    def test_signal_in_set(self):
        result = hahn_analysis(_prices(200))
        assert result.signal in {"STRONG_SIGNAL_LONG", "STRONG_SIGNAL_SHORT", "WEAK_SIGNAL", "BALANCED"}

    def test_symmetric_data_balanced(self):
        result = hahn_analysis(_prices(200))
        assert result.signal == "BALANCED"

    def test_bins_length(self):
        result = hahn_analysis(_prices(200))
        assert len(result.bins) == 30

    def test_mu_plus_finite(self):
        result = hahn_analysis(_prices(200))
        assert math.isfinite(result.mu_plus)

    def test_mu_minus_finite(self):
        result = hahn_analysis(_prices(200))
        assert math.isfinite(result.mu_minus)

    def test_total_variation_finite(self):
        result = hahn_analysis(_prices(200))
        assert math.isfinite(result.total_variation)

    def test_snr_finite(self):
        result = hahn_analysis(_prices(200))
        assert math.isfinite(result.snr)

    def test_cumulative_length(self):
        result = hahn_analysis(_prices(200))
        assert len(result.cumulative) == 30

    def test_rolling_non_empty(self):
        result = hahn_analysis(_prices(200))
        assert len(result.rolling_decomp) > 0

    def test_current_snr_finite(self):
        result = hahn_analysis(_prices(200))
        assert math.isfinite(result.current_snr)

    def test_current_bias_finite(self):
        result = hahn_analysis(_prices(200))
        assert math.isfinite(result.current_bias)

    def test_min_max_r(self):
        result = hahn_analysis(_prices(200))
        assert result.min_r < result.max_r

    def test_custom_bins(self):
        result = hahn_analysis(_prices(200), n_bins=20)
        assert len(result.bins) == 20

    def test_custom_threshold(self):
        result = hahn_analysis(_prices(200), threshold=0.0001)
        assert len(result.positive_bins) <= len(result.bins)

    def test_positive_returns_strong_long(self):
        prices = [100.0]
        for i in range(1, 200):
            prices.append(prices[-1] * (1 + 0.01))
        result = hahn_analysis(prices)
        assert result.signal in {"STRONG_SIGNAL_LONG", "WEAK_SIGNAL"}

    def test_deterministic(self):
        r1 = hahn_analysis(_prices(200))
        r2 = hahn_analysis(_prices(200))
        assert r1.mu_plus == pytest.approx(r2.mu_plus)
        assert r1.current_snr == pytest.approx(r2.current_snr)
