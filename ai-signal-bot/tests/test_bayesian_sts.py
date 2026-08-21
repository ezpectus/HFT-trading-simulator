"""Tests for Bayesian Structural Time Series (BSTS) model."""
import math

import pytest

from src.technical_analysis.bayesian_sts import (
    BSTSResult,
    _build_observation,
    _build_transition,
    bsts_analysis,
    bsts_signal,
    kalman_filter_bsts,
    optimize_bsts,
)


def _prices(n=120, trend=0.002):
    """Synthetic trending price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + trend + 0.002 * (i % 7 - 3)))
    return prices


def _log_prices(n=100, trend=0.002):
    return [math.log(p) for p in _prices(n, trend)]


class TestBuilders:
    def test_transition_shape(self):
        t = _build_transition(8, 7)
        assert len(t) == 8
        assert all(len(row) == 8 for row in t)

    def test_transition_trend(self):
        t = _build_transition(8, 7)
        assert t[0][0] == 1.0
        assert t[0][1] == 1.0
        assert t[1][1] == 1.0

    def test_transition_seasonal(self):
        t = _build_transition(8, 7)
        assert t[2][3] == 1.0
        assert t[6][2] == -1.0

    def test_observation_vector(self):
        z = _build_observation(8)
        assert z[0] == 1.0
        assert z[2] == 1.0
        assert sum(z) == 2.0

    def test_observation_no_seasonal(self):
        z = _build_observation(2)
        assert z == [1.0, 0.0]


class TestKalmanFilterBSTS:
    def test_basic_filter(self):
        params = {"sigma_level": 0.1, "sigma_slope": 0.01, "sigma_seasonal": 0.05, "sigma_irregular": 0.1, "period": 7}
        result = kalman_filter_bsts(_log_prices(60), params)
        assert len(result["filtered"]) == 60
        assert len(result["trend"]) == 60
        assert len(result["slope"]) == 60
        assert len(result["seasonal"]) == 60

    def test_forecast_length(self):
        params = {"sigma_level": 0.1, "sigma_slope": 0.01, "sigma_seasonal": 0.05, "sigma_irregular": 0.1, "period": 7}
        result = kalman_filter_bsts(_log_prices(60), params)
        assert len(result["forecasts"]) == 10

    def test_total_log_lik_finite(self):
        params = {"sigma_level": 0.1, "sigma_slope": 0.01, "sigma_seasonal": 0.05, "sigma_irregular": 0.1, "period": 7}
        result = kalman_filter_bsts(_log_prices(60), params)
        assert math.isfinite(result["total_log_lik"])

    def test_trend_tracks_data(self):
        y = _log_prices(60)
        params = {"sigma_level": 0.1, "sigma_slope": 0.01, "sigma_seasonal": 0.05, "sigma_irregular": 0.1, "period": 7}
        result = kalman_filter_bsts(y, params)
        assert abs(result["trend"][-1] - y[-1]) < 0.5

    def test_filtered_finite(self):
        params = {"sigma_level": 0.1, "sigma_slope": 0.01, "sigma_seasonal": 0.05, "sigma_irregular": 0.1, "period": 7}
        result = kalman_filter_bsts(_log_prices(60), params)
        assert all(math.isfinite(v) for v in result["filtered"])

    def test_smooth_series_small_residuals(self):
        y = [math.log(100 + i * 0.5) for i in range(60)]
        params = {"sigma_level": 0.05, "sigma_slope": 0.001, "sigma_seasonal": 0.01, "sigma_irregular": 0.05, "period": 7}
        result = kalman_filter_bsts(y, params)
        residuals = [y[i] - result["filtered"][i] for i in range(60)]
        assert max(abs(r) for r in residuals) < 0.1

    def test_period_two_state_dim(self):
        params = {"sigma_level": 0.1, "sigma_slope": 0.01, "sigma_seasonal": 0.05, "sigma_irregular": 0.1, "period": 2}
        result = kalman_filter_bsts(_log_prices(60), params)
        assert len(result["seasonal"]) == 60


class TestOptimizeBSTS:
    def test_returns_params(self):
        best = optimize_bsts(_log_prices(60), 7)
        assert best["sigma_level"] > 0
        assert best["sigma_slope"] > 0
        assert best["sigma_irregular"] > 0
        assert best["period"] == 7

    def test_log_lik_finite(self):
        best = optimize_bsts(_log_prices(60), 7)
        assert math.isfinite(best["log_lik"])

    def test_deterministic(self):
        a = optimize_bsts(_log_prices(60), 7)
        b = optimize_bsts(_log_prices(60), 7)
        assert a == b


class TestBSTSSignal:
    def test_buy(self):
        assert bsts_signal(0.01) == "BUY"

    def test_sell(self):
        assert bsts_signal(-0.01) == "SELL"

    def test_neutral(self):
        assert bsts_signal(0.001) == "NEUTRAL"

    def test_boundary_buy(self):
        assert bsts_signal(0.005) == "NEUTRAL"


class TestBSTSAnalysis:
    def test_basic_analysis(self):
        result = bsts_analysis(_prices(120))
        assert isinstance(result, BSTSResult)

    def test_insufficient_prices_returns_none(self):
        assert bsts_analysis(_prices(50)) is None

    def test_empty_returns_none(self):
        assert bsts_analysis([]) is None

    def test_signal_in_set(self):
        result = bsts_analysis(_prices(120))
        assert result.signal in {"BUY", "SELL", "NEUTRAL"}

    def test_forecast_price_positive(self):
        result = bsts_analysis(_prices(120))
        assert result.forecast_price > 0

    def test_forecast_return_finite(self):
        result = bsts_analysis(_prices(120))
        assert math.isfinite(result.forecast_return)

    def test_residuals_length(self):
        result = bsts_analysis(_prices(120))
        assert len(result.residuals) == 100

    def test_trend_exp_length(self):
        result = bsts_analysis(_prices(120))
        assert len(result.trend_exp) == 100

    def test_forecasts_exp_length(self):
        result = bsts_analysis(_prices(120))
        assert len(result.forecasts_exp) == 10

    def test_manual_params(self):
        result = bsts_analysis(_prices(120), auto_optimize=False, sigma_level=0.2, sigma_irregular=0.05)
        assert result.params["sigma_level"] == pytest.approx(0.2)
        assert result.params["sigma_irregular"] == pytest.approx(0.05)

    def test_custom_period(self):
        result = bsts_analysis(_prices(120), period=5)
        assert result.params["period"] == 5

    def test_trend_contribution_finite(self):
        result = bsts_analysis(_prices(120))
        assert math.isfinite(result.trend_contribution)

    def test_total_log_lik_finite(self):
        result = bsts_analysis(_prices(120))
        assert math.isfinite(result.total_log_lik)

    def test_trending_prices_forecast_up(self):
        result = bsts_analysis(_prices(120, trend=0.01))
        assert result.forecast_return > -0.01
