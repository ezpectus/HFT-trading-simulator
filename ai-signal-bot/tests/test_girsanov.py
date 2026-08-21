"""Tests for Girsanov Theorem model."""
import math

import pytest

from src.research.girsanov import (
    GirsanovResult,
    compute_returns,
    girsanov_analysis,
    girsanov_signal,
)


def _prices(n=150, trend=0.0):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + trend + 0.005 * (i % 5 - 2)))
    return prices


def _regime_shift_prices(n=200):
    """Price series with a drift regime shift in the middle."""
    prices = [100.0]
    for i in range(1, n):
        trend = 0.01 if i < n // 2 else -0.01
        prices.append(prices[-1] * (1 + trend + 0.005 * (i % 5 - 2)))
    return prices


class TestComputeReturns:
    def test_basic(self):
        returns = compute_returns([100.0, 110.0, 121.0])
        assert returns == pytest.approx([0.1, 0.1])


class TestGirsanovSignal:
    def test_strong_change(self):
        signal, reason = girsanov_signal(0.005)
        assert signal == "DRIFT_CHANGE_STRONG"

    def test_change(self):
        signal, reason = girsanov_signal(0.03)
        assert signal == "DRIFT_CHANGE"

    def test_stable(self):
        signal, reason = girsanov_signal(0.5)
        assert signal == "STABLE_DRIFT"

    def test_boundary_strong(self):
        signal, reason = girsanov_signal(0.01)
        assert signal == "DRIFT_CHANGE"


class TestGirsanovAnalysis:
    def test_basic_analysis(self):
        result = girsanov_analysis(_prices(150))
        assert isinstance(result, GirsanovResult)

    def test_insufficient_prices_returns_none(self):
        assert girsanov_analysis(_prices(30)) is None

    def test_empty_returns_none(self):
        assert girsanov_analysis([]) is None

    def test_signal_in_set(self):
        result = girsanov_analysis(_prices(150))
        assert result.signal in {"DRIFT_CHANGE_STRONG", "DRIFT_CHANGE", "STABLE_DRIFT"}

    def test_regime_in_set(self):
        result = girsanov_analysis(_prices(150))
        assert result.regime in {"BULLISH", "BEARISH", "NEUTRAL"}

    def test_drifts_length(self):
        result = girsanov_analysis(_prices(150), window_size=30)
        assert len(result.drifts) == 120

    def test_llr_tests_length(self):
        result = girsanov_analysis(_prices(150), window_size=30)
        assert len(result.llr_tests) == 119

    def test_cum_trajectory_length(self):
        result = girsanov_analysis(_prices(150))
        assert len(result.cum_trajectory) == result.n

    def test_p_value_in_range(self):
        result = girsanov_analysis(_prices(150))
        assert 0 < result.current_p_value <= 1

    def test_sigma_est_positive(self):
        result = girsanov_analysis(_prices(150))
        assert result.sigma_est > 0

    def test_current_drift_finite(self):
        result = girsanov_analysis(_prices(150))
        assert math.isfinite(result.current_drift)

    def test_regime_shift_detected(self):
        result = girsanov_analysis(_regime_shift_prices(200), window_size=30)
        # Strong drift change should be detected at the shift point
        assert any(t["significant"] for t in result.llr_tests)

    def test_custom_sigma(self):
        result = girsanov_analysis(_prices(150), sigma=0.02)
        assert result.sigma_est == pytest.approx(0.02)

    def test_custom_window(self):
        result = girsanov_analysis(_prices(150), window_size=20)
        assert len(result.drifts) == 130

    def test_llr_non_negative(self):
        result = girsanov_analysis(_prices(150))
        assert all(t["llr"] >= 0 for t in result.llr_tests)

    def test_drift_change_finite(self):
        result = girsanov_analysis(_prices(150))
        assert math.isfinite(result.drift_change)
