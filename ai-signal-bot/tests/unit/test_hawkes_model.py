"""Tests for Hawkes process log-likelihood — stationarity guards + clustering semantics."""
import math

import pytest

from src.technical_analysis.hawkes_model import hawkes_log_lik


class TestHawkesLogLik:
    def test_non_stationary_params_rejected(self):
        # alpha >= beta → explosive branching, not stationary
        events = [1.0, 2.0, 3.0]
        assert hawkes_log_lik(events, mu=0.1, alpha=1.5, beta=1.0, t=10.0) == -math.inf
        assert hawkes_log_lik(events, mu=0.1, alpha=1.0, beta=1.0, t=10.0) == -math.inf

    def test_invalid_params_rejected(self):
        events = [1.0, 2.0, 3.0]
        assert hawkes_log_lik(events, mu=0.0, alpha=0.5, beta=1.0, t=10.0) == -math.inf
        assert hawkes_log_lik(events, mu=-0.1, alpha=0.5, beta=1.0, t=10.0) == -math.inf
        assert hawkes_log_lik(events, mu=0.1, alpha=-0.5, beta=1.0, t=10.0) == -math.inf
        assert hawkes_log_lik(events, mu=0.1, alpha=0.5, beta=0.0, t=10.0) == -math.inf

    def test_empty_events_returns_neg_integral(self):
        # No events → log_lik = -mu*t (only the compensator integral remains)
        assert hawkes_log_lik([], mu=0.5, alpha=0.3, beta=1.0, t=10.0) == pytest.approx(-5.0)

    def test_valid_params_finite(self):
        events = [1.0, 2.0, 3.0]
        ll = hawkes_log_lik(events, mu=0.1, alpha=0.5, beta=1.0, t=10.0)
        assert math.isfinite(ll)

    def test_clustered_events_more_likely_than_spread(self):
        # Self-exciting process (alpha>0): burst events fit better than uniform spacing
        clustered = hawkes_log_lik([5.0, 5.2, 5.4], mu=0.1, alpha=0.8, beta=1.0, t=10.0)
        spread = hawkes_log_lik([1.0, 5.0, 9.0], mu=0.1, alpha=0.8, beta=1.0, t=10.0)
        assert clustered > spread

    def test_zero_alpha_is_poisson(self):
        # alpha=0 → no self-excitation; spacing no longer matters for event term
        clustered = hawkes_log_lik([5.0, 5.2, 5.4], mu=0.1, alpha=0.0, beta=1.0, t=10.0)
        spread = hawkes_log_lik([1.0, 5.0, 9.0], mu=0.1, alpha=0.0, beta=1.0, t=10.0)
        # pure Poisson: likelihood depends on count+t only → identical
        assert clustered == pytest.approx(spread)
