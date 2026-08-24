"""Riesz Representation (linear functional as inner product).

Uses the Riesz representation theorem to represent linear functionals
on Hilbert spaces as inner products, enabling optimal signal extraction.
"""
from __future__ import annotations

import math

from src.research._common import compute_returns

MIN_PRICES = 60
DEFAULT_LOOKBACK = 120
DEFAULT_N_FEATURES = 8
DEFAULT_LAMBDA = 0.1


class RieszResult:
    """Container for Riesz representation analysis results."""

    def __init__(
        self,
        u: list[float],
        feature_importance: list[dict],
        riesz_norm: float,
        l_values: list[dict],
        correlation: float,
        current_l: float,
        signal: str,
        reason: str,
        dominant: dict,
        n_features: int,
    ) -> None:
        self.u = u
        self.feature_importance = feature_importance
        self.riesz_norm = riesz_norm
        self.l_values = l_values
        self.correlation = correlation
        self.current_l = current_l
        self.signal = signal
        self.reason = reason
        self.dominant = dominant
        self.n_features = n_features


def riesz_representer(x: list[list[float]], y: list[float], lambda_: float) -> list[float]:
    """Solve (K + λI)u = L via Gaussian elimination with partial pivoting."""
    n_features = len(x[0]) if x else 0
    n = len(x)

    # Gram matrix K = XᵀX/N
    k = [[0.0] * n_features for _ in range(n_features)]
    for i in range(n_features):
        for j in range(n_features):
            k[i][j] = sum(x[k][i] * x[k][j] for k in range(n)) / n

    # Linear functional L = Xᵀy/N
    l_vec = [0.0] * n_features
    for i in range(n_features):
        l_vec[i] = sum(x[k][i] * y[k] for k in range(n)) / n

    # Solve (K + λI)u = L
    a = [k[i][:] for i in range(n_features)]
    b = l_vec[:]
    for i in range(n_features):
        a[i][i] += lambda_

    # Gaussian elimination with partial pivoting
    for i in range(n_features):
        max_row = i
        for k in range(i + 1, n_features):
            if abs(a[k][i]) > abs(a[max_row][i]):
                max_row = k
        a[i], a[max_row] = a[max_row], a[i]
        b[i], b[max_row] = b[max_row], b[i]

        if abs(a[i][i]) < 1e-12:
            continue

        for k in range(i + 1, n_features):
            factor = a[k][i] / a[i][i]
            for j in range(i, n_features):
                a[k][j] -= factor * a[i][j]
            b[k] -= factor * b[i]

    # Back substitution
    u = [0.0] * n_features
    for i in range(n_features - 1, -1, -1):
        total = b[i]
        for j in range(i + 1, n_features):
            total -= a[i][j] * u[j]
        u[i] = total / a[i][i] if abs(a[i][i]) > 1e-12 else 0.0

    return u


def riesz_signal(current_l: float) -> tuple[str, str]:
    """Signal from the Riesz functional value at current features."""
    if current_l > 0.002:
        return "RIESZ_LONG", f"Riesz functional L(f) = {current_l:.6f} > 0 (bullish signal)"
    if current_l < -0.002:
        return "RIESZ_SHORT", f"Riesz functional L(f) = {current_l:.6f} < 0 (bearish signal)"
    return "NEUTRAL", f"Riesz functional L(f) = {current_l:.6f} (neutral)"


def riesz_analysis(
    prices: list[float],
    lookback: int = DEFAULT_LOOKBACK,
    n_features: int = DEFAULT_N_FEATURES,
    lambda_: float = DEFAULT_LAMBDA,
) -> RieszResult | None:
    """Full Riesz representation analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)

    n = len(returns)
    if n < n_features * 3:
        return None

    # Build feature matrix: lagged returns as features
    x = []
    y = []
    for i in range(n_features, n):
        x.append([returns[i - j] for j in range(1, n_features + 1)])
        y.append(returns[i])

    n_samples = len(x)

    # Riesz representer: u = (K + λI)^{-1}·L
    u = riesz_representer(x, y, lambda_)

    # Feature importance = |u_i| (Riesz weights)
    feature_importance = [{"lag": i + 1, "weight": u[i], "abs_weight": abs(u[i])} for i in range(n_features)]
    total_weight = sum(f["abs_weight"] for f in feature_importance)
    normalized_importance = [
        {**f, "norm": f["abs_weight"] / (total_weight + 1e-10)} for f in feature_importance
    ]

    # ||L|| = ||u|| (Riesz norm equality)
    riesz_norm = math.sqrt(sum(v * v for v in u))

    # Compute L(f) for each historical point
    l_values = []
    for k in range(n_samples):
        inner_prod = sum(x[k][i] * u[i] for i in range(n_features))
        l_values.append({"idx": k + n_features, "lf": inner_prod, "actual": y[k]})

    # Prediction: L(f) = <f, u> should correlate with y
    mean_l = sum(v["lf"] for v in l_values) / len(l_values)
    mean_y = sum(v["actual"] for v in l_values) / len(l_values)
    cov = 0.0
    var_l = 0.0
    var_y = 0.0
    for v in l_values:
        cov += (v["lf"] - mean_l) * (v["actual"] - mean_y)
        var_l += (v["lf"] - mean_l) ** 2
        var_y += (v["actual"] - mean_y) ** 2
    correlation = cov / (math.sqrt(var_l * var_y) + 1e-10)

    # Current signal
    current_features = [returns[n - j] for j in range(1, n_features + 1)]
    current_l = sum(current_features[i] * u[i] for i in range(n_features))

    signal, reason = riesz_signal(current_l)

    # Dominant feature
    dominant = max(normalized_importance, key=lambda f: f["abs_weight"])

    return RieszResult(
        u=u,
        feature_importance=normalized_importance,
        riesz_norm=riesz_norm,
        l_values=l_values,
        correlation=correlation,
        current_l=current_l,
        signal=signal,
        reason=reason,
        dominant=dominant,
        n_features=n_features,
    )
