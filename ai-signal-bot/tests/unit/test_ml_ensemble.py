"""Tests for ml_ensemble HMMRegimeDetector — HMM-style state fitting + transitions."""
import numpy as np

from src.strategies.ml_ensemble import HMMRegimeDetector


class TestHMMRegimeDetector:
    def test_init_defaults(self):
        rc = HMMRegimeDetector()
        assert rc.n_states == 3
        assert rc.states == ["calm", "trending", "volatile"]
        # Uniform prior transition matrix
        assert rc.transition_matrix.shape == (3, 3)
        assert np.allclose(rc.transition_matrix, 1.0 / 3)

    def test_update_returns_valid_state(self):
        rc = HMMRegimeDetector()
        state = rc.update(0.001)
        assert 0 <= state < rc.n_states

    def test_fit_produces_row_normalized_transitions(self):
        rc = HMMRegimeDetector()
        for r in np.random.default_rng(42).normal(0, 0.01, 150):
            rc.update(float(r))
        assert rc._fitted
        # Every transition-matrix row sums to 1 (valid stochastic matrix)
        row_sums = rc.transition_matrix.sum(axis=1)
        assert np.allclose(row_sums, 1.0)

    def test_state_means_sorted_ascending(self):
        # _fit splits sorted returns into segments → means strictly ascending
        rc = HMMRegimeDetector()
        for r in np.random.default_rng(1).normal(0, 0.01, 150):
            rc.update(float(r))
        assert rc._fitted
        assert np.all(np.diff(rc.state_means) > 0)
