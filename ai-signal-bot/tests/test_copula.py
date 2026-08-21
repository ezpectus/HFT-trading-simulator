"""Tests for Copula dependency model."""
import math

import pytest

from src.technical_analysis.copula import (
    CopulaFit,
    CopulaResult,
    bivariate_normal_cdf,
    clayton_cdf,
    copula_analysis,
    copula_from_prices,
    copula_log_likelihood,
    copula_signal,
    empirical_cdf,
    erf,
    fit_copula,
    gaussian_copula_cdf,
    gumbel_cdf,
    kendall_tau,
    norm_cdf,
    norm_inv,
    pearson_corr,
    reg_incomplete_beta,
    spearman_rho,
    t_cdf,
)


def _correlated_returns(n=100, rho=0.7):
    """Two correlated return series."""
    x = [math.sin(i * 0.5) * 0.01 for i in range(n)]
    y = [rho * xi + (1 - rho) * math.cos(i * 0.7) * 0.01 for xi, i in zip(x, range(n), strict=True)]
    return x, y


class TestEmpiricalCDF:
    def test_values_in_unit_interval(self):
        values = [1.0, 2.0, 3.0, 4.0]
        result = empirical_cdf(values)
        assert all(0 < v < 1 for v in result)

    def test_monotonic(self):
        values = [1.0, 2.0, 3.0, 4.0]
        result = empirical_cdf(values)
        assert result == sorted(result)

    def test_single_value(self):
        result = empirical_cdf([5.0])
        assert result == pytest.approx([0.5])


class TestNormalFunctions:
    def test_norm_inv_median(self):
        assert norm_inv(0.5) == pytest.approx(0.0, abs=1e-6)

    def test_norm_inv_clamps_low(self):
        assert norm_inv(0.0) == pytest.approx(-10.0)

    def test_norm_inv_clamps_high(self):
        assert norm_inv(1.0) == pytest.approx(10.0)

    def test_norm_inv_roundtrip(self):
        p = 0.9
        assert norm_cdf(norm_inv(p)) == pytest.approx(p, abs=1e-4)

    def test_norm_cdf_zero(self):
        assert norm_cdf(0.0) == pytest.approx(0.5)

    def test_erf_zero(self):
        assert erf(0.0) == pytest.approx(0.0, abs=1e-8)

    def test_erf_symmetry(self):
        assert erf(1.0) == pytest.approx(-erf(-1.0))


class TestDependenceMeasures:
    def test_kendall_tau_perfect_positive(self):
        x = list(range(20))
        assert kendall_tau(x, x) == pytest.approx(1.0)

    def test_kendall_tau_perfect_negative(self):
        x = list(range(20))
        y = list(reversed(x))
        assert kendall_tau(x, y) == pytest.approx(-1.0)

    def test_kendall_tau_shuffled_not_perfect(self):
        x = [1, 2, 3, 4, 5]
        y = [3, 1, 5, 2, 4]
        assert abs(kendall_tau(x, y)) < 1.0

    def test_spearman_rho_perfect_positive(self):
        x = list(range(20))
        assert spearman_rho(x, x) == pytest.approx(1.0)

    def test_pearson_corr_perfect_positive(self):
        x = list(range(20))
        assert pearson_corr(x, x) == pytest.approx(1.0)

    def test_pearson_corr_correlated(self):
        x, y = _correlated_returns(rho=0.7)
        assert pearson_corr(x, y) > 0.3


class TestCopulaCDFs:
    def test_clayton_independent_when_theta_zero(self):
        assert clayton_cdf(0.3, 0.4, 0.0) == pytest.approx(0.12)

    def test_clayton_in_unit_interval(self):
        value = clayton_cdf(0.3, 0.4, 2.0)
        assert 0 < value < 1

    def test_clayton_lower_tail_concentration(self):
        assert clayton_cdf(0.05, 0.05, 3.0) > clayton_cdf(0.05, 0.05, 0.01)

    def test_gumbel_independent_when_theta_one(self):
        assert gumbel_cdf(0.3, 0.4, 1.0) == pytest.approx(0.12)

    def test_gumbel_in_unit_interval(self):
        value = gumbel_cdf(0.3, 0.4, 2.0)
        assert 0 < value < 1

    def test_gaussian_copula_independent_when_rho_zero(self):
        assert gaussian_copula_cdf(0.3, 0.4, 0.0) == pytest.approx(0.12, abs=0.01)

    def test_bivariate_normal_rho_zero(self):
        assert bivariate_normal_cdf(1.0, 1.0, 0.0) == pytest.approx(
            norm_cdf(1.0) * norm_cdf(1.0), abs=0.02
        )

    def test_bivariate_normal_rho_positive_increases_cdf(self):
        assert bivariate_normal_cdf(1.0, 1.0, 0.5) > bivariate_normal_cdf(1.0, 1.0, 0.0)


class TestStudentT:
    def test_t_cdf_zero(self):
        assert t_cdf(0.0, 5.0) == pytest.approx(0.5)

    def test_t_cdf_symmetry(self):
        assert t_cdf(-1.0, 5.0) == pytest.approx(1 - t_cdf(1.0, 5.0))

    def test_reg_incomplete_beta_bounds(self):
        assert reg_incomplete_beta(0.0, 2.0, 0.5) == pytest.approx(0.0)
        assert reg_incomplete_beta(1.0, 2.0, 0.5) == pytest.approx(1.0)


class TestFitCopula:
    def test_tau_zero(self):
        fits = fit_copula(0.0)
        assert fits["clayton"].theta == pytest.approx(0.01)
        assert fits["gumbel"].theta == pytest.approx(1.01)
        assert fits["gaussian"].rho == pytest.approx(0.0, abs=1e-9)

    def test_positive_tau(self):
        fits = fit_copula(0.5)
        assert fits["clayton"].theta > 1
        assert fits["gumbel"].theta > 1
        assert fits["gaussian"].rho > 0

    def test_negative_tau(self):
        fits = fit_copula(-0.5)
        assert fits["gaussian"].rho < 0

    def test_tail_dependence_clayton(self):
        fits = fit_copula(0.5)
        assert fits["clayton"].lower > 0
        assert fits["clayton"].upper == 0

    def test_tail_dependence_gumbel(self):
        fits = fit_copula(0.5)
        assert fits["gumbel"].upper > 0
        assert fits["gumbel"].lower == 0

    def test_tail_dependence_gaussian_zero(self):
        fits = fit_copula(0.5)
        assert fits["gaussian"].lower == 0
        assert fits["gaussian"].upper == 0

    def test_student_t_symmetric_tail(self):
        fits = fit_copula(0.5)
        assert fits["studentT"].df == 5
        assert fits["studentT"].lower == pytest.approx(fits["studentT"].upper)


class TestCopulaAnalysis:
    def test_basic_analysis(self):
        x, y = _correlated_returns()
        result = copula_analysis(x, y, a="BTC", b="ETH")
        assert isinstance(result, CopulaResult)
        assert result.a == "BTC"
        assert result.b == "ETH"
        assert result.n == 100

    def test_insufficient_data_returns_none(self):
        assert copula_analysis([0.01] * 10, [0.01] * 10) is None

    def test_empty_returns_none(self):
        assert copula_analysis([], []) is None

    def test_mismatched_lengths_returns_none(self):
        assert copula_analysis([0.01] * 50, [0.01] * 40) is None

    def test_correlated_returns_positive_tau(self):
        x, y = _correlated_returns(rho=0.7)
        result = copula_analysis(x, y)
        assert result.tau > 0

    def test_fits_contain_all_copulas(self):
        x, y = _correlated_returns()
        result = copula_analysis(x, y)
        assert set(result.fits.keys()) == {"clayton", "gumbel", "gaussian", "studentT"}
        assert all(isinstance(f, CopulaFit) for f in result.fits.values())

    def test_log_likelihood_finite(self):
        x, y = _correlated_returns()
        result = copula_analysis(x, y)
        assert all(math.isfinite(v) for v in result.log_lik.values())

    def test_conditional_lower_contains_all(self):
        x, y = _correlated_returns()
        result = copula_analysis(x, y)
        assert set(result.conditional_lower.keys()) == {"clayton", "gumbel", "gaussian", "independent"}

    def test_joint_probs_in_unit_interval(self):
        x, y = _correlated_returns()
        result = copula_analysis(x, y)
        assert all(0 <= v <= 1 for v in result.joint_probs.values())


class TestCopulaFromPrices:
    def test_from_prices(self):
        prices_a = [100.0 * (1 + 0.01 * (i % 5 - 2)) for i in range(60)]
        prices_b = [50.0 * (1 + 0.01 * (i % 5 - 2)) for i in range(60)]
        result = copula_from_prices(prices_a, prices_b)
        assert isinstance(result, CopulaResult)

    def test_insufficient_prices_returns_none(self):
        assert copula_from_prices([100.0] * 10, [50.0] * 10) is None

    def test_empty_prices_returns_none(self):
        assert copula_from_prices([], []) is None


class TestCopulaSignal:
    def test_high_tail_risk(self):
        conditional = {"clayton": 0.3, "gumbel": 0.1, "gaussian": 0.1, "independent": 0.05}
        signal, reason = copula_signal(conditional, "clayton", "BTC", "ETH")
        assert signal == "RISK"
        assert "BTC" in reason and "ETH" in reason

    def test_low_tail_hedge(self):
        conditional = {"clayton": 0.02, "gumbel": 0.02, "gaussian": 0.02, "independent": 0.05}
        signal, reason = copula_signal(conditional, "clayton", "BTC", "ETH")
        assert signal == "HEDGE"

    def test_moderate_neutral(self):
        conditional = {"clayton": 0.08, "gumbel": 0.08, "gaussian": 0.08, "independent": 0.05}
        signal, reason = copula_signal(conditional, "clayton", "BTC", "ETH")
        assert signal == "NEUTRAL"


class TestCopulaLogLikelihood:
    def test_finite_values(self):
        x, y = _correlated_returns()
        result = copula_analysis(x, y)
        ll = copula_log_likelihood(result.u_a, result.u_b, result.fits)
        assert set(ll.keys()) == {"clayton", "gumbel", "gaussian"}
        assert all(math.isfinite(v) for v in ll.values())
