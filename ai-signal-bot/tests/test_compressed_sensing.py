"""Tests for Compressed Sensing model."""
import math

import pytest

from src.technical_analysis.compressed_sensing import (
    CompressedSensingResult,
    _least_squares,
    _mat_t_vec,
    _mat_vec,
    compressed_sensing_analysis,
    cs_signal,
    dft_basis,
    ista,
    measurement_matrix,
    omp,
)


def _prices(n=80):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


class TestMeasurementMatrix:
    def test_shape(self):
        phi = measurement_matrix(10, 20, seed=42)
        assert len(phi) == 10
        assert all(len(row) == 20 for row in phi)

    def test_deterministic_with_seed(self):
        a = measurement_matrix(10, 20, seed=7)
        b = measurement_matrix(10, 20, seed=7)
        assert a == b

    def test_values_bounded(self):
        phi = measurement_matrix(10, 20, seed=42)
        limit = math.sqrt(2 / 10) / 2
        assert all(abs(v) <= limit + 0.01 for row in phi for v in row)


class TestMatVec:
    def test_mat_vec(self):
        a = [[1.0, 2.0], [3.0, 4.0]]
        assert _mat_vec(a, [1.0, 1.0]) == pytest.approx([3.0, 7.0])

    def test_mat_t_vec(self):
        a = [[1.0, 2.0], [3.0, 4.0]]
        assert _mat_t_vec(a, [1.0, 1.0]) == pytest.approx([4.0, 6.0])


class TestLeastSquares:
    def test_basic_solve(self):
        a = [[1.0, 0.0], [0.0, 1.0]]
        assert _least_squares(a, [3.0, 4.0]) == pytest.approx([3.0, 4.0])

    def test_overdetermined(self):
        a = [[1.0], [2.0], [3.0]]
        b = [2.0, 4.0, 6.0]
        x = _least_squares(a, b)
        assert x[0] == pytest.approx(2.0, abs=1e-6)


class TestOMP:
    def test_sparse_recovery(self):
        # Sparse signal with 3 non-zero coefficients
        n = 32
        x_true = [0.0] * n
        x_true[5] = 1.5
        x_true[12] = -1.0
        x_true[25] = 0.8
        phi = measurement_matrix(20, n, seed=42)
        y = _mat_vec(phi, x_true)
        result = omp(phi, y, sparsity=3)
        # Support should include the true indices
        assert 5 in result["support"]
        assert 12 in result["support"]
        assert 25 in result["support"]

    def test_residual_small(self):
        n = 32
        x_true = [0.0] * n
        x_true[5] = 1.5
        x_true[12] = -1.0
        phi = measurement_matrix(16, n, seed=42)
        y = _mat_vec(phi, x_true)
        result = omp(phi, y, sparsity=2)
        assert sum(r * r for r in result["residual"]) < sum(v * v for v in y)


class TestISTA:
    def test_sparse_recovery(self):
        n = 32
        x_true = [0.0] * n
        x_true[5] = 1.5
        x_true[12] = -1.0
        phi = measurement_matrix(16, n, seed=42)
        y = _mat_vec(phi, x_true)
        recovered = ista(phi, y, 0.01, max_iter=200)
        assert abs(recovered[5]) > 0.5
        assert abs(recovered[12]) > 0.5

    def test_most_coeffs_small(self):
        n = 32
        x_true = [0.0] * n
        x_true[5] = 1.5
        phi = measurement_matrix(16, n, seed=42)
        y = _mat_vec(phi, x_true)
        recovered = ista(phi, y, 0.05, max_iter=200)
        small = sum(1 for v in recovered if abs(v) < 0.1)
        assert small > n - 5


class TestDFTBasis:
    def test_shape(self):
        psi = dft_basis(16)
        assert len(psi) == 16
        assert all(len(row) == 16 for row in psi)

    def test_orthonormal(self):
        psi = dft_basis(16)
        # Row 0 dot row 0 = 1
        assert sum(psi[0][j] * psi[0][j] for j in range(16)) == pytest.approx(1.0)
        # Row 0 dot row 1 = 0
        assert sum(psi[0][j] * psi[1][j] for j in range(16)) == pytest.approx(0.0, abs=1e-10)


class TestCSSignal:
    def test_anomaly_detected(self):
        signal, reason = cs_signal(4, 20.0)
        assert signal == "ANOMALY_DETECTED"

    def test_sparse_recovered(self):
        signal, reason = cs_signal(1, 20.0)
        assert signal == "SPARSE_RECOVERED"

    def test_moderate(self):
        signal, reason = cs_signal(0, 8.0)
        assert signal == "MODERATE_RECOVERY"

    def test_poor(self):
        signal, reason = cs_signal(0, 2.0)
        assert signal == "POOR_RECOVERY"

    def test_boundary_anomaly(self):
        signal, reason = cs_signal(3, 20.0)
        assert signal == "SPARSE_RECOVERED"


class TestCompressedSensingAnalysis:
    def test_basic_analysis_omp(self):
        result = compressed_sensing_analysis(_prices(80), method="omp", seed=42)
        assert isinstance(result, CompressedSensingResult)
        assert result.n == 63

    def test_basic_analysis_ista(self):
        result = compressed_sensing_analysis(_prices(80), method="ista", seed=42)
        assert isinstance(result, CompressedSensingResult)

    def test_insufficient_prices_returns_none(self):
        assert compressed_sensing_analysis(_prices(10)) is None

    def test_empty_returns_none(self):
        assert compressed_sensing_analysis([]) is None

    def test_signal_in_set(self):
        result = compressed_sensing_analysis(_prices(80), seed=42)
        assert result.sig in {"ANOMALY_DETECTED", "SPARSE_RECOVERED", "MODERATE_RECOVERY", "POOR_RECOVERY"}

    def test_snr_finite(self):
        result = compressed_sensing_analysis(_prices(80), seed=42)
        assert math.isfinite(result.snr) or result.snr == math.inf

    def test_mse_non_negative(self):
        result = compressed_sensing_analysis(_prices(80), seed=42)
        assert result.mse >= 0

    def test_measurements_less_than_n(self):
        result = compressed_sensing_analysis(_prices(80), sample_ratio=0.5, seed=42)
        assert result.m < result.n

    def test_deterministic_with_seed(self):
        a = compressed_sensing_analysis(_prices(80), seed=7)
        b = compressed_sensing_analysis(_prices(80), seed=7)
        assert a.recovered == b.recovered
        assert a.snr == b.snr

    def test_custom_sparsity(self):
        result = compressed_sensing_analysis(_prices(80), sparsity=8, seed=42)
        assert len(result.support) <= 8

    def test_recon_signal_length(self):
        result = compressed_sensing_analysis(_prices(80), seed=42)
        assert len(result.recon_signal) == result.n

    def test_actual_sparsity_positive(self):
        result = compressed_sensing_analysis(_prices(80), seed=42)
        assert result.actual_sparsity >= 0
