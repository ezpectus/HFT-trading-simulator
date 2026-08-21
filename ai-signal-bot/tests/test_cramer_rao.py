"""Tests for Cramer-Rao Bound model."""
import math

import pytest

from src.research.cramer_rao import (
    CramerRaoResult,
    compute_returns,
    cramer_rao_analysis,
    crb_signal,
    fisher_garch,
    fisher_gaussian_mean,
    fisher_gaussian_var,
    garch_log_lik,
)


def _prices(n=120):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


class TestComputeReturns:
    def test_basic(self):
        returns = compute_returns([100.0, 110.0, 121.0])
        assert returns == pytest.approx([0.1, 0.1])

    def test_length(self):
        returns = compute_returns(_prices(50))
        assert len(returns) == 49


class TestFisherGaussian:
    def test_mean_info(self):
        assert fisher_gaussian_mean(100, 0.01) == pytest.approx(10000.0)

    def test_mean_crlb(self):
        assert 1 / fisher_gaussian_mean(100, 0.01) == pytest.approx(0.0001)

    def test_var_info(self):
        assert fisher_gaussian_var(100, 0.01) == pytest.approx(100 / (2 * 1e-4))

    def test_var_crlb(self):
        assert 1 / fisher_gaussian_var(100, 0.01) == pytest.approx(2e-6)

    def test_info_scales_with_n(self):
        assert fisher_gaussian_mean(200, 0.01) == 2 * fisher_gaussian_mean(100, 0.01)


class TestGarchLogLik:
    def test_valid_params_finite(self):
        returns = compute_returns(_prices(100))
        assert math.isfinite(garch_log_lik(returns, 0.0001, 0.08, 0.9))

    def test_non_stationary_low(self):
        returns = compute_returns(_prices(100))
        assert garch_log_lik(returns, 0.0001, 0.6, 0.6) == -1e10

    def test_invalid_omega_low(self):
        returns = compute_returns(_prices(100))
        assert garch_log_lik(returns, 0.0, 0.08, 0.9) == -1e10


class TestFisherGarch:
    def test_fisher_matrix_shape(self):
        returns = compute_returns(_prices(100))
        result = fisher_garch(returns, 0.0001, 0.08, 0.9)
        assert len(result["fisher_matrix"]) == 3
        assert all(len(row) == 3 for row in result["fisher_matrix"])

    def test_matrix_symmetric(self):
        returns = compute_returns(_prices(100))
        result = fisher_garch(returns, 0.0001, 0.08, 0.9)
        for i in range(3):
            for j in range(3):
                assert result["fisher_matrix"][i][j] == pytest.approx(result["fisher_matrix"][j][i])

    def test_crlb_shape(self):
        returns = compute_returns(_prices(100))
        result = fisher_garch(returns, 0.0001, 0.08, 0.9)
        assert len(result["crlb"]) == 3
        assert all(len(row) == 3 for row in result["crlb"])

    def test_param_names(self):
        returns = compute_returns(_prices(100))
        result = fisher_garch(returns, 0.0001, 0.08, 0.9)
        assert result["param_names"] == ["omega", "alpha", "beta"]

    def test_diagonal_positive(self):
        returns = compute_returns(_prices(100))
        result = fisher_garch(returns, 0.0001, 0.08, 0.9)
        assert all(result["fisher_matrix"][i][i] > 0 for i in range(3))


class TestCRBSignal:
    def test_low_information(self):
        signal, reason = crb_signal(50.0)
        assert signal == "LOW_INFORMATION"

    def test_high_information(self):
        signal, reason = crb_signal(5000.0)
        assert signal == "HIGH_INFORMATION"

    def test_moderate(self):
        signal, reason = crb_signal(500.0)
        assert signal == "SUFFICIENT_DATA"

    def test_boundary_low(self):
        signal, reason = crb_signal(100.0)
        assert signal == "SUFFICIENT_DATA"

    def test_boundary_high(self):
        signal, reason = crb_signal(1000.0)
        assert signal == "SUFFICIENT_DATA"


class TestCramerRaoAnalysis:
    def test_basic_analysis(self):
        result = cramer_rao_analysis(_prices(120))
        assert isinstance(result, CramerRaoResult)
        assert result.n == 99

    def test_insufficient_prices_returns_none(self):
        assert cramer_rao_analysis(_prices(50)) is None

    def test_empty_returns_none(self):
        assert cramer_rao_analysis([]) is None

    def test_crlb_mu_positive(self):
        result = cramer_rao_analysis(_prices(120))
        assert result.crlb_mu > 0
        assert result.crlb_var > 0

    def test_fisher_mu_positive(self):
        result = cramer_rao_analysis(_prices(120))
        assert result.fisher_mu > 0

    def test_efficiency_mu_approx_one(self):
        result = cramer_rao_analysis(_prices(120))
        assert result.efficiency_mu == pytest.approx(1.0)

    def test_efficiency_var_less_than_one(self):
        result = cramer_rao_analysis(_prices(120))
        assert result.efficiency_var < 1.0

    def test_signal_in_set(self):
        result = cramer_rao_analysis(_prices(120))
        assert result.signal in {"LOW_INFORMATION", "HIGH_INFORMATION", "SUFFICIENT_DATA"}

    def test_ci_mu_positive(self):
        result = cramer_rao_analysis(_prices(120))
        assert result.ci_mu > 0
        assert result.ci_var > 0

    def test_sample_sizes_decay(self):
        result = cramer_rao_analysis(_prices(120))
        assert result.sample_sizes[0]["crlb_mu"] > result.sample_sizes[-1]["crlb_mu"]

    def test_fisher_matrix_present(self):
        result = cramer_rao_analysis(_prices(120))
        assert len(result.fisher_matrix) == 3

    def test_crlb_garch_present(self):
        result = cramer_rao_analysis(_prices(120))
        assert len(result.crlb_garch) == 3

    def test_std_r_positive(self):
        result = cramer_rao_analysis(_prices(120))
        assert result.std_r > 0
