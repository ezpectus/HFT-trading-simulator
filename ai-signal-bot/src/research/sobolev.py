"""Sobolev Space Regularization (smoothness-constrained estimation).

Uses Sobolev space norms to regularize estimates, enforcing smoothness
constraints on functions estimated from noisy financial data.

    Sobolev space W^{k,p}: functions with k weak derivatives in L^p
    Norm: ||f||_{W^{k,2}}² = Σ_{|α|≤k} ∫ |D^α f|² dx

    Tikhonov regularization in H^s (Sobolev Hilbert space):
    min_f ||y - f||²_{L²} + λ·||f||²_{H^s}
    = min_f Σ(y_i - f(x_i))² + λ·∫|f^(s)(x)|²dx

    Representer theorem: f* = Σ_i α_i·K_s(x_i, ·)
    where K_s is the Sobolev kernel (Matérn kernel of order s)

    Matérn kernel: K_s(x,y) = (2^{1-s}/Γ(s))·(√(2s)|x-y|)^s·K_s(√(2s)|x-y|)
    s=1: σ²·exp(-r);  s=2: σ²·(1+√3r)·exp(-√3r)

Applications: smooth volatility estimation, noise removal,
derivative pricing with smoothness constraints, trend extraction.

Ported from UI-only SobolevSpaceRegularization.jsx into trading logic.
Reference: future_development.md §0.2 — extended model list.
"""
from __future__ import annotations

import math
import random

MIN_PRICES = 50
DEFAULT_S = 2
DEFAULT_LAMBDA = 0.1
DEFAULT_LOOKBACK = 80
DEFAULT_NOISE_LEVEL = 0.5
DEFAULT_SEED = 42
VOL_WINDOW = 10
SIGMA = 1.0
LENGTH_SCALE = 0.1
LAMBDA_SWEEP = [0.001, 0.01, 0.1, 1.0, 10.0]


class SobolevResult:
    """Container for Sobolev regularization analysis results."""

    def __init__(
        self,
        x_data: list[float],
        y_data: list[float],
        norm_v: list[float],
        result: dict,
        smooth_predictions: list[float],
        x_grid: list[float],
        sweep_results: list[dict],
        l_curve: list[dict],
        signal: str,
        reason: str,
        l2_norm: float,
        h1_semi: float,
        residual: float,
    ) -> None:
        self.x_data = x_data
        self.y_data = y_data
        self.norm_v = norm_v
        self.result = result
        self.smooth_predictions = smooth_predictions
        self.x_grid = x_grid
        self.sweep_results = sweep_results
        self.l_curve = l_curve
        self.signal = signal
        self.reason = reason
        self.l2_norm = l2_norm
        self.h1_semi = h1_semi
        self.residual = residual


def compute_returns(prices: list[float]) -> list[float]:
    """Simple returns."""
    return [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]


def matern_kernel(
    x: float,
    y: float,
    s: int,
    sigma: float = SIGMA,
    length_scale: float = LENGTH_SCALE,
) -> float:
    """Matérn kernel (simplified for s=1, s=2)."""
    r = abs(x - y) / length_scale
    if r < 1e-10:
        return sigma * sigma
    if s == 1:
        return sigma * sigma * math.exp(-r)
    if s == 2:
        arg = math.sqrt(3) * r
        return sigma * sigma * (1 + arg) * math.exp(-arg)
    # General approximation
    return sigma * sigma * math.exp(-r * r / 2)


def sobolev_regression(
    x_data: list[float],
    y_data: list[float],
    s: int,
    lambda_: float,
    sigma: float = SIGMA,
    length_scale: float = LENGTH_SCALE,
) -> dict:
    """Solve Tikhonov in Sobolev space via kernel ridge regression."""
    n = len(x_data)

    # Build kernel matrix
    k = [[matern_kernel(x_data[i], x_data[j], s, sigma, length_scale) for j in range(n)] for i in range(n)]

    # Solve (K + λI)α = y
    aug = [k[i][:] + [y_data[i]] for i in range(n)]
    for i in range(n):
        aug[i][i] += lambda_

    # Gaussian elimination with partial pivoting
    for col in range(n):
        max_row = col
        for r in range(col + 1, n):
            if abs(aug[r][col]) > abs(aug[max_row][col]):
                max_row = r
        aug[col], aug[max_row] = aug[max_row], aug[col]
        if abs(aug[col][col]) < 1e-12:
            continue
        for r in range(col + 1, n):
            factor = aug[r][col] / aug[col][col]
            for c in range(col, n + 1):
                aug[r][c] -= factor * aug[col][c]

    alpha = [0.0] * n
    for i in range(n - 1, -1, -1):
        alpha[i] = aug[i][n]
        for j in range(i + 1, n):
            alpha[i] -= aug[i][j] * alpha[j]
        alpha[i] /= aug[i][i] if abs(aug[i][i]) > 1e-12 else 1.0

    # Predict function
    def predict(x: float) -> float:
        total = 0.0
        for i in range(n):
            total += alpha[i] * matern_kernel(x_data[i], x, s, sigma, length_scale)
        return total

    # Compute Sobolev norm of solution (approximate: L² + derivative penalty)
    predictions = [predict(x) for x in x_data]
    l2_norm = math.sqrt(sum(v * v for v in predictions) / n)

    # First derivative (finite difference)
    h1_semi = 0.0
    for i in range(1, n):
        h1_semi += ((predictions[i] - predictions[i - 1]) / (x_data[i] - x_data[i - 1] + 1e-10)) ** 2
    h1_semi = math.sqrt(h1_semi / (n - 1))

    # Residual
    residual = math.sqrt(sum((y_data[i] - predictions[i]) ** 2 for i in range(n)) / n)

    return {"predict": predict, "alpha": alpha, "predictions": predictions, "l2_norm": l2_norm, "h1_semi": h1_semi, "residual": residual}


def sobolev_signal(lambda_: float) -> tuple[str, str]:
    """Signal from regularization strength."""
    if lambda_ < 0.01:
        return "OVERFIT", f"λ={lambda_} (low regularization, overfitting noise)"
    if lambda_ > 5:
        return "OVERSMOOTH", f"λ={lambda_} (high regularization, oversmoothing signal)"
    return "BALANCED", f"λ={lambda_} (balanced regularization)"


def sobolev_analysis(
    prices: list[float],
    s: int = DEFAULT_S,
    lambda_: float = DEFAULT_LAMBDA,
    lookback: int = DEFAULT_LOOKBACK,
    noise_level: float = DEFAULT_NOISE_LEVEL,
    seed: int = DEFAULT_SEED,
) -> SobolevResult | None:
    """Full Sobolev regularization analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)

    # Use rolling volatility as signal
    rolling_vol = []
    for i in range(VOL_WINDOW, len(returns)):
        slice_ = returns[i - VOL_WINDOW : i]
        m = sum(slice_) / len(slice_)
        v = math.sqrt(sum((r - m) ** 2 for r in slice_) / len(slice_))
        rolling_vol.append(v)

    if len(rolling_vol) < 10:
        return None

    # Normalize
    mean_v = sum(rolling_vol) / len(rolling_vol)
    std_v = math.sqrt(sum((v - mean_v) ** 2 for v in rolling_vol) / len(rolling_vol))
    norm_v = [(v - mean_v) / std_v if std_v > 0 else 0.0 for v in rolling_vol]

    # Add synthetic noise (seeded for determinism)
    rng = random.Random(seed)
    noisy = [v + (rng.random() - 0.5) * noise_level for v in norm_v]

    # x-axis: normalized time
    n = len(noisy)
    x_data = [i / n for i in range(n)]
    y_data = noisy

    # Sobolev regression
    result = sobolev_regression(x_data, y_data, s, lambda_, SIGMA, LENGTH_SCALE)

    # Compare with different regularization levels
    sweep_results = []
    for l in LAMBDA_SWEEP:
        r = sobolev_regression(x_data, y_data, s, l, SIGMA, LENGTH_SCALE)
        sweep_results.append({"lambda": l, "residual": r["residual"], "h1_semi": r["h1_semi"], "l2_norm": r["l2_norm"]})

    # L-curve: log(residual) vs log(smoothness)
    l_curve = [
        {
            "log_res": math.log(r["residual"] + 1e-10),
            "log_smooth": math.log(r["h1_semi"] + 1e-10),
            "lambda": r["lambda"],
        }
        for r in sweep_results
    ]

    # Predictions on grid
    x_grid = [i / 100 for i in range(101)]
    smooth_predictions = [result["predict"](x) for x in x_grid]

    signal, reason = sobolev_signal(lambda_)

    return SobolevResult(
        x_data=x_data,
        y_data=y_data,
        norm_v=norm_v,
        result=result,
        smooth_predictions=smooth_predictions,
        x_grid=x_grid,
        sweep_results=sweep_results,
        l_curve=l_curve,
        signal=signal,
        reason=reason,
        l2_norm=result["l2_norm"],
        h1_semi=result["h1_semi"],
        residual=result["residual"],
    )
