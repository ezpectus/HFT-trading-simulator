"""Tests for RKHS kernel methods model."""
import math

import pytest

from src.ml.rkhs import (
    RKHSResult,
    center_kernel,
    compute_mmd,
    jacobi_eig,
    kernel_matrix,
    kernel_ridge_regression,
    laplacian_kernel,
    predict_krr,
    rbf_kernel,
    rkhs_analysis,
    rkhs_signal,
)


def _prices(n=80):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


def _features(n=20, d=3):
    """Synthetic feature vectors."""
    return [[math.sin(i * 0.3 + j) * 0.5 for j in range(d)] for i in range(n)]


class TestKernels:
    def test_rbf_self_one(self):
        assert rbf_kernel([0.1, 0.2], [0.1, 0.2], 0.5) == pytest.approx(1.0)

    def test_rbf_decreases_with_distance(self):
        near = rbf_kernel([0.0, 0.0], [0.1, 0.0], 0.5)
        far = rbf_kernel([0.0, 0.0], [1.0, 0.0], 0.5)
        assert near > far

    def test_laplacian_self_one(self):
        assert laplacian_kernel([0.1, 0.2], [0.1, 0.2], 0.5) == pytest.approx(1.0)

    def test_laplacian_decreases_with_distance(self):
        near = laplacian_kernel([0.0, 0.0], [0.1, 0.0], 0.5)
        far = laplacian_kernel([0.0, 0.0], [1.0, 0.0], 0.5)
        assert near > far


class TestKernelMatrix:
    def test_symmetric(self):
        k = kernel_matrix(_features(10), rbf_kernel, 0.5)
        for i in range(10):
            for j in range(10):
                assert k[i][j] == pytest.approx(k[j][i])

    def test_diagonal_one_rbf(self):
        k = kernel_matrix(_features(10), rbf_kernel, 0.5)
        assert all(k[i][i] == pytest.approx(1.0) for i in range(10))

    def test_shape(self):
        k = kernel_matrix(_features(10), rbf_kernel, 0.5)
        assert len(k) == 10
        assert all(len(row) == 10 for row in k)


class TestCenterKernel:
    def test_centered_rows_sum_zero(self):
        k = kernel_matrix(_features(10), rbf_kernel, 0.5)
        kc = center_kernel(k)
        assert all(abs(sum(row)) < 1e-8 for row in kc)


class TestJacobiEig:
    def test_diagonal_matrix(self):
        a = [[2.0, 0.0], [0.0, 3.0]]
        result = jacobi_eig(a)
        assert sorted(result["eigenvalues"]) == pytest.approx([2.0, 3.0])

    def test_symmetric_matrix(self):
        a = [[2.0, 1.0], [1.0, 2.0]]
        result = jacobi_eig(a)
        assert sorted(result["eigenvalues"]) == pytest.approx([1.0, 3.0])

    def test_eigenvectors_orthonormal(self):
        a = [[2.0, 1.0], [1.0, 2.0]]
        result = jacobi_eig(a)
        v0 = result["eigenvectors"][0]
        v1 = result["eigenvectors"][1]
        assert sum(v0[i] * v1[i] for i in range(2)) == pytest.approx(0.0, abs=1e-8)


class TestMMD:
    def test_identical_distributions_zero(self):
        x = _features(10)
        mmd = compute_mmd(x, x, rbf_kernel, 0.5)
        assert mmd == pytest.approx(0.0, abs=1e-8)

    def test_different_distributions_positive(self):
        x = [[0.0, 0.0, 0.0]] * 10
        y = [[1.0, 1.0, 1.0]] * 10
        mmd = compute_mmd(x, y, rbf_kernel, 0.5)
        assert mmd > 0


class TestKRR:
    def test_linear_recovery(self):
        x = [[float(i), float(i) ** 2] for i in range(20)]
        y = [2.0 * v[0] + 1.0 for v in x]
        alpha = kernel_ridge_regression(x, y, rbf_kernel, 0.5, 0.001)
        pred = predict_krr(alpha, x, [5.0, 25.0], rbf_kernel, 0.5)
        assert pred == pytest.approx(11.0, abs=1.0)

    def test_alpha_length(self):
        x = _features(10)
        y = [1.0] * 10
        alpha = kernel_ridge_regression(x, y, rbf_kernel, 0.5, 0.01)
        assert len(alpha) == 10


class TestRKHSResult:
    def test_basic_analysis(self):
        result = rkhs_analysis(_prices(80))
        assert isinstance(result, RKHSResult)
        assert result.n_samples > 0

    def test_insufficient_prices_returns_none(self):
        assert rkhs_analysis(_prices(20)) is None

    def test_empty_returns_none(self):
        assert rkhs_analysis([]) is None

    def test_signal_in_set(self):
        result = rkhs_analysis(_prices(80))
        assert result.signal in {"BUY", "SELL", "NEUTRAL", "REGIME_SHIFT"}

    def test_mmd_non_negative(self):
        result = rkhs_analysis(_prices(80))
        assert result.mmd >= 0

    def test_r2_finite(self):
        result = rkhs_analysis(_prices(80))
        assert math.isfinite(result.r2)

    def test_mse_non_negative(self):
        result = rkhs_analysis(_prices(80))
        assert result.mse >= 0

    def test_top_eigs_count(self):
        result = rkhs_analysis(_prices(80), n_components=3)
        assert len(result.top_eigs) == 3

    def test_projections_shape(self):
        result = rkhs_analysis(_prices(80), n_components=2)
        assert all(len(p) == 2 for p in result.projections)

    def test_predictions_length(self):
        result = rkhs_analysis(_prices(80))
        assert len(result.predictions) == len(result.actual_next)

    def test_laplacian_kernel(self):
        result = rkhs_analysis(_prices(80), kernel_type="laplacian")
        assert isinstance(result, RKHSResult)

    def test_custom_sigma(self):
        result = rkhs_analysis(_prices(80), sigma=1.0)
        assert isinstance(result, RKHSResult)

    def test_current_pred_finite(self):
        result = rkhs_analysis(_prices(80))
        assert math.isfinite(result.current_pred)


class TestRKHSResultSignal:
    def test_buy(self):
        signal, reason = rkhs_signal(0.5, 0.1)
        assert signal == "BUY"

    def test_sell(self):
        signal, reason = rkhs_signal(-0.5, 0.1)
        assert signal == "SELL"

    def test_neutral(self):
        signal, reason = rkhs_signal(0.1, 0.1)
        assert signal == "NEUTRAL"

    def test_regime_shift_overrides(self):
        signal, reason = rkhs_signal(0.5, 0.5)
        assert signal == "REGIME_SHIFT"

    def test_boundary_shift(self):
        signal, reason = rkhs_signal(0.5, 0.3)
        assert signal == "BUY"
