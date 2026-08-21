"""Tests for Sobolev Space Regularization model."""
import math

import pytest

from src.research.sobolev import (
    SobolevResult,
    compute_returns,
    matern_kernel,
    sobolev_analysis,
    sobolev_regression,
    sobolev_signal,
)


def _prices(n=120):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


def _smooth_data(n=30):
    """Smooth sine data on [0, 1]."""
    x = [i / n for i in range(n)]
    y = [math.sin(2 * math.pi * xi) for xi in x]
    return x, y


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


class TestMaternKernel:
    def test_zero_distance_sigma_squared(self):
        assert matern_kernel(0.5, 0.5, 2) == pytest.approx(1.0)

    def test_s1_exp_decay(self):
        assert matern_kernel(0.0, 0.1, 1) == pytest.approx(math.exp(-1.0))

    def test_s2_matern52(self):
        arg = math.sqrt(3)
        assert matern_kernel(0.0, 0.1, 2) == pytest.approx((1 + arg) * math.exp(-arg))

    def test_decreasing_with_distance(self):
        assert matern_kernel(0.0, 0.2, 2) < matern_kernel(0.0, 0.1, 2)

    def test_positive(self):
        assert matern_kernel(0.0, 0.5, 2) > 0

    def test_general_approximation(self):
        assert matern_kernel(0.0, 0.1, 3) == pytest.approx(math.exp(-0.5))

    def test_symmetric(self):
        assert matern_kernel(0.1, 0.3, 2) == matern_kernel(0.3, 0.1, 2)


class TestSobolevRegression:
    def test_predictions_length(self):
        x, y = _smooth_data()
        result = sobolev_regression(x, y, 2, 0.1)
        assert len(result["predictions"]) == len(x)

    def test_smooth_data_small_residual(self):
        x, y = _smooth_data()
        result = sobolev_regression(x, y, 2, 0.1)
        assert result["residual"] < 0.5

    def test_l2_norm_non_negative(self):
        x, y = _smooth_data()
        result = sobolev_regression(x, y, 2, 0.1)
        assert result["l2_norm"] >= 0

    def test_h1_semi_non_negative(self):
        x, y = _smooth_data()
        result = sobolev_regression(x, y, 2, 0.1)
        assert result["h1_semi"] >= 0

    def test_residual_non_negative(self):
        x, y = _smooth_data()
        result = sobolev_regression(x, y, 2, 0.1)
        assert result["residual"] >= 0

    def test_higher_lambda_smoother(self):
        x, y = _smooth_data()
        low = sobolev_regression(x, y, 2, 0.001)
        high = sobolev_regression(x, y, 2, 10.0)
        assert high["h1_semi"] < low["h1_semi"]

    def test_higher_lambda_larger_residual(self):
        x, y = _smooth_data()
        low = sobolev_regression(x, y, 2, 0.001)
        high = sobolev_regression(x, y, 2, 10.0)
        assert high["residual"] > low["residual"]

    def test_deterministic(self):
        x, y = _smooth_data()
        r1 = sobolev_regression(x, y, 2, 0.1)
        r2 = sobolev_regression(x, y, 2, 0.1)
        assert r1["predictions"] == r2["predictions"]

    def test_predict_function(self):
        x, y = _smooth_data()
        result = sobolev_regression(x, y, 2, 0.1)
        assert math.isfinite(result["predict"](0.5))

    def test_s1_works(self):
        x, y = _smooth_data()
        result = sobolev_regression(x, y, 1, 0.1)
        assert math.isfinite(result["residual"])


class TestSobolevSignal:
    def test_overfit(self):
        signal, reason = sobolev_signal(0.001)
        assert signal == "OVERFIT"

    def test_oversmooth(self):
        signal, reason = sobolev_signal(10.0)
        assert signal == "OVERSMOOTH"

    def test_balanced(self):
        signal, reason = sobolev_signal(0.1)
        assert signal == "BALANCED"

    def test_boundary_overfit(self):
        signal, reason = sobolev_signal(0.01)
        assert signal == "BALANCED"

    def test_boundary_oversmooth(self):
        signal, reason = sobolev_signal(5.0)
        assert signal == "BALANCED"


class TestSobolevAnalysis:
    def test_basic_analysis(self):
        result = sobolev_analysis(_prices(120))
        assert isinstance(result, SobolevResult)

    def test_insufficient_prices_returns_none(self):
        assert sobolev_analysis(_prices(40)) is None

    def test_empty_returns_none(self):
        assert sobolev_analysis([]) is None

    def test_signal_in_set(self):
        result = sobolev_analysis(_prices(120))
        assert result.signal in {"OVERFIT", "OVERSMOOTH", "BALANCED"}

    def test_deterministic_with_seed(self):
        r1 = sobolev_analysis(_prices(120), seed=42)
        r2 = sobolev_analysis(_prices(120), seed=42)
        assert r1.residual == pytest.approx(r2.residual)
        assert r1.smooth_predictions == pytest.approx(r2.smooth_predictions)

    def test_sweep_length(self):
        result = sobolev_analysis(_prices(120))
        assert len(result.sweep_results) == 5

    def test_sweep_lambdas(self):
        result = sobolev_analysis(_prices(120))
        lambdas = [r["lambda"] for r in result.sweep_results]
        assert lambdas == [0.001, 0.01, 0.1, 1.0, 10.0]

    def test_l_curve_length(self):
        result = sobolev_analysis(_prices(120))
        assert len(result.l_curve) == 5

    def test_smooth_predictions_length(self):
        result = sobolev_analysis(_prices(120))
        assert len(result.smooth_predictions) == 101

    def test_l2_norm_finite(self):
        result = sobolev_analysis(_prices(120))
        assert math.isfinite(result.l2_norm)

    def test_h1_semi_finite(self):
        result = sobolev_analysis(_prices(120))
        assert math.isfinite(result.h1_semi)

    def test_residual_finite(self):
        result = sobolev_analysis(_prices(120))
        assert math.isfinite(result.residual)

    def test_x_data_length(self):
        result = sobolev_analysis(_prices(120))
        assert len(result.x_data) == len(result.y_data)

    def test_norm_v_length(self):
        result = sobolev_analysis(_prices(120))
        assert len(result.norm_v) == len(result.y_data)

    def test_sweep_h1_decreasing(self):
        result = sobolev_analysis(_prices(120))
        h1s = [r["h1_semi"] for r in result.sweep_results]
        assert h1s == sorted(h1s, reverse=True)

    def test_custom_lambda_signal(self):
        result = sobolev_analysis(_prices(120), lambda_=10.0)
        assert result.signal == "OVERSMOOTH"

    def test_custom_s(self):
        result = sobolev_analysis(_prices(120), s=1)
        assert math.isfinite(result.residual)

    def test_zero_noise(self):
        result = sobolev_analysis(_prices(120), noise_level=0.0)
        assert result.y_data == pytest.approx(result.norm_v)
