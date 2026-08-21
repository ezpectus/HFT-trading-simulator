"""Tests for Hamiltonian Monte Carlo (HMC) model."""
import math

import pytest

from src.technical_analysis.hmc import (
    HMCResult,
    grad_log_posterior,
    hmc,
    hmc_analysis,
    hmc_signal,
    leapfrog,
    log_posterior,
)


def _prices(n=120):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


def _returns(n=100):
    """Synthetic return series."""
    return [(i % 7 - 3) * 0.01 for i in range(n)]


class TestLogPosterior:
    def test_valid_params_finite(self):
        assert math.isfinite(log_posterior([0.02, 0.08, 0.9], _returns()))

    def test_non_stationary_neg_inf(self):
        assert log_posterior([0.02, 0.6, 0.6], _returns()) == -math.inf

    def test_negative_omega_neg_inf(self):
        assert log_posterior([-0.02, 0.08, 0.9], _returns()) == -math.inf

    def test_zero_alpha_neg_inf(self):
        assert log_posterior([0.02, 0.0, 0.9], _returns()) == -math.inf

    def test_alpha_plus_beta_one_neg_inf(self):
        assert log_posterior([0.02, 0.1, 0.9], _returns()) == -math.inf

    def test_higher_likelihood_for_better_params(self):
        good = log_posterior([0.02, 0.08, 0.9], _returns())
        bad = log_posterior([0.5, 0.01, 0.01], _returns())
        assert good > bad


class TestGradLogPosterior:
    def test_gradient_finite(self):
        grad = grad_log_posterior([0.02, 0.08, 0.9], _returns())
        assert len(grad) == 3
        assert all(math.isfinite(g) for g in grad)

    def test_gradient_consistent_with_finite_diff(self):
        q = [0.02, 0.08, 0.9]
        grad = grad_log_posterior(q, _returns(), eps=1e-5)
        eps = 1e-5
        for i in range(3):
            q_plus = q[:]
            q_plus[i] += eps
            q_minus = q[:]
            q_minus[i] -= eps
            expected = (log_posterior(q_plus, _returns()) - log_posterior(q_minus, _returns())) / (2 * eps)
            assert grad[i] == pytest.approx(expected, rel=1e-3)


class TestLeapfrog:
    def test_preserves_length(self):
        q, p = leapfrog([0.02, 0.08, 0.9], [0.1, 0.1, 0.1], lambda x: [0.0, 0.0, 0.0], 0.01, 5, [1, 1, 1])
        assert len(q) == 3
        assert len(p) == 3

    def test_zero_gradient_position_moves(self):
        q, p = leapfrog([0.02, 0.08, 0.9], [0.1, 0.0, 0.0], lambda x: [0.0, 0.0, 0.0], 0.01, 5, [1, 1, 1])
        assert q[0] > 0.02  # position advances with momentum

    def test_energy_conservation_linear(self):
        # U(q) = q, grad = 1: H should be approximately conserved
        def grad_fn(x):
            return [1.0, 1.0, 1.0]

        q0 = [0.0, 0.0, 0.0]
        p0 = [1.0, 1.0, 1.0]
        h0 = 0.5 * sum(pi * pi for pi in p0) + sum(q0)
        q, p = leapfrog(q0, p0, grad_fn, 0.001, 100, [1, 1, 1])
        h1 = 0.5 * sum(pi * pi for pi in p) + sum(q)
        assert h1 == pytest.approx(h0, abs=0.01)


class TestHMC:
    def test_basic_sampling(self):
        result = hmc(
            [0.02, 0.08, 0.9],
            lambda q: log_posterior(q, _returns()),
            lambda q: grad_log_posterior(q, _returns()),
            50, 0.005, 20, [1, 1, 1], seed=42,
        )
        assert len(result["samples"]) == 50
        assert len(result["accept_history"]) == 50
        assert len(result["log_post_history"]) == 50

    def test_deterministic_with_seed(self):
        a = hmc([0.02, 0.08, 0.9], lambda q: log_posterior(q, _returns()),
                lambda q: grad_log_posterior(q, _returns()), 30, 0.005, 20, [1, 1, 1], seed=7)
        b = hmc([0.02, 0.08, 0.9], lambda q: log_posterior(q, _returns()),
                lambda q: grad_log_posterior(q, _returns()), 30, 0.005, 20, [1, 1, 1], seed=7)
        assert a["samples"] == b["samples"]

    def test_samples_valid_params(self):
        result = hmc([0.02, 0.08, 0.9], lambda q: log_posterior(q, _returns()),
                     lambda q: grad_log_posterior(q, _returns()), 50, 0.005, 20, [1, 1, 1], seed=42)
        for sample in result["samples"]:
            assert sample[0] > 0
            assert sample[1] > 0
            assert sample[2] > 0
            assert sample[1] + sample[2] < 1

    def test_accept_rate_in_range(self):
        result = hmc([0.02, 0.08, 0.9], lambda q: log_posterior(q, _returns()),
                     lambda q: grad_log_posterior(q, _returns()), 100, 0.005, 20, [1, 1, 1], seed=42)
        rate = sum(result["accept_history"]) / len(result["accept_history"])
        assert 0 <= rate <= 1

    def test_log_post_history_finite(self):
        result = hmc([0.02, 0.08, 0.9], lambda q: log_posterior(q, _returns()),
                     lambda q: grad_log_posterior(q, _returns()), 50, 0.005, 20, [1, 1, 1], seed=42)
        assert all(math.isfinite(v) for v in result["log_post_history"])


class TestHMCSignal:
    def test_high_persistence(self):
        signal, reason = hmc_signal(0.99)
        assert signal == "HIGH_PERSISTENCE"

    def test_low_persistence(self):
        signal, reason = hmc_signal(0.8)
        assert signal == "LOW_PERSISTENCE"

    def test_moderate(self):
        signal, reason = hmc_signal(0.95)
        assert signal == "NEUTRAL"

    def test_boundary_high(self):
        signal, reason = hmc_signal(0.98)
        assert signal == "NEUTRAL"

    def test_boundary_low(self):
        signal, reason = hmc_signal(0.9)
        assert signal == "NEUTRAL"


class TestHMCAnalysis:
    def test_basic_analysis(self):
        result = hmc_analysis(_prices(120), n_samples=200, seed=42)
        assert isinstance(result, HMCResult)
        assert result.n_post == 100

    def test_analysis_with_burnin(self):
        result = hmc_analysis(_prices(120), n_samples=200, burn_in=50, seed=42)
        assert isinstance(result, HMCResult)
        assert result.n_post == 150

    def test_insufficient_prices_returns_none(self):
        assert hmc_analysis(_prices(50)) is None

    def test_empty_returns_none(self):
        assert hmc_analysis([]) is None

    def test_post_stats_three_params(self):
        result = hmc_analysis(_prices(120), n_samples=200, burn_in=50, seed=42)
        assert len(result.post_stats) == 3
        assert [s["name"] for s in result.post_stats] == ["omega", "alpha", "beta"]

    def test_post_stats_means_finite(self):
        result = hmc_analysis(_prices(120), n_samples=200, burn_in=50, seed=42)
        assert all(math.isfinite(s["mean"]) for s in result.post_stats)
        assert all(math.isfinite(s["std"]) for s in result.post_stats)

    def test_accept_rate_in_range(self):
        result = hmc_analysis(_prices(120), n_samples=200, burn_in=50, seed=42)
        assert 0 <= result.accept_rate <= 1

    def test_persistence_finite(self):
        result = hmc_analysis(_prices(120), n_samples=200, burn_in=50, seed=42)
        assert math.isfinite(result.persistence_mean)
        assert math.isfinite(result.persistence_std)

    def test_long_run_var_positive(self):
        result = hmc_analysis(_prices(120), n_samples=200, burn_in=50, seed=42)
        assert result.long_run_var > 0

    def test_signal_in_set(self):
        result = hmc_analysis(_prices(120), n_samples=200, burn_in=50, seed=42)
        assert result.signal in {"HIGH_PERSISTENCE", "LOW_PERSISTENCE", "NEUTRAL"}

    def test_deterministic_with_seed(self):
        a = hmc_analysis(_prices(120), n_samples=150, burn_in=50, seed=7)
        b = hmc_analysis(_prices(120), n_samples=150, burn_in=50, seed=7)
        assert a.persistence_mean == b.persistence_mean
        assert a.accept_rate == b.accept_rate
