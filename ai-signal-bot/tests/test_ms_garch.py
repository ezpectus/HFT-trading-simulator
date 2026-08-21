"""Tests for Markov-Switching GARCH (MS-GARCH) model."""
import math

import pytest

from src.technical_analysis.ms_garch import (
    MSRegime,
    MSResult,
    detect_regime_transitions,
    estimate_params,
    expected_regime_duration,
    fit_ms_garch,
    garch_filter,
    gaussian_log_pdf,
    ms_garch_filter,
    ms_garch_volatility,
    regime_signal,
    simple_returns,
)

CALM = MSRegime(0.001, 0.0001, 0.05, 0.9, 0.0001, "Calm")
VOLATILE = MSRegime(0.001, 0.001, 0.15, 0.8, 0.001, "Volatile")
TRANSITION = [[0.95, 0.05], [0.05, 0.95]]


def _returns(n=100, std=0.01):
    """Synthetic returns with a volatility cluster in the middle."""
    return [(i % 7 - 3) * std for i in range(n)]


class TestGARCHFilter:
    def test_basic_filter(self):
        h = garch_filter([0.01, -0.02, 0.03], 0.0001, 0.1, 0.8, 0.0002)
        assert len(h) == 3
        assert h[0] == pytest.approx(0.0002)

    def test_variance_floor(self):
        h = garch_filter([0.0, 0.0, 0.0], 0.0, 0.0, 0.0, 1e-20)
        assert h[0] == pytest.approx(1e-20)
        assert all(v >= 1e-10 for v in h[1:])

    def test_h0_fallback_to_first_return_squared(self):
        h = garch_filter([0.02, 0.0], 0.0001, 0.1, 0.8, 0.0)
        assert h[0] == pytest.approx(0.02 * 0.02)

    def test_positive_variance(self):
        h = garch_filter(_returns(), 0.0001, 0.1, 0.8, 0.0001)
        assert all(v > 0 for v in h)


class TestGaussianLogPdf:
    def test_basic_pdf(self):
        value = gaussian_log_pdf(0.0, 0.0, 1.0)
        assert value == pytest.approx(-0.5 * math.log(2 * math.pi))

    def test_zero_variance_returns_neg_inf(self):
        assert gaussian_log_pdf(0.0, 0.0, 0.0) == -math.inf

    def test_negative_variance_returns_neg_inf(self):
        assert gaussian_log_pdf(0.0, 0.0, -1.0) == -math.inf

    def test_peak_at_mean(self):
        assert gaussian_log_pdf(0.0, 0.0, 1.0) > gaussian_log_pdf(3.0, 0.0, 1.0)


class TestMSGarchFilter:
    def test_returns_result(self):
        result = ms_garch_filter(_returns(), TRANSITION, [CALM, VOLATILE])
        assert isinstance(result, MSResult)

    def test_filtered_probabilities_sum_to_one(self):
        result = ms_garch_filter(_returns(), TRANSITION, [CALM, VOLATILE])
        for probs in result.filtered_prob:
            assert sum(probs) == pytest.approx(1.0, abs=1e-9)

    def test_smoothed_probabilities_sum_to_one(self):
        result = ms_garch_filter(_returns(), TRANSITION, [CALM, VOLATILE])
        for probs in result.smoothed_prob:
            assert sum(probs) == pytest.approx(1.0, abs=1e-9)

    def test_combined_vol_positive(self):
        result = ms_garch_filter(_returns(), TRANSITION, [CALM, VOLATILE])
        assert all(v > 0 for v in result.combined_vol)

    def test_current_regime_in_range(self):
        result = ms_garch_filter(_returns(), TRANSITION, [CALM, VOLATILE])
        assert 0 <= result.current_regime < 2

    def test_current_prob_in_range(self):
        result = ms_garch_filter(_returns(), TRANSITION, [CALM, VOLATILE])
        assert 0 <= result.current_prob <= 1

    def test_total_log_lik_finite(self):
        result = ms_garch_filter(_returns(), TRANSITION, [CALM, VOLATILE])
        assert math.isfinite(result.total_log_lik)

    def test_regime_labels(self):
        result = ms_garch_filter(_returns(), TRANSITION, [CALM, VOLATILE])
        assert result.regime_labels == ["Calm", "Volatile"]

    def test_regime_vols_positive(self):
        result = ms_garch_filter(_returns(), TRANSITION, [CALM, VOLATILE])
        assert len(result.regime_vols) == 2
        assert all(v > 0 for v in result.regime_vols)

    def test_expected_duration_finite(self):
        result = ms_garch_filter(_returns(), TRANSITION, [CALM, VOLATILE])
        assert math.isfinite(result.expected_duration)
        assert result.expected_duration > 1

    def test_n_matches(self):
        result = ms_garch_filter(_returns(50), TRANSITION, [CALM, VOLATILE])
        assert result.n == 50

    def test_high_volatility_regime_detected(self):
        high_vol = [0.0] * 40 + [(i % 5 - 2) * 0.05 for i in range(60)]
        result = ms_garch_filter(high_vol, TRANSITION, [CALM, VOLATILE])
        assert result.current_vol > 0


class TestEstimateParams:
    def test_insufficient_data_returns_none(self):
        assert estimate_params([0.01] * 5) is None

    def test_empty_returns_none(self):
        assert estimate_params([]) is None

    def test_unsupported_n_regimes_returns_none(self):
        assert estimate_params(_returns(), n_regimes=3) is None

    def test_returns_best_params(self):
        best = estimate_params(_returns())
        assert best is not None
        transition, regimes = best
        assert len(transition) == 2
        assert len(regimes) == 2
        assert all(isinstance(r, MSRegime) for r in regimes)


class TestFitMSGarch:
    def test_fit_returns_result(self):
        result = fit_ms_garch(_returns())
        assert isinstance(result, MSResult)

    def test_insufficient_data_returns_none(self):
        assert fit_ms_garch([0.01] * 5) is None

    def test_empty_returns_none(self):
        assert fit_ms_garch([]) is None

    def test_constant_returns_low_vol(self):
        result = fit_ms_garch([0.0] * 50)
        assert result is not None
        assert result.current_vol < 1.0


class TestSimpleReturns:
    def test_basic_simple_returns(self):
        result = simple_returns([100.0, 110.0, 121.0])
        assert result == pytest.approx([0.1, 0.1])

    def test_empty_prices(self):
        assert simple_returns([]) == []

    def test_single_price(self):
        assert simple_returns([100.0]) == []

    def test_skips_non_positive_previous_price(self):
        result = simple_returns([100.0, 110.0, 0.0, 121.0])
        assert len(result) == 2
        assert result[0] == pytest.approx(0.1)
        assert result[1] == pytest.approx(-1.0)


class TestMSGarchVolatility:
    def test_from_prices(self):
        prices = [100.0 * (1 + 0.01 * (i % 5 - 2)) for i in range(60)]
        result = ms_garch_volatility(prices)
        assert isinstance(result, MSResult)

    def test_insufficient_prices_returns_none(self):
        assert ms_garch_volatility([100.0] * 5) is None

    def test_empty_prices_returns_none(self):
        assert ms_garch_volatility([]) is None


class TestHelpers:
    def test_expected_regime_duration(self):
        assert expected_regime_duration([[0.95, 0.05], [0.05, 0.95]], 0) == pytest.approx(20.0)

    def test_expected_duration_unit_stay(self):
        assert expected_regime_duration([[1.0, 0.0], [0.0, 1.0]], 0) == math.inf

    def test_detect_regime_transitions(self):
        probs = [[0.9, 0.1], [0.9, 0.1], [0.1, 0.9], [0.1, 0.9]]
        transitions = detect_regime_transitions(probs)
        assert len(transitions) == 1
        assert transitions[0] == {"time": 2, "from": 0, "to": 1}

    def test_detect_regime_transitions_empty(self):
        assert detect_regime_transitions([]) == []

    def test_regime_signal_calm_buy(self):
        signal, reason = regime_signal(0, 0.95, ["Calm", "Volatile"])
        assert signal == "BUY"
        assert "Calm" in reason

    def test_regime_signal_volatile_sell(self):
        signal, reason = regime_signal(1, 0.9, ["Calm", "Volatile"])
        assert signal == "SELL"
        assert "Volatile" in reason
