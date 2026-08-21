"""Tests for Free Energy Principle model."""
import math

import pytest

from src.research.free_energy import (
    FeResult,
    compute_free_energy,
    compute_returns,
    expected_free_energy,
    fe_analysis,
    generate_policies,
    log_gaussian,
    update_beliefs,
)


def _prices(n=80):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


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


class TestLogGaussian:
    def test_peak_at_mean(self):
        assert log_gaussian(0.0, 0.0, 1.0) == pytest.approx(-0.5 * math.log(2 * math.pi))

    def test_decreases_with_distance(self):
        assert log_gaussian(1.0, 0.0, 1.0) < log_gaussian(0.0, 0.0, 1.0)

    def test_zero_variance_neg_inf(self):
        assert log_gaussian(0.0, 0.0, 0.0) == -float("inf")

    def test_negative_variance_neg_inf(self):
        assert log_gaussian(0.0, 0.0, -1.0) == -float("inf")


class TestComputeFreeEnergy:
    def test_zero_error_only_complexity(self):
        f = compute_free_energy([0.5, 0.5], [0.5, 0.5], [1.0, 1.0])
        expected = 2 * 0.5 * math.log(2 * math.pi)
        assert f == pytest.approx(expected)

    def test_increases_with_error(self):
        f0 = compute_free_energy([0.0, 0.0], [0.0, 0.0], [1.0, 1.0])
        f1 = compute_free_energy([1.0, 0.0], [0.0, 0.0], [1.0, 1.0])
        assert f1 > f0

    def test_positive(self):
        f = compute_free_energy([0.1, -0.1], [0.0, 0.0], [0.01, 0.01])
        assert f > 0

    def test_precision_weighting(self):
        # Lower precision (higher variance) → smaller error contribution
        f_low = compute_free_energy([0.1], [0.0], [1.0])
        f_high = compute_free_energy([0.1], [0.0], [0.01])
        assert f_high > f_low


class TestUpdateBeliefs:
    def test_converges_to_observations(self):
        observations = [0.01, -0.005, 0.0, 0.005]
        result = update_beliefs(observations, [0.0] * 4, [1.0] * 4, lr=0.1, max_iter=200)
        assert result["mu"] == pytest.approx(observations, abs=1e-3)

    def test_free_energy_decreases(self):
        observations = [0.01, -0.005, 0.0, 0.005]
        result = update_beliefs(observations, [0.0] * 4, [1.0] * 4, lr=0.1, max_iter=100)
        first_f = result["history"][0]["F"]
        last_f = result["history"][-1]["F"]
        assert last_f < first_f

    def test_history_length(self):
        observations = [0.01, -0.005, 0.0, 0.005]
        result = update_beliefs(observations, [0.0] * 4, [1.0] * 4, lr=0.1, max_iter=50)
        assert len(result["history"]) == 50

    def test_default_precision_converges(self):
        # Defaults (precision=0.01, lr=0.1) would diverge without the clamp
        observations = [0.01, -0.005, 0.0, 0.005]
        result = update_beliefs(observations, [0.0] * 4, [0.01] * 4, lr=0.1, max_iter=200)
        assert result["mu"] == pytest.approx(observations, abs=1e-3)

    def test_deterministic(self):
        observations = [0.01, -0.005, 0.0, 0.005]
        r1 = update_beliefs(observations, [0.0] * 4, [1.0] * 4, lr=0.1, max_iter=50)
        r2 = update_beliefs(observations, [0.0] * 4, [1.0] * 4, lr=0.1, max_iter=50)
        assert r1["mu"] == r2["mu"]

    def test_zero_observations_stay_zero(self):
        result = update_beliefs([0.0, 0.0], [0.0, 0.0], [1.0, 1.0], lr=0.1, max_iter=50)
        assert result["mu"] == pytest.approx([0.0, 0.0])


class TestExpectedFreeEnergy:
    def test_positive(self):
        g = expected_free_energy([0.0], [0.0], [0.0], [1.0])
        assert g > 0

    def test_increases_with_risk(self):
        g0 = expected_free_energy([0.0], [0.0], [0.0], [1.0])
        g1 = expected_free_energy([0.0], [0.1], [0.0], [1.0])
        assert g1 > g0

    def test_ambiguity_constant(self):
        g1 = expected_free_energy([0.0], [0.0], [0.0], [1.0])
        g2 = expected_free_energy([0.0], [0.0], [0.0], [2.0])
        assert g2 > g1


class TestGeneratePolicies:
    def test_count(self):
        policies = generate_policies(3, 3, 2)
        assert len(policies) == 9

    def test_horizon_limited_to_three(self):
        policies = generate_policies(3, 3, 5)
        assert len(policies) == 27

    def test_single_step(self):
        policies = generate_policies(3, 3, 1)
        assert len(policies) == 3

    def test_actions_in_range(self):
        policies = generate_policies(3, 3, 2)
        assert all(0 <= a <= 2 for p in policies for a in p)


class TestFeAnalysis:
    def test_basic_analysis(self):
        result = fe_analysis(_prices(80))
        assert isinstance(result, FeResult)

    def test_insufficient_prices_returns_none(self):
        assert fe_analysis(_prices(10)) is None

    def test_empty_returns_none(self):
        assert fe_analysis([]) is None

    def test_signal_in_set(self):
        result = fe_analysis(_prices(80))
        assert result.signal in {"HOLD", "BUY", "SELL"}

    def test_observations_length(self):
        result = fe_analysis(_prices(80))
        assert len(result.observations) == 10

    def test_mu_length(self):
        result = fe_analysis(_prices(80))
        assert len(result.mu) == 10

    def test_beliefs_converge_to_observations(self):
        result = fe_analysis(_prices(80))
        assert result.mu == pytest.approx(result.observations, abs=1e-3)

    def test_current_f_finite(self):
        result = fe_analysis(_prices(80))
        assert math.isfinite(result.current_f)

    def test_policies_length(self):
        result = fe_analysis(_prices(80))
        assert len(result.policies) == 3

    def test_policies_sorted_by_g(self):
        result = fe_analysis(_prices(80))
        gs = [p["G"] for p in result.policies]
        assert gs == sorted(gs)

    def test_best_policy_min_g(self):
        result = fe_analysis(_prices(80))
        assert result.best_policy["G"] == min(p["G"] for p in result.policies)

    def test_fe_history_length(self):
        result = fe_analysis(_prices(80))
        assert len(result.fe_history) == 100

    def test_fe_history_decreasing(self):
        result = fe_analysis(_prices(80))
        assert result.fe_history[-1] < result.fe_history[0]

    def test_prediction_errors_length(self):
        result = fe_analysis(_prices(80))
        assert len(result.prediction_errors) == 10

    def test_prediction_errors_small(self):
        result = fe_analysis(_prices(80))
        assert all(abs(e) < 1e-3 for e in result.prediction_errors)

    def test_belief_history_length(self):
        result = fe_analysis(_prices(80))
        assert len(result.belief_history) == 10

    def test_custom_params(self):
        result = fe_analysis(_prices(80), precision=1.0, lr=0.05, lookback=40)
        assert result.mu == pytest.approx(result.observations, abs=1e-3)

    def test_returns_length(self):
        result = fe_analysis(_prices(80))
        assert len(result.returns) == 49
