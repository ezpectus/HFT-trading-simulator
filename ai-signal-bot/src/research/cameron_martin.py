"""Cameron-Martin Formula (Gaussian shift theorem for drift).

Uses the Cameron-Martin theorem to quantify how a deterministic shift
in the drift of a Gaussian process changes the probability measure,
enabling drift-aware signal detection.
"""
from __future__ import annotations

import math

from src.research._common import compute_returns

MIN_PRICES = 60
DEFAULT_LOOKBACK = 200
DEFAULT_WINDOW_SIZE = 30
DEFAULT_SHIFT_MODE = "constant"
GRID_POINTS = 81


class CmResult:
    """Container for Cameron-Martin analysis results."""

    def __init__(
        self,
        comparisons: list[dict],
        grid: list[dict],
        cum_trajectory: list[dict],
        current: dict,
        signal: str,
        reason: str,
        mu0: float,
        sig0: float,
        n: int,
    ) -> None:
        self.comparisons = comparisons
        self.grid = grid
        self.cum_trajectory = cum_trajectory
        self.current = current
        self.signal = signal
        self.reason = reason
        self.mu0 = mu0
        self.sig0 = sig0
        self.n = n


def shift_function(mode: str, t: int, n: int, mu0: float) -> float:
    """Deterministic shift function h(t)."""
    if mode == "constant":
        return mu0 * 2
    if mode == "linear":
        return mu0 * (1 + t / n)
    if mode == "sinusoidal":
        return mu0 * 2 * math.sin(2 * math.pi * t / 20)
    # mixed
    return mu0 * (1 + math.sin(t / 10) * 0.5)


def cameron_martin_analysis(
    prices: list[float],
    lookback: int = DEFAULT_LOOKBACK,
    window_size: int = DEFAULT_WINDOW_SIZE,
    shift_mode: str = DEFAULT_SHIFT_MODE,
) -> CmResult | None:
    """Full Cameron-Martin analysis. None if insufficient data."""
    if not prices or len(prices) < lookback:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)

    n = len(returns)
    if n < window_size * 3:
        return None

    # Estimate baseline Gaussian parameters
    mu0 = sum(returns) / n
    sig0 = math.sqrt(sum((r - mu0) ** 2 for r in returns) / n)

    # Cameron-Martin log-likelihood ratio for each window
    comparisons = []
    step = max(3, window_size // 5)
    i = 0
    while i + window_size <= n:
        window = returns[i : i + window_size]
        mu_w = sum(window) / len(window)
        sig_w = math.sqrt(sum((r - mu_w) ** 2 for r in window) / len(window))

        # Cameron-Martin inner product: <h, x> = Σ h_t·x_t/σ²
        # ||h||² = Σ h_t²/σ²
        inner_prod = 0.0
        h_norm_sq = 0.0
        for t in range(window_size):
            h_t = shift_function(shift_mode, i + t, n, mu0)
            x_t = window[t]
            inner_prod += h_t * x_t / (sig0 * sig0)
            h_norm_sq += h_t * h_t / (sig0 * sig0)

        # Log RN derivative: <h, x> - 1/2·||h||²
        log_rn = inner_prod - 0.5 * h_norm_sq
        rn_derivative = math.exp(log_rn)

        # Optimal shift: h* = argmax E[log dP_h/dP] = actual drift
        optimal_shift = mu_w
        shift_efficiency = mu_w / (shift_function(shift_mode, i + window_size // 2, n, mu0) + 1e-10)

        comparisons.append(
            {
                "idx": i,
                "log_rn": log_rn,
                "rn_derivative": rn_derivative,
                "inner_prod": inner_prod,
                "h_norm_sq": h_norm_sq,
                "mu_w": mu_w,
                "sig_w": sig_w,
                "optimal_shift": optimal_shift,
                "shift_efficiency": shift_efficiency,
            }
        )
        i += step

    # Cameron-Martin density on grid (for visualization)
    grid = []
    h_rep = shift_function(shift_mode, n // 2, n, mu0)
    for i in range(GRID_POINTS):
        x = -5 + i * 10 / (GRID_POINTS - 1)  # standardized x
        log_rn = h_rep * x / sig0 - 0.5 * h_rep * h_rep / (sig0 * sig0)
        grid.append({"x": x, "rn": math.exp(log_rn), "log_rn": log_rn})

    # Cumulative Cameron-Martin trajectory
    cum_log_rn = 0.0
    cum_trajectory = []
    for i in range(n):
        h_t = shift_function(shift_mode, i, n, mu0)
        cum_log_rn += h_t * returns[i] / (sig0 * sig0) - 0.5 * h_t * h_t / (sig0 * sig0)
        cum_trajectory.append({"idx": i, "cum_log_rn": cum_log_rn})

    # Current state
    current = comparisons[-1]
    log_rn = current["log_rn"]
    if log_rn > 2:
        signal = "STRONG_DRIFT_ALIGNMENT"
        reason = f"Cameron-Martin LR={log_rn:.4f} (shift h aligns with observed drift)"
    elif log_rn > 0.5:
        signal = "DRIFT_PRESENT"
        reason = f"Cameron-Martin LR={log_rn:.4f} (moderate drift alignment)"
    elif log_rn < -2:
        signal = "ANTI_DRIFT"
        reason = f"Cameron-Martin LR={log_rn:.4f} (shift opposes observed data)"
    else:
        signal = "NO_DRIFT_SHIFT"
        reason = f"Cameron-Martin LR={log_rn:.4f} (no significant drift shift)"

    return CmResult(
        comparisons=comparisons,
        grid=grid,
        cum_trajectory=cum_trajectory,
        current=current,
        signal=signal,
        reason=reason,
        mu0=mu0,
        sig0=sig0,
        n=n,
    )
