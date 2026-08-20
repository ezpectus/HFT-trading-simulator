"""Tests for Gaussian Mixture Model implementation."""
import math

import pytest

from src.technical_analysis.gmm import (
    GMMResult,
    fit_gmm,
)


class TestGMM:
    def test_empty_data_returns_empty(self):
        result = fit_gmm([], k=2)
        assert result.means == []
        assert result.assignments == []

    def test_k_zero_returns_empty(self):
        result = fit_gmm([1.0, 2.0, 3.0], k=0)
        assert result.means == []

    def test_single_component_fits_mean(self):
        data = [1.0, 1.1, 0.9, 1.05, 0.95, 1.0, 1.02, 0.98]
        result = fit_gmm(data, k=1, seed=42)
        assert len(result.means) == 1
        assert result.means[0] == pytest.approx(1.0, abs=0.1)

    def test_two_well_separated_components(self):
        cluster_a = [-10.0, -10.1, -9.9, -10.05, -9.95]
        cluster_b = [10.0, 10.1, 9.9, 10.05, 9.95]
        data = cluster_a + cluster_b
        result = fit_gmm(data, k=2, seed=42)
        assert len(result.means) == 2
        assert result.means[0] < 0
        assert result.means[1] > 0

    def test_weights_sum_to_one(self):
        data = [1.0, 2.0, 3.0, 10.0, 11.0, 12.0, -5.0, -6.0, -7.0]
        result = fit_gmm(data, k=3, seed=42)
        assert sum(result.weights) == pytest.approx(1.0, abs=1e-6)

    def test_variances_positive(self):
        data = [1.0, 2.0, 3.0, 10.0, 11.0, 12.0]
        result = fit_gmm(data, k=2, seed=42)
        assert all(v > 0 for v in result.variances)

    def test_assignments_length_matches_data(self):
        data = [1.0, 2.0, 3.0, 10.0, 11.0, 12.0]
        result = fit_gmm(data, k=2, seed=42)
        assert len(result.assignments) == len(data)

    def test_assignments_valid_indices(self):
        data = [1.0, 2.0, 3.0, 10.0, 11.0, 12.0]
        result = fit_gmm(data, k=2, seed=42)
        assert all(0 <= a < 2 for a in result.assignments)

    def test_deterministic_with_seed(self):
        data = [1.0, 2.0, 3.0, 10.0, 11.0, 12.0, -5.0, -6.0]
        r1 = fit_gmm(data, k=3, seed=42)
        r2 = fit_gmm(data, k=3, seed=42)
        assert r1.means == r2.means
        assert r1.assignments == r2.assignments

    def test_log_likelihood_history_non_empty(self):
        data = [1.0, 2.0, 3.0, 10.0, 11.0, 12.0]
        result = fit_gmm(data, k=2, seed=42)
        assert len(result.log_likelihood_history) > 0

    def test_bic_and_aic_computed(self):
        data = [1.0, 2.0, 3.0, 10.0, 11.0, 12.0]
        result = fit_gmm(data, k=2, seed=42)
        assert isinstance(result.bic, float)
        assert isinstance(result.aic, float)
        assert math.isfinite(result.bic)
        assert math.isfinite(result.aic)

    def test_means_sorted_ascending(self):
        data = [10.0, 11.0, 12.0, -5.0, -6.0, -7.0, 0.0, 1.0, 2.0]
        result = fit_gmm(data, k=3, seed=42)
        for i in range(len(result.means) - 1):
            assert result.means[i] <= result.means[i + 1]

    def test_result_type(self):
        result = fit_gmm([1.0, 2.0, 3.0], k=1, seed=42)
        assert isinstance(result, GMMResult)

    def test_n_iter_positive(self):
        data = [1.0, 2.0, 3.0, 10.0, 11.0, 12.0]
        result = fit_gmm(data, k=2, seed=42)
        assert result.n_iter > 0
