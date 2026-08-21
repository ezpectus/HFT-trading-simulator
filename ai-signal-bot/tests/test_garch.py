"""Tests for GARCH(1,1) volatility model, EWMA and Parkinson estimators."""
import math

import pytest

from src.technical_analysis.garch import (
    EWMAResult,
    GARCHResult,
    ParkinsonResult,
    classify_regime,
    ewma_volatility,
    fit_garch,
    garch_forecast,
    garch_volatility,
    log_returns,
    parkinson_volatility,
)


def _volatile_returns(n=200, base=0.001, shock_std=0.01):
    """Synthetic returns with a volatility cluster in the middle."""
    returns = []
    for i in range(n):
        if 80 <= i < 120:
            std = shock_std
        else:
            std = base
        returns.append(0.0 if i == 0 else (i % 7 - 3) * std)
    return returns


class TestLogReturns:
    def test_basic_log_returns(self):
        prices = [100.0, 110.0, 121.0]
        result = log_returns(prices)
        assert len(result) == 2
        assert result[0] == pytest.approx(math.log(1.1))
        assert result[1] == pytest.approx(math.log(1.1))

    def test_empty_prices(self):
        assert log_returns([]) == []

    def test_single_price(self):
        assert log_returns([100.0]) == []

    def test_skips_non_positive_prices(self):
        prices = [100.0, 110.0, 0.0, 121.0]
        result = log_returns(prices)
        assert len(result) == 1
        assert result[0] == pytest.approx(math.log(110.0 / 100.0))


class TestFitGARCH:
    def test_insufficient_data_returns_none(self):
        assert fit_garch([0.01] * 20) is None

    def test_empty_returns_none(self):
        assert fit_garch([]) is None

    def test_fit_returns_result(self):
        result = fit_garch(_volatile_returns())
        assert isinstance(result, GARCHResult)
        assert result.n == 200

    def test_parameters_in_bounds(self):
        result = fit_garch(_volatile_returns())
        assert result.omega > 0
        assert 0 < result.alpha < 1
        assert 0 < result.beta < 1

    def test_stationarity_persistence_less_than_one(self):
        result = fit_garch(_volatile_returns())
        assert result.persistence < 1.0

    def test_vol_series_length_matches(self):
        result = fit_garch(_volatile_returns())
        assert len(result.vol_series) == result.n
        assert len(result.variance_series) == result.n

    def test_vol_series_positive(self):
        result = fit_garch(_volatile_returns())
        assert all(v > 0 for v in result.vol_series)

    def test_constant_returns_low_volatility(self):
        result = fit_garch([0.0] * 100)
        assert result is not None
        assert result.current_vol < 1.0

    def test_volatility_clustering_detected(self):
        result = fit_garch(_volatile_returns())
        assert result.current_vol > 0.0
        assert result.forecast_vol > 0.0

    def test_half_life_finite_for_stationary(self):
        result = fit_garch(_volatile_returns())
        assert math.isfinite(result.half_life)
        assert result.half_life > 0

    def test_unconditional_variance_positive(self):
        result = fit_garch(_volatile_returns())
        assert result.unconditional_variance > 0
        assert result.unconditional_vol > 0

    def test_log_likelihood_finite(self):
        result = fit_garch(_volatile_returns())
        assert math.isfinite(result.log_likelihood)

    def test_forecast_vol_positive(self):
        result = fit_garch(_volatile_returns())
        assert result.forecast_vol > 0

    def test_custom_max_iter(self):
        result = fit_garch(_volatile_returns(), max_iter=5)
        assert isinstance(result, GARCHResult)

    def test_custom_learning_rate(self):
        result = fit_garch(_volatile_returns(), learning_rate=0.001)
        assert isinstance(result, GARCHResult)


class TestGARCHForecast:
    def test_single_step_forecast(self):
        result = fit_garch(_volatile_returns())
        forecasts = garch_forecast(result, steps=1)
        assert len(forecasts) == 1
        assert forecasts[0] == pytest.approx(result.forecast_vol)

    def test_multi_step_forecast(self):
        result = fit_garch(_volatile_returns())
        forecasts = garch_forecast(result, steps=5)
        assert len(forecasts) == 5
        assert all(v > 0 for v in forecasts)

    def test_forecast_converges_to_unconditional(self):
        result = fit_garch(_volatile_returns())
        forecasts = garch_forecast(result, steps=200)
        assert forecasts[-1] == pytest.approx(result.unconditional_vol, rel=0.05)

    def test_zero_steps_returns_empty(self):
        result = fit_garch(_volatile_returns())
        assert garch_forecast(result, steps=0) == []

    def test_negative_steps_returns_empty(self):
        result = fit_garch(_volatile_returns())
        assert garch_forecast(result, steps=-1) == []


class TestEWMAVolatility:
    def test_basic_ewma(self):
        result = ewma_volatility(_volatile_returns())
        assert isinstance(result, EWMAResult)
        assert result.lambda_ == pytest.approx(0.94)
        assert result.current_vol > 0
        assert len(result.vol_series) == 200

    def test_insufficient_data_returns_none(self):
        assert ewma_volatility([0.01] * 5) is None

    def test_empty_returns_none(self):
        assert ewma_volatility([]) is None

    def test_custom_lambda(self):
        result = ewma_volatility(_volatile_returns(), lambda_=0.9)
        assert result.lambda_ == pytest.approx(0.9)

    def test_constant_returns_low_vol(self):
        result = ewma_volatility([0.0] * 50)
        assert result.current_vol < 1.0


class TestParkinsonVolatility:
    def test_basic_parkinson(self):
        highs = [100.0 + i * 0.1 for i in range(50)]
        lows = [99.0 + i * 0.1 for i in range(50)]
        result = parkinson_volatility(highs, lows)
        assert isinstance(result, ParkinsonResult)
        assert result.current_vol > 0
        assert len(result.vol_series) == 31

    def test_insufficient_data_returns_none(self):
        highs = [100.0] * 10
        lows = [99.0] * 10
        assert parkinson_volatility(highs, lows, period=20) is None

    def test_empty_returns_none(self):
        assert parkinson_volatility([], []) is None

    def test_mismatched_lengths_returns_none(self):
        highs = [100.0] * 30
        lows = [99.0] * 20
        assert parkinson_volatility(highs, lows) is None

    def test_custom_period(self):
        highs = [100.0 + i * 0.1 for i in range(50)]
        lows = [99.0 + i * 0.1 for i in range(50)]
        result = parkinson_volatility(highs, lows, period=10)
        assert len(result.vol_series) == 41

    def test_constant_range_zero_vol(self):
        highs = [100.0] * 30
        lows = [100.0] * 30
        result = parkinson_volatility(highs, lows)
        assert result.current_vol == pytest.approx(0.0)


class TestGARCHVolatility:
    def test_from_prices(self):
        prices = [100.0 * math.exp(0.001 * (i % 5 - 2)) for i in range(80)]
        result = garch_volatility(prices)
        assert isinstance(result, GARCHResult)

    def test_insufficient_prices_returns_none(self):
        assert garch_volatility([100.0] * 20) is None

    def test_empty_prices_returns_none(self):
        assert garch_volatility([]) is None


class TestClassifyRegime:
    def test_low_regime(self):
        assert classify_regime(1.0, 0.0, 100.0) == "LOW"

    def test_high_regime(self):
        assert classify_regime(90.0, 0.0, 100.0) == "HIGH"

    def test_medium_regime(self):
        assert classify_regime(50.0, 0.0, 100.0) == "MEDIUM"

    def test_zero_range_returns_medium(self):
        assert classify_regime(50.0, 50.0, 50.0) == "MEDIUM"
