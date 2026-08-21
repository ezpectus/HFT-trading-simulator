"""GARCH(1,1) volatility model for conditional variance forecasting.

Implements the standard GARCH(1,1) process with MLE parameter estimation.
Also provides EWMA (RiskMetrics) and Parkinson (high-low) volatility
estimators for comparison.
"""
from __future__ import annotations

import math

NAN = float("nan")
INF = float("inf")

MIN_VARIANCE = 1e-10
MIN_OMEGA = 1e-8
MIN_ALPHA = 1e-6
MAX_ALPHA = 0.999
MIN_BETA = 1e-6
MAX_BETA = 0.999
MAX_PERSISTENCE = 0.999

MIN_RETURNS = 30
DEFAULT_MAX_ITER = 100
DEFAULT_LEARNING_RATE = 0.01
DEFAULT_EWMA_LAMBDA = 0.94
DEFAULT_PARKINSON_PERIOD = 20
ANNUALIZATION = 252


class GARCHResult:
    """Container for GARCH(1,1) estimation results.

    Volatility series are annualized percent: vol = sqrt(var) * sqrt(252) * 100.
    """

    def __init__(
        self,
        omega: float,
        alpha: float,
        beta: float,
        persistence: float,
        half_life: float,
        forecast_variance: float,
        forecast_vol: float,
        current_vol: float,
        unconditional_variance: float,
        unconditional_vol: float,
        vol_series: list[float],
        variance_series: list[float],
        log_likelihood: float,
        n: int,
        last_variance: float,
        last_centered_return: float,
    ) -> None:
        self.omega = omega
        self.alpha = alpha
        self.beta = beta
        self.persistence = persistence
        self.half_life = half_life
        self.forecast_variance = forecast_variance
        self.forecast_vol = forecast_vol
        self.current_vol = current_vol
        self.unconditional_variance = unconditional_variance
        self.unconditional_vol = unconditional_vol
        self.vol_series = vol_series
        self.variance_series = variance_series
        self.log_likelihood = log_likelihood
        self.n = n
        self.last_variance = last_variance
        self.last_centered_return = last_centered_return


class EWMAResult:
    """Container for EWMA volatility estimation results."""

    def __init__(self, lambda_: float, current_vol: float, vol_series: list[float]) -> None:
        self.lambda_ = lambda_
        self.current_vol = current_vol
        self.vol_series = vol_series


class ParkinsonResult:
    """Container for Parkinson high-low volatility estimation results."""

    def __init__(self, current_vol: float, vol_series: list[float]) -> None:
        self.current_vol = current_vol
        self.vol_series = vol_series


def log_returns(prices: list[float]) -> list[float]:
    """Log returns: r_t = ln(P_t / P_{t-1}). Non-positive prices are skipped."""
    result: list[float] = []
    for i in range(1, len(prices)):
        if prices[i - 1] > 0 and prices[i] > 0:
            result.append(math.log(prices[i] / prices[i - 1]))
    return result


def _centered(returns: list[float]) -> tuple[list[float], float]:
    """Subtract the sample mean, return centered returns and variance0."""
    n = len(returns)
    mean = sum(returns) / n
    centered = [r - mean for r in returns]
    variance0 = sum(r * r for r in centered) / n
    if variance0 <= 0:
        variance0 = MIN_VARIANCE
    return centered, variance0


def _clip_params(omega: float, alpha: float, beta: float) -> tuple[float, float, float]:
    """Enforce parameter bounds and stationarity (alpha + beta < 1)."""
    omega = max(MIN_OMEGA, omega)
    alpha = max(MIN_ALPHA, min(MAX_ALPHA, alpha))
    beta = max(MIN_BETA, min(MAX_BETA, beta))
    persistence = alpha + beta
    if persistence > MAX_PERSISTENCE:
        scale = MAX_PERSISTENCE / persistence
        alpha *= scale
        beta *= scale
    return omega, alpha, beta


def _fit_garch_mle(
    centered: list[float],
    variance0: float,
    max_iter: int,
    learning_rate: float,
) -> tuple[float, float, float, list[float]]:
    """Gradient ascent on the Gaussian log-likelihood (sequential updates).

    dL/d(sigma^2_t) = 0.5 * (eps^2_t - sigma^2_t) / sigma^4_t
    Note: the UI's factor has the opposite sign (gradient descent); corrected here.
    """
    n = len(centered)
    omega = variance0 * 0.1
    alpha = 0.1
    beta = 0.85
    cond_var = [variance0] * n
    grad_omega = [0.0] * n
    grad_alpha = [0.0] * n
    grad_beta = [0.0] * n

    for _ in range(max_iter):
        for i in range(1, n):
            prev_var = cond_var[i - 1]
            prev_ret2 = centered[i - 1] * centered[i - 1]
            cond_var[i] = omega + alpha * prev_ret2 + beta * prev_var
            if cond_var[i] < MIN_VARIANCE:
                cond_var[i] = MIN_VARIANCE

            inv_var = 1.0 / cond_var[i]
            resid = centered[i]

            d_omega = 1.0 + beta * (grad_omega[i - 1] if i > 1 else 0.0)
            d_alpha = prev_ret2 + beta * (grad_alpha[i - 1] if i > 1 else 0.0)
            d_beta = prev_var + beta * (grad_beta[i - 1] if i > 1 else 0.0)

            grad_omega[i] = d_omega
            grad_alpha[i] = d_alpha
            grad_beta[i] = d_beta

            factor = 0.5 * (resid * resid - cond_var[i]) * inv_var * inv_var
            omega += learning_rate * factor * d_omega
            alpha += learning_rate * factor * d_alpha
            beta += learning_rate * factor * d_beta

            omega, alpha, beta = _clip_params(omega, alpha, beta)

    return omega, alpha, beta, cond_var


def _log_likelihood(centered: list[float], cond_var: list[float]) -> float:
    """Gaussian log-likelihood: -0.5 * sum [ ln(sigma^2_t) + eps^2_t / sigma^2_t ]."""
    total = 0.0
    for i in range(1, len(centered)):
        v = cond_var[i]
        total += math.log(v) + centered[i] * centered[i] / v
    return -0.5 * total


def fit_garch(
    returns: list[float],
    max_iter: int = DEFAULT_MAX_ITER,
    learning_rate: float = DEFAULT_LEARNING_RATE,
) -> GARCHResult | None:
    """Fit GARCH(1,1) to a return series. Returns None if fewer than 30 returns."""
    if not returns or len(returns) < MIN_RETURNS:
        return None

    centered, variance0 = _centered(returns)
    omega, alpha, beta, cond_var = _fit_garch_mle(centered, variance0, max_iter, learning_rate)

    persistence = alpha + beta
    half_life = math.log(0.5) / math.log(persistence) if 0 < persistence < 1 else INF
    last_variance = cond_var[-1]
    last_centered_return = centered[-1]
    forecast_variance = omega + alpha * last_centered_return * last_centered_return + beta * last_variance
    unconditional_variance = omega / (1 - persistence) if persistence < 1 else INF

    annual = math.sqrt(ANNUALIZATION) * 100.0
    vol_series = [math.sqrt(v) * annual for v in cond_var]

    return GARCHResult(
        omega=omega,
        alpha=alpha,
        beta=beta,
        persistence=persistence,
        half_life=half_life,
        forecast_variance=forecast_variance,
        forecast_vol=math.sqrt(forecast_variance) * annual,
        current_vol=vol_series[-1],
        unconditional_variance=unconditional_variance,
        unconditional_vol=math.sqrt(unconditional_variance) * annual if persistence < 1 else INF,
        vol_series=vol_series,
        variance_series=cond_var,
        log_likelihood=_log_likelihood(centered, cond_var),
        n=len(returns),
        last_variance=last_variance,
        last_centered_return=last_centered_return,
    )


def garch_forecast(result: GARCHResult, steps: int = 1) -> list[float]:
    """Multi-step annualized volatility forecast (percent).

    h=1: sigma^2 = omega + alpha * eps^2_t + beta * sigma^2_t
    h>1: sigma^2 = omega + (alpha + beta) * sigma^2_{t+h-1}
    """
    if result.n == 0 or steps <= 0:
        return []

    annual = math.sqrt(ANNUALIZATION) * 100.0
    forecasts: list[float] = []
    var_t = result.last_variance
    eps2 = result.last_centered_return * result.last_centered_return

    for h in range(1, steps + 1):
        if h == 1:
            var_t = result.omega + result.alpha * eps2 + result.beta * var_t
        else:
            var_t = result.omega + result.persistence * var_t
        forecasts.append(math.sqrt(var_t) * annual)

    return forecasts


def ewma_volatility(
    returns: list[float],
    lambda_: float = DEFAULT_EWMA_LAMBDA,
) -> EWMAResult | None:
    """EWMA volatility: sigma^2_t = lambda * sigma^2_{t-1} + (1-lambda) * eps^2_t.

    Returns None if fewer than 10 returns.
    """
    if not returns or len(returns) < 10:
        return None

    centered, _ = _centered(returns)
    annual = math.sqrt(ANNUALIZATION) * 100.0
    ewma_var = centered[0] * centered[0]
    vol_series = [math.sqrt(ewma_var) * annual]

    for i in range(1, len(centered)):
        ewma_var = lambda_ * ewma_var + (1 - lambda_) * centered[i] * centered[i]
        vol_series.append(math.sqrt(ewma_var) * annual)

    return EWMAResult(lambda_=lambda_, current_vol=vol_series[-1], vol_series=vol_series)


def parkinson_volatility(
    highs: list[float],
    lows: list[float],
    period: int = DEFAULT_PARKINSON_PERIOD,
) -> ParkinsonResult | None:
    """Parkinson high-low volatility: sigma^2 = sum(ln^2(H/L)) / (4 * n * ln2).

    Returns None if fewer than `period` candles or lengths mismatch.
    """
    if not highs or len(highs) < period or len(lows) != len(highs):
        return None

    annual = math.sqrt(ANNUALIZATION) * 100.0
    vol_series: list[float] = []
    n = len(highs)

    for i in range(period - 1, n):
        sum_sq = 0.0
        for j in range(i - period + 1, i + 1):
            if highs[j] > 0 and lows[j] > 0:
                hl = math.log(highs[j] / lows[j])
                sum_sq += hl * hl
        park_var = sum_sq / (4 * period * math.log(2))
        vol_series.append(math.sqrt(park_var) * annual)

    return ParkinsonResult(current_vol=vol_series[-1], vol_series=vol_series)


def garch_volatility(
    prices: list[float],
    max_iter: int = DEFAULT_MAX_ITER,
    learning_rate: float = DEFAULT_LEARNING_RATE,
) -> GARCHResult | None:
    """Fit GARCH(1,1) directly on a price series (log returns computed internally)."""
    if not prices or len(prices) < MIN_RETURNS + 1:
        return None
    returns = log_returns(prices)
    return fit_garch(returns, max_iter=max_iter, learning_rate=learning_rate)


def classify_regime(current_vol: float, min_vol: float, max_vol: float) -> str:
    """Classify volatility regime: LOW / MEDIUM / HIGH (mirrors UI thresholds)."""
    vol_range = max_vol - min_vol
    if vol_range <= 0:
        return "MEDIUM"
    if current_vol < min_vol + vol_range * 0.33:
        return "LOW"
    if current_vol > min_vol + vol_range * 0.66:
        return "HIGH"
    return "MEDIUM"
