"""Bayesian Structural Time Series (BSTS) with Kalman filter.

State-space model decomposing a time series into trend, seasonality and
irregular components, with 10-step-ahead forecasting.
"""
from __future__ import annotations

import math

MIN_PRICES = 30
DEFAULT_PERIOD = 7
DEFAULT_LOOKBACK = 100
DEFAULT_SIGMA_LEVEL = 0.1
DEFAULT_SIGMA_IRREGULAR = 0.1
N_FORECAST = 10


class BSTSResult:
    """Container for Bayesian structural time series results."""

    def __init__(
        self,
        prices: list[float],
        trend_exp: list[float],
        filtered_exp: list[float],
        seasonal_exp: list[float],
        forecasts_exp: list[float],
        residuals: list[float],
        params: dict,
        current_price: float,
        forecast_price: float,
        forecast_return: float,
        signal: str,
        trend_contribution: float,
        seasonal_contribution: float,
        total_log_lik: float,
        trend: list[float],
        slope: list[float],
        seasonal: list[float],
        forecasts: list[float],
    ) -> None:
        self.prices = prices
        self.trend_exp = trend_exp
        self.filtered_exp = filtered_exp
        self.seasonal_exp = seasonal_exp
        self.forecasts_exp = forecasts_exp
        self.residuals = residuals
        self.params = params
        self.current_price = current_price
        self.forecast_price = forecast_price
        self.forecast_return = forecast_return
        self.signal = signal
        self.trend_contribution = trend_contribution
        self.seasonal_contribution = seasonal_contribution
        self.total_log_lik = total_log_lik
        self.trend = trend
        self.slope = slope
        self.seasonal = seasonal
        self.forecasts = forecasts


def _build_transition(state_dim: int, period: int) -> list[list[float]]:
    """Transition matrix: local linear trend + dummy seasonal."""
    t = [[0.0] * state_dim for _ in range(state_dim)]
    t[0][0] = 1.0
    t[0][1] = 1.0
    t[1][1] = 1.0
    for i in range(2, state_dim - 2):
        t[i][i + 1] = 1.0
    if state_dim > 2:
        for i in range(2, state_dim - 1):
            t[state_dim - 2][i] = -1.0
    return t


def _build_observation(state_dim: int) -> list[float]:
    """Observation vector: level + first seasonal."""
    z = [0.0] * state_dim
    z[0] = 1.0
    if state_dim > 2:
        z[2] = 1.0
    return z


def _build_process_noise(
    state_dim: int,
    sigma_level: float,
    sigma_slope: float,
    sigma_seasonal: float,
) -> list[list[float]]:
    """Process noise covariance matrix Q."""
    q = [[0.0] * state_dim for _ in range(state_dim)]
    q[0][0] = sigma_level * sigma_level
    q[1][1] = sigma_slope * sigma_slope
    for i in range(2, state_dim):
        q[i][i] = sigma_seasonal * sigma_seasonal
    return q


def _mat_vec(t: list[list[float]], x: list[float]) -> list[float]:
    """Matrix-vector product."""
    return [sum(t[i][j] * x[j] for j in range(len(x))) for i in range(len(t))]


def _mat_mat(a: list[list[float]], b: list[list[float]]) -> list[list[float]]:
    """Matrix-matrix product."""
    n = len(a)
    m = len(b[0])
    k = len(b)
    return [
        [sum(a[i][l] * b[l][j] for l in range(k)) for j in range(m)]
        for i in range(n)
    ]


def kalman_filter_bsts(y: list[float], params: dict) -> dict:
    """Kalman filter for the BSTS state-space model."""
    sigma_level = params["sigma_level"]
    sigma_slope = params["sigma_slope"]
    sigma_seasonal = params["sigma_seasonal"]
    sigma_irregular = params["sigma_irregular"]
    period = params["period"]
    n = len(y)
    state_dim = 2 + (period - 1)

    t = _build_transition(state_dim, period)
    z = _build_observation(state_dim)
    q = _build_process_noise(state_dim, sigma_level, sigma_slope, sigma_seasonal)
    h = sigma_irregular * sigma_irregular

    x = [0.0] * state_dim
    x[0] = y[0] if y else 0.0
    p = [[1e6 if i == j else 0.0 for j in range(state_dim)] for i in range(state_dim)]

    filtered: list[float] = []
    trend: list[float] = []
    slope: list[float] = []
    seasonal: list[float] = []
    log_lik: list[float] = []

    for t_idx in range(n):
        x_pred = _mat_vec(t, x)
        p_pred = _mat_mat(_mat_mat(t, p), [[t[j][k] for j in range(state_dim)] for k in range(state_dim)])
        for i in range(state_dim):
            for j in range(state_dim):
                p_pred[i][j] += q[i][j]

        y_pred = sum(z[i] * x_pred[i] for i in range(state_dim))
        v = y[t_idx] - y_pred
        f = sum(z[i] * p_pred[i][j] * z[j] for i in range(state_dim) for j in range(state_dim)) + h

        k = [sum(p_pred[i][j] * z[j] for j in range(state_dim)) / f if f > 0 else 0.0 for i in range(state_dim)]
        x = [x_pred[i] + k[i] * v for i in range(state_dim)]
        p = [
            [p_pred[i][j] - k[i] * sum(z[m] * p_pred[m][j] for m in range(state_dim)) for j in range(state_dim)]
            for i in range(state_dim)
        ]

        if f > 0:
            log_lik.append(-0.5 * (math.log(2 * math.pi * f) + v * v / f))

        filtered.append(y_pred)
        trend.append(x[0])
        slope.append(x[1])
        seasonal.append(x[2] if state_dim > 2 else 0.0)

    forecasts: list[float] = []
    x_forecast = x[:]
    for _ in range(N_FORECAST):
        x_forecast = _mat_vec(t, x_forecast)
        forecasts.append(sum(z[i] * x_forecast[i] for i in range(state_dim)))

    return {
        "filtered": filtered,
        "trend": trend,
        "slope": slope,
        "seasonal": seasonal,
        "forecasts": forecasts,
        "total_log_lik": sum(log_lik),
    }


def optimize_bsts(y: list[float], period: int) -> dict:
    """Grid search over variance parameters maximizing log-likelihood."""
    best = {
        "sigma_level": DEFAULT_SIGMA_LEVEL,
        "sigma_slope": 0.01,
        "sigma_seasonal": 0.05,
        "sigma_irregular": DEFAULT_SIGMA_IRREGULAR,
        "period": period,
        "log_lik": -math.inf,
    }

    for sl in _arange(0.01, 0.5, 0.05):
        for ss in _arange(0.001, 0.1, 0.01):
            for si in _arange(0.01, 0.3, 0.03):
                params = {
                    "sigma_level": sl,
                    "sigma_slope": ss,
                    "sigma_seasonal": 0.05,
                    "sigma_irregular": si,
                    "period": period,
                }
                total_log_lik = kalman_filter_bsts(y, params)["total_log_lik"]
                if total_log_lik > best["log_lik"]:
                    best = {**params, "log_lik": total_log_lik}

    return best


def _arange(start: float, stop: float, step: float) -> list[float]:
    """Inclusive range with float step (mirrors JS for-loop semantics)."""
    values: list[float] = []
    value = start
    while value <= stop + 1e-12:
        values.append(value)
        value += step
    return values


def bsts_signal(forecast_return: float) -> str:
    """Trading signal from the 1-step forecast return."""
    if forecast_return > 0.005:
        return "BUY"
    if forecast_return < -0.005:
        return "SELL"
    return "NEUTRAL"


def bsts_analysis(
    prices: list[float],
    period: int = DEFAULT_PERIOD,
    lookback: int = DEFAULT_LOOKBACK,
    auto_optimize: bool = True,
    sigma_level: float = DEFAULT_SIGMA_LEVEL,
    sigma_irregular: float = DEFAULT_SIGMA_IRREGULAR,
) -> BSTSResult | None:
    """Full BSTS analysis of a price series. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    log_prices = [math.log(max(0.01, p)) for p in prices]

    if auto_optimize:
        params = optimize_bsts(log_prices, period)
    else:
        params = {
            "sigma_level": sigma_level,
            "sigma_slope": 0.01,
            "sigma_seasonal": 0.05,
            "sigma_irregular": sigma_irregular,
            "period": period,
        }

    result = kalman_filter_bsts(log_prices, params)

    trend_exp = [math.exp(v) for v in result["trend"]]
    filtered_exp = [math.exp(v) for v in result["filtered"]]
    seasonal_exp = [math.exp(v) for v in result["seasonal"]]
    forecasts_exp = [math.exp(v) for v in result["forecasts"]]
    residuals = [log_prices[i] - result["filtered"][i] for i in range(len(log_prices))]

    current_price = prices[-1]
    forecast_price = forecasts_exp[0]
    forecast_return = (forecast_price - current_price) / current_price
    signal = bsts_signal(forecast_return)
    trend_contribution = trend_exp[-1] - current_price
    seasonal_contribution = seasonal_exp[-1]

    return BSTSResult(
        prices=prices,
        trend_exp=trend_exp,
        filtered_exp=filtered_exp,
        seasonal_exp=seasonal_exp,
        forecasts_exp=forecasts_exp,
        residuals=residuals,
        params=params,
        current_price=current_price,
        forecast_price=forecast_price,
        forecast_return=forecast_return,
        signal=signal,
        trend_contribution=trend_contribution,
        seasonal_contribution=seasonal_contribution,
        total_log_lik=result["total_log_lik"],
        trend=result["trend"],
        slope=result["slope"],
        seasonal=result["seasonal"],
        forecasts=result["forecasts"],
    )
