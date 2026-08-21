"""Tests for Random Matrix Theory (RMT) model."""
import math

import pytest

from src.research.rmt import (
    RMTResult,
    _correlation_matrix,
    clean_correlation,
    jacobi_eig,
    mp_bounds,
    mp_density,
    rmt_analysis,
    rmt_signal,
)


def _returns(n=100, seed=42):
    """Synthetic return series."""
    import random as _random

    rng = _random.Random(seed)
    return [rng.gauss(0, 0.01) for _ in range(n)]


def _returns_list(n_assets=5, n=100):
    """Multiple return series with a common factor."""
    import random as _random

    rng = _random.Random(42)
    factor = [rng.gauss(0, 0.01) for _ in range(n)]
    series = []
    for _ in range(n_assets):
        series.append([factor[i] * 0.5 + rng.gauss(0, 0.01) * 0.5 for i in range(n)])
    return series


class TestJacobiEig:
    def test_diagonal_matrix(self):
        a = [[2.0, 0.0], [0.0, 3.0]]
        result = jacobi_eig(a)
        assert sorted(result["eigenvalues"]) == pytest.approx([2.0, 3.0])

    def test_symmetric_matrix(self):
        a = [[2.0, 1.0], [1.0, 2.0]]
        result = jacobi_eig(a)
        assert sorted(result["eigenvalues"]) == pytest.approx([1.0, 3.0])


class TestMP:
    def test_bounds_positive(self):
        bounds = mp_bounds(2.0)
        assert bounds["lambda_min"] > 0
        assert bounds["lambda_max"] > bounds["lambda_min"]

    def test_bounds_q_one(self):
        bounds = mp_bounds(1.0)
        assert bounds["lambda_min"] == pytest.approx(0.0)
        assert bounds["lambda_max"] == pytest.approx(4.0)

    def test_density_zero_outside_bounds(self):
        bounds = mp_bounds(2.0)
        assert mp_density(bounds["lambda_min"] - 0.5, 2.0) == 0.0
        assert mp_density(bounds["lambda_max"] + 0.5, 2.0) == 0.0

    def test_density_positive_inside(self):
        bounds = mp_bounds(2.0)
        mid = (bounds["lambda_min"] + bounds["lambda_max"]) / 2
        assert mp_density(mid, 2.0) > 0


class TestCorrelationMatrix:
    def test_diagonal_one(self):
        corr = _correlation_matrix(_returns_list(4, 100))
        assert all(corr[i][i] == pytest.approx(1.0) for i in range(4))

    def test_symmetric(self):
        corr = _correlation_matrix(_returns_list(4, 100))
        for i in range(4):
            for j in range(4):
                assert corr[i][j] == pytest.approx(corr[j][i])

    def test_bounded(self):
        corr = _correlation_matrix(_returns_list(4, 100))
        assert all(-1 <= v <= 1 for row in corr for v in row)


class TestCleanCorrelation:
    def test_cleaned_diagonal_one(self):
        corr = _correlation_matrix(_returns_list(5, 200))
        eig = jacobi_eig(corr)
        result = clean_correlation(eig["eigenvalues"], eig["eigenvectors"], q=200 / 5)
        assert all(result["Cclean"][i][i] == pytest.approx(1.0, abs=1e-6) for i in range(5))

    def test_noise_count_positive(self):
        corr = _correlation_matrix(_returns_list(5, 200))
        eig = jacobi_eig(corr)
        result = clean_correlation(eig["eigenvalues"], eig["eigenvectors"], q=200 / 5)
        assert result["noise_count"] >= 0
        assert result["signal_count"] + result["noise_count"] == 5

    def test_cleaned_eigs_length(self):
        corr = _correlation_matrix(_returns_list(5, 200))
        eig = jacobi_eig(corr)
        result = clean_correlation(eig["eigenvalues"], eig["eigenvectors"], q=200 / 5)
        assert len(result["cleaned"]) == 5


class TestRMTSignal:
    def test_strong_signal(self):
        signal, reason = rmt_signal([3.0], 1.0)
        assert signal == "STRONG_SIGNAL"

    def test_weak_signal(self):
        signal, reason = rmt_signal([1.5], 1.0)
        assert signal == "WEAK_SIGNAL"

    def test_pure_noise(self):
        signal, reason = rmt_signal([], 1.0)
        assert signal == "PURE_NOISE"

    def test_boundary_strong(self):
        signal, reason = rmt_signal([2.0], 1.0)
        assert signal == "WEAK_SIGNAL"


class TestRMTAnalysis:
    def test_basic_analysis(self):
        result = rmt_analysis(_returns_list(5, 200))
        assert isinstance(result, RMTResult)
        assert result.n == 5
        assert result.t == 200

    def test_insufficient_series_returns_none(self):
        assert rmt_analysis(_returns_list(2, 100)) is None

    def test_empty_returns_none(self):
        assert rmt_analysis([]) is None

    def test_q_positive(self):
        result = rmt_analysis(_returns_list(5, 200))
        assert result.q == pytest.approx(40.0)

    def test_eigenvalues_sorted_desc(self):
        result = rmt_analysis(_returns_list(5, 200))
        assert result.eigenvalues == sorted(result.eigenvalues, reverse=True)

    def test_signal_in_set(self):
        result = rmt_analysis(_returns_list(5, 200))
        assert result.signal in {"STRONG_SIGNAL", "WEAK_SIGNAL", "PURE_NOISE"}

    def test_market_mode_length(self):
        result = rmt_analysis(_returns_list(5, 200))
        assert len(result.market_mode) == 5

    def test_mp_curve_non_empty(self):
        result = rmt_analysis(_returns_list(5, 200))
        assert len(result.mp_curve) > 0

    def test_cleaned_corr_shape(self):
        result = rmt_analysis(_returns_list(5, 200))
        assert len(result.cleaned_corr) == 5
        assert all(len(row) == 5 for row in result.cleaned_corr)

    def test_symbols_default(self):
        result = rmt_analysis(_returns_list(5, 200))
        assert result.symbols == ["asset_0", "asset_1", "asset_2", "asset_3", "asset_4"]

    def test_custom_symbols(self):
        result = rmt_analysis(_returns_list(5, 200), symbols=["A", "B", "C", "D", "E"])
        assert result.symbols == ["A", "B", "C", "D", "E"]

    def test_signal_eigs_positive(self):
        result = rmt_analysis(_returns_list(5, 200))
        assert all(e > 0 for e in result.signal_eigs)

    def test_cleaned_eigs_finite(self):
        result = rmt_analysis(_returns_list(5, 200))
        assert all(math.isfinite(v) for v in result.cleaned_eigs)
