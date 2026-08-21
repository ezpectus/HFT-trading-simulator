"""Tests for Itô Calculus Generator model."""
import math

import pytest

from src.research.ito_generator import (
    ItoGeneratorResult,
    apply_generator,
    compute_returns,
    expected_hitting_time,
    ito_generator_analysis,
    ito_signal,
    num_double_prime,
    num_prime,
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

    def test_single_pair(self):
        returns = compute_returns([100.0, 105.0])
        assert returns == pytest.approx([0.05])

    def test_negative_returns(self):
        returns = compute_returns([100.0, 90.0])
        assert returns == pytest.approx([-0.1])


class TestApplyGenerator:
    def test_identity_zero_second_deriv(self):
        # f(x)=x: A·f = mu(x)*1 + 0.5*sigma^2*0 = mu(x)
        result = apply_generator(2.0, lambda x: 3.0 * x, lambda x: 0.5, lambda x: x, lambda x: 1.0, lambda x: 0.0)
        assert result == pytest.approx(6.0)

    def test_square(self):
        # f(x)=x²: A·f = mu*2x + 0.5*sigma²*2
        result = apply_generator(1.0, lambda x: 2.0, lambda x: 3.0, lambda x: x * x, lambda x: 2 * x, lambda x: 2.0)
        assert result == pytest.approx(2 * 2 * 1 + 0.5 * 9 * 2)

    def test_exp(self):
        # f(x)=eˣ: A·f = mu*eˣ + 0.5*sigma²*eˣ = eˣ(mu + 0.5*sigma²)
        x = 0.5
        result = apply_generator(x, lambda v: 1.0, lambda v: 2.0, math.exp, math.exp, math.exp)
        assert result == pytest.approx(math.exp(x) * (1.0 + 0.5 * 4.0))

    def test_zero_diffusion(self):
        # sigma=0: A·f = mu*f'
        result = apply_generator(3.0, lambda x: 5.0, lambda x: 0.0, lambda x: x * x, lambda x: 2 * x, lambda x: 2.0)
        assert result == pytest.approx(5.0 * 6.0)

    def test_zero_drift(self):
        # mu=0: A·f = 0.5*sigma²*f''
        result = apply_generator(1.0, lambda x: 0.0, lambda x: 4.0, lambda x: x * x, lambda x: 2 * x, lambda x: 2.0)
        assert result == pytest.approx(0.5 * 16.0 * 2.0)


class TestNumericalDerivatives:
    def test_prime_linear(self):
        assert num_prime(lambda x: 3 * x + 1, 2.0) == pytest.approx(3.0, abs=1e-6)

    def test_prime_quadratic(self):
        assert num_prime(lambda x: x * x, 3.0) == pytest.approx(6.0, abs=1e-4)

    def test_double_prime_quadratic(self):
        assert num_double_prime(lambda x: x * x, 3.0) == pytest.approx(2.0, abs=1e-4)

    def test_double_prime_cubic(self):
        assert num_double_prime(lambda x: x ** 3, 2.0) == pytest.approx(12.0, abs=1e-3)

    def test_prime_exp(self):
        x = 0.7
        assert num_prime(math.exp, x) == pytest.approx(math.exp(x), rel=1e-6)


class TestExpectedHittingTime:
    def _ou(self):
        x_grid = [-1.0 + i * (2.0 / 39) for i in range(40)]
        return x_grid, lambda x: 1.0 * (0.0 - x), lambda x: 0.5

    def test_length(self):
        x_grid, mu, sigma = self._ou()
        result = expected_hitting_time(x_grid, mu, sigma, 20)
        assert len(result) == len(x_grid)

    def test_target_zero(self):
        x_grid, mu, sigma = self._ou()
        result = expected_hitting_time(x_grid, mu, sigma, 20)
        assert result[20] == pytest.approx(0.0)

    def test_non_negative(self):
        x_grid, mu, sigma = self._ou()
        result = expected_hitting_time(x_grid, mu, sigma, 20)
        assert all(v >= 0 for v in result)

    def test_far_from_target_longer(self):
        x_grid, mu, sigma = self._ou()
        result = expected_hitting_time(x_grid, mu, sigma, 20)
        # Points far from the target should have longer expected hitting times
        assert result[5] > result[15]

    def test_target_idx_clamped_high(self):
        x_grid, mu, sigma = self._ou()
        result = expected_hitting_time(x_grid, mu, sigma, 1000)
        assert len(result) == len(x_grid)
        assert result[-1] == result[-2]

    def test_target_idx_clamped_low(self):
        x_grid, mu, sigma = self._ou()
        result = expected_hitting_time(x_grid, mu, sigma, -5)
        assert len(result) == len(x_grid)
        assert result[0] == result[1]

    def test_converges_with_iterations(self):
        x_grid, mu, sigma = self._ou()
        low = expected_hitting_time(x_grid, mu, sigma, 20, iterations=100)
        high = expected_hitting_time(x_grid, mu, sigma, 20, iterations=5000)
        # More iterations should not decrease the value at a far point
        assert high[5] >= low[5] - 1e-9


class TestItoSignal:
    def test_positive(self):
        signal, reason = ito_signal(0.001)
        assert signal == "GENERATOR_POSITIVE"

    def test_negative(self):
        signal, reason = ito_signal(-0.001)
        assert signal == "GENERATOR_NEGATIVE"

    def test_neutral(self):
        signal, reason = ito_signal(0.0)
        assert signal == "NEUTRAL"

    def test_boundary_positive(self):
        signal, reason = ito_signal(0.00005)
        assert signal == "NEUTRAL"

    def test_boundary_negative(self):
        signal, reason = ito_signal(-0.00005)
        assert signal == "NEUTRAL"


class TestItoGeneratorAnalysis:
    def test_basic_analysis_ou(self):
        result = ito_generator_analysis(_prices(120), model_type="ou")
        assert isinstance(result, ItoGeneratorResult)

    def test_gbm_model(self):
        result = ito_generator_analysis(_prices(120), model_type="gbm")
        assert isinstance(result, ItoGeneratorResult)

    def test_const_model(self):
        result = ito_generator_analysis(_prices(120), model_type="const")
        assert isinstance(result, ItoGeneratorResult)

    def test_insufficient_prices_returns_none(self):
        assert ito_generator_analysis(_prices(20)) is None

    def test_empty_returns_none(self):
        assert ito_generator_analysis([]) is None

    def test_signal_in_set(self):
        result = ito_generator_analysis(_prices(120))
        assert result.signal in {"GENERATOR_POSITIVE", "GENERATOR_NEGATIVE", "NEUTRAL"}

    def test_x_grid_length(self):
        result = ito_generator_analysis(_prices(120))
        assert len(result.x_grid) == 60

    def test_af_values_length(self):
        result = ito_generator_analysis(_prices(120))
        assert len(result.af_values) == len(result.x_grid)

    def test_f_values_length(self):
        result = ito_generator_analysis(_prices(120))
        assert len(result.f_values) == len(result.x_grid)

    def test_all_func_types(self):
        for func_type in ("identity", "square", "exp", "log", "cosh"):
            result = ito_generator_analysis(_prices(120), func_type=func_type)
            assert isinstance(result, ItoGeneratorResult)

    def test_invalid_func_type_falls_back(self):
        result = ito_generator_analysis(_prices(120), func_type="bogus")
        assert result.func_name == "f(x) = x"

    def test_params_present(self):
        result = ito_generator_analysis(_prices(120))
        assert result.params["kappa"] > 0
        assert result.params["sigma_ou"] > 0
        assert math.isfinite(result.params["theta"])

    def test_stationary_positive(self):
        result = ito_generator_analysis(_prices(120))
        assert all(v > 0 for v in result.stationary)

    def test_hitting_times_non_negative(self):
        result = ito_generator_analysis(_prices(120))
        assert all(v >= 0 for v in result.hitting_times)

    def test_current_hitting_time_finite(self):
        result = ito_generator_analysis(_prices(120))
        assert math.isfinite(result.current_hitting_time)

    def test_dynkin_predictions(self):
        result = ito_generator_analysis(_prices(120))
        assert len(result.dynkin_predictions) == 21
        assert result.dynkin_predictions[0]["t"] == pytest.approx(0.0)
        assert result.dynkin_predictions[0]["predicted"] == pytest.approx(result.dynkin_predictions[0]["actual"])

    def test_dynkin_monotonic_for_positive_generator(self):
        result = ito_generator_analysis(_prices(120))
        if result.af_current > 0:
            assert result.dynkin_predictions[-1]["predicted"] > result.dynkin_predictions[0]["predicted"]

    def test_af_current_matches_grid_value(self):
        result = ito_generator_analysis(_prices(120))
        idx = min(len(result.x_grid) - 1, max(0, math.floor((result.current_x - result.x_grid[0]) / result.dx)))
        assert result.af_values[idx] == pytest.approx(result.af_current, abs=1e-6)

    def test_identity_generator_equals_drift(self):
        # For f(x)=x, A·f = mu(x); for OU model mu(x) = kappa*(theta - x)
        result = ito_generator_analysis(_prices(120), model_type="ou", func_type="identity")
        kappa = result.params["kappa"]
        theta = result.params["theta"]
        x = result.x_grid[10]
        expected = kappa * (theta - x)
        assert result.af_values[10] == pytest.approx(expected, rel=1e-6)
