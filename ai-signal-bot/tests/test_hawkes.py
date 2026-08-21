"""Tests for Hawkes Process (self-exciting point process) model."""
import math

import pytest

from src.technical_analysis.hawkes import (
    HawkesParams,
    HawkesResult,
    extract_events,
    fit_hawkes,
    hawkes_analysis,
    hawkes_intensity,
    hawkes_log_lik,
    hawkes_signal,
    simulate_hawkes,
)

EVENTS = [2.0, 5.0, 9.0, 14.0, 20.0, 27.0, 35.0, 44.0, 54.0, 65.0]


def _prices_with_moves(n=60):
    """Price series with significant moves (>0.3%) every few candles."""
    prices = [100.0]
    for i in range(1, n):
        if i % 4 == 0:
            prices.append(prices[-1] * 1.005)
        else:
            prices.append(prices[-1] * 1.0005)
    return prices


class TestHawkesLogLik:
    def test_basic_finite(self):
        ll = hawkes_log_lik(EVENTS, 0.1, 0.5, 1.0, 100.0)
        assert math.isfinite(ll)

    def test_non_stationary_returns_neg_inf(self):
        assert hawkes_log_lik(EVENTS, 0.1, 1.5, 1.0, 100.0) == -math.inf

    def test_alpha_equals_beta_neg_inf(self):
        assert hawkes_log_lik(EVENTS, 0.1, 1.0, 1.0, 100.0) == -math.inf

    def test_invalid_mu_neg_inf(self):
        assert hawkes_log_lik(EVENTS, 0.0, 0.5, 1.0, 100.0) == -math.inf

    def test_negative_alpha_neg_inf(self):
        assert hawkes_log_lik(EVENTS, 0.1, -0.5, 1.0, 100.0) == -math.inf

    def test_empty_events_finite(self):
        ll = hawkes_log_lik([], 0.1, 0.5, 1.0, 100.0)
        assert math.isfinite(ll)
        assert ll == pytest.approx(-0.1 * 100.0)

    def test_higher_excitation_higher_ll(self):
        ll_low = hawkes_log_lik(EVENTS, 0.1, 0.3, 2.0, 100.0)
        ll_high = hawkes_log_lik(EVENTS, 0.1, 0.6, 2.0, 100.0)
        assert ll_high > ll_low


class TestFitHawkes:
    def test_returns_params(self):
        params = fit_hawkes(EVENTS, 100.0)
        assert isinstance(params, HawkesParams)
        assert params.mu > 0
        assert params.alpha >= 0
        assert params.beta > 0

    def test_stationary_branching(self):
        params = fit_hawkes(EVENTS, 100.0)
        assert params.branching_ratio < 1.0

    def test_log_lik_finite(self):
        params = fit_hawkes(EVENTS, 100.0)
        assert math.isfinite(params.log_lik)

    def test_better_than_baseline(self):
        params = fit_hawkes(EVENTS, 100.0)
        baseline = hawkes_log_lik(EVENTS, 0.1, 0.5, 1.0, 100.0)
        assert params.log_lik >= baseline


class TestHawkesIntensity:
    def test_baseline_at_zero(self):
        assert hawkes_intensity(0.0, EVENTS, 0.1, 0.5, 1.0) == pytest.approx(0.1)

    def test_increases_after_event(self):
        before = hawkes_intensity(2.0, [2.0], 0.1, 0.5, 1.0)
        after = hawkes_intensity(2.1, [2.0], 0.1, 0.5, 1.0)
        assert after > before

    def test_decays_with_time(self):
        near = hawkes_intensity(3.0, [2.0], 0.1, 0.5, 1.0)
        far = hawkes_intensity(8.0, [2.0], 0.1, 0.5, 1.0)
        assert far < near

    def test_never_below_baseline(self):
        intensity = hawkes_intensity(50.0, EVENTS, 0.1, 0.5, 1.0)
        assert intensity >= 0.1


class TestSimulateHawkes:
    def test_deterministic_with_seed(self):
        a = simulate_hawkes(0.1, 0.5, 1.0, 100.0, seed=42)
        b = simulate_hawkes(0.1, 0.5, 1.0, 100.0, seed=42)
        assert a == b

    def test_events_within_bounds(self):
        events = simulate_hawkes(0.1, 0.5, 1.0, 100.0, seed=42)
        assert all(0 <= e <= 100.0 for e in events)

    def test_max_events_respected(self):
        events = simulate_hawkes(0.5, 1.0, 2.0, 1000.0, max_events=50, seed=42)
        assert len(events) <= 50

    def test_high_excitation_more_events(self):
        low = simulate_hawkes(0.05, 0.1, 2.0, 100.0, seed=1)
        high = simulate_hawkes(0.5, 0.9, 1.0, 100.0, seed=1)
        assert len(high) >= len(low)

    def test_zero_mu_no_events(self):
        events = simulate_hawkes(0.0, 0.5, 1.0, 100.0, seed=42)
        assert events == []


class TestExtractEvents:
    def test_basic_extraction(self):
        events = extract_events(_prices_with_moves(60))
        assert len(events) >= 5

    def test_threshold_filters(self):
        small = [100.0 * (1 + 0.0001) ** i for i in range(50)]
        assert extract_events(small, threshold=0.003) == []

    def test_flat_prices_no_events(self):
        assert extract_events([100.0] * 50) == []

    def test_events_are_indices(self):
        events = extract_events(_prices_with_moves(60))
        assert all(0 < e < 60 for e in events)


class TestHawkesAnalysis:
    def test_basic_analysis(self):
        result = hawkes_analysis(_prices_with_moves(60), seed=42)
        assert isinstance(result, HawkesResult)
        assert result.n_events >= 5

    def test_insufficient_prices_returns_none(self):
        assert hawkes_analysis([100.0] * 20) is None

    def test_empty_returns_none(self):
        assert hawkes_analysis([]) is None

    def test_too_few_events_returns_none(self):
        assert hawkes_analysis([100.0 * (1 + 0.0001) ** i for i in range(50)]) is None

    def test_manual_params(self):
        result = hawkes_analysis(_prices_with_moves(60), auto_fit=False, mu=0.1, alpha=0.5, beta=2.0, seed=42)
        assert result.params.mu == pytest.approx(0.1)
        assert result.params.alpha == pytest.approx(0.5)
        assert result.params.beta == pytest.approx(2.0)

    def test_intensity_path(self):
        result = hawkes_analysis(_prices_with_moves(60), seed=42)
        assert len(result.intensity_path) > 0
        assert all(d["intensity"] >= 0 for d in result.intensity_path)

    def test_mean_inter_arrivals(self):
        result = hawkes_analysis(_prices_with_moves(60), seed=42)
        assert result.mean_ia > 0

    def test_signal_in_set(self):
        result = hawkes_analysis(_prices_with_moves(60), seed=42)
        assert result.signal in {"TREND", "MOMENTUM", "MEAN_REVERT"}

    def test_intensity_ratio_positive(self):
        result = hawkes_analysis(_prices_with_moves(60), seed=42)
        assert result.intensity_ratio > 0


class TestHawkesSignal:
    def test_trend(self):
        signal, reason = hawkes_signal(0.8)
        assert signal == "TREND"

    def test_momentum(self):
        signal, reason = hawkes_signal(0.5)
        assert signal == "MOMENTUM"

    def test_mean_revert(self):
        signal, reason = hawkes_signal(0.2)
        assert signal == "MEAN_REVERT"

    def test_boundary_high(self):
        signal, reason = hawkes_signal(0.7)
        assert signal == "MOMENTUM"

    def test_boundary_low(self):
        signal, reason = hawkes_signal(0.4)
        assert signal == "MEAN_REVERT"
