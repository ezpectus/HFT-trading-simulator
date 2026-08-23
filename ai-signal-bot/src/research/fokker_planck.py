"""Fokker-Planck Equation (probability density evolution).

Solves the forward Kolmogorov equation to track how the probability density
of returns evolves over time under drift and diffusion.
"""
from __future__ import annotations

import math

from src.research._common import compute_returns


MIN_PRICES = 50
DEFAULT_MODEL_TYPE = "ou"
DEFAULT_N_STEPS = 200
DEFAULT_DT = 0.01
DEFAULT_LOOKBACK = 100
DEFAULT_HORIZON = 10
N_GRID = 80


class FokkerPlanckResult:
    """Container for Fokker-Planck analysis results."""

    def __init__(
        self,
        x_grid: list[float],
        p0: list[float],
        final_p: list[float],
        history: list[list[float]],
        forecast_p: list[float],
        stationary_p: list[float],
        var5: float,
        median: float,
        current_return: float,
        signal: str,
        reason: str,
        kl_div: float,
        params: dict,
        dx: float,
    ) -> None:
        self.x_grid = x_grid
        self.p0 = p0
        self.final_p = final_p
        self.history = history
        self.forecast_p = forecast_p
        self.stationary_p = stationary_p
        self.var5 = var5
        self.median = median
        self.current_return = current_return
        self.signal = signal
        self.reason = reason
        self.kl_div = kl_div
        self.params = params
        self.dx = dx


def solve_fokker_planck(
    x_grid: list[float],
    p0: list[float],
    mu_fn,
    sigma_fn,
    dt: float,
    n_steps: int,
) -> dict:
    """Solve Fokker-Planck via explicit finite differences."""
    n = len(x_grid)
    dx = x_grid[1] - x_grid[0]
    p = p0[:]
    history = [p[:]]

    for step in range(n_steps):
        new_p = [0.0] * n
        for i in range(1, n - 1):
            sigma2 = sigma_fn(x_grid[i]) ** 2
            f_drift_l = mu_fn(x_grid[i - 1]) * p[i - 1]
            f_drift_r = mu_fn(x_grid[i + 1]) * p[i + 1]

            sigma2_l = sigma_fn(x_grid[i - 1]) ** 2
            sigma2_r = sigma_fn(x_grid[i + 1]) ** 2
            f_diff_l = -0.5 * (sigma2 * p[i] - sigma2_l * p[i - 1]) / dx
            f_diff_r = -0.5 * (sigma2_r * p[i + 1] - sigma2 * p[i]) / dx

            f_l = f_drift_l + f_diff_l
            f_r = f_drift_r + f_diff_r

            new_p[i] = max(0.0, p[i] - dt * (f_r - f_l) / (2 * dx))

        new_p[0] = 0.0
        new_p[n - 1] = 0.0

        total = sum(new_p) * dx
        if total > 0:
            new_p = [v / total for v in new_p]

        p = new_p
        if step % max(1, n_steps // 20) == 0:
            history.append(p[:])

    return {"final_p": p, "history": history}


def fp_signal(median: float, current_return: float) -> tuple[str, str]:
    """Signal from forecast median vs current return."""
    if median > current_return * 1.1:
        return "BULLISH_DENSITY", f"Forecast median = {median:.6f} > current = {current_return:.6f} (density shifting up)"
    if median < current_return * 0.9:
        return "BEARISH_DENSITY", f"Forecast median = {median:.6f} < current = {current_return:.6f} (density shifting down)"
    return "NEUTRAL", f"Forecast median = {median:.6f} ≈ current = {current_return:.6f} (stable)"


def fokker_planck_analysis(
    prices: list[float],
    model_type: str = DEFAULT_MODEL_TYPE,
    n_steps: int = DEFAULT_N_STEPS,
    dt: float = DEFAULT_DT,
    lookback: int = DEFAULT_LOOKBACK,
    horizon: int = DEFAULT_HORIZON,
) -> FokkerPlanckResult | None:
    """Full Fokker-Planck analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)

    mean_r = sum(returns) / len(returns)
    var_r = sum((r - mean_r) ** 2 for r in returns) / len(returns)
    std_r = math.sqrt(var_r)

    acf1 = 0.0
    for i in range(len(returns) - 1):
        acf1 += (returns[i] - mean_r) * (returns[i + 1] - mean_r)
    acf1 /= (len(returns) - 1) * var_r if var_r > 0 else 1.0
    kappa = -math.log(max(0.01, acf1)) if acf1 < 1 else 1.0
    theta = mean_r
    sigma_ou = std_r * math.sqrt(2 * kappa)
    mu_gbm = mean_r
    sigma_gbm = std_r

    x_min = mean_r - 4 * std_r
    x_max = mean_r + 4 * std_r
    dx = (x_max - x_min) / (N_GRID - 1)
    x_grid = [x_min + i * dx for i in range(N_GRID)]

    current_return = returns[-1]
    sigma_init = std_r * 0.5
    p0 = [
        math.exp(-((x - current_return) ** 2) / (2 * sigma_init ** 2)) / (sigma_init * math.sqrt(2 * math.pi))
        for x in x_grid
    ]
    p0_sum = sum(p0) * dx
    p0 = [v / p0_sum for v in p0]

    if model_type == "ou":
        mu_fn = lambda x: kappa * (theta - x)
        sigma_fn = lambda x: sigma_ou
    elif model_type == "gbm":
        mu_fn = lambda x: mu_gbm * x
        sigma_fn = lambda x: sigma_gbm * abs(x)
    else:
        mu_fn = lambda x: mu_gbm
        sigma_fn = lambda x: sigma_gbm

    result = solve_fokker_planck(x_grid, p0, mu_fn, sigma_fn, dt, n_steps)

    forecast_idx = min(len(result["history"]) - 1, int(horizon * n_steps / 20))
    forecast_p = result["history"][forecast_idx]

    stat_var = sigma_ou ** 2 / (2 * kappa)
    stationary_p = [
        math.exp(-((x - theta) ** 2) / (2 * stat_var)) / math.sqrt(2 * math.pi * stat_var)
        for x in x_grid
    ]

    cdf: list[float] = []
    cum_sum = 0.0
    for i in range(len(forecast_p)):
        cum_sum += forecast_p[i] * dx
        cdf.append(cum_sum)

    var5_idx = next((i for i, c in enumerate(cdf) if c >= 0.05), -1)
    var5 = x_grid[var5_idx] if var5_idx >= 0 else x_min
    median_idx = next((i for i, c in enumerate(cdf) if c >= 0.5), -1)
    median = x_grid[median_idx] if median_idx >= 0 else mean_r

    signal, reason = fp_signal(median, current_return)

    kl_div = 0.0
    for i in range(len(p0)):
        if p0[i] > 0 and forecast_p[i] > 0:
            kl_div += forecast_p[i] * math.log(forecast_p[i] / p0[i]) * dx

    return FokkerPlanckResult(
        x_grid=x_grid,
        p0=p0,
        final_p=result["final_p"],
        history=result["history"],
        forecast_p=forecast_p,
        stationary_p=stationary_p,
        var5=var5,
        median=median,
        current_return=current_return,
        signal=signal,
        reason=reason,
        kl_div=kl_div,
        params={"kappa": kappa, "theta": theta, "sigma_ou": sigma_ou, "mu_gbm": mu_gbm, "sigma_gbm": sigma_gbm},
        dx=dx,
    )
