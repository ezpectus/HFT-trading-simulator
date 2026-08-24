"""Koopman Operator Theory (EDMD) for data-driven dynamical systems.

Lifts nonlinear dynamics into a high-dimensional linear space via the
Koopman operator, enabling spectral analysis and forecasting.
"""
from __future__ import annotations

import math
import random

from src.research._common import compute_returns

MIN_PRICES = 50
DEFAULT_MAX_POLY = 2
DEFAULT_N_FOURIER = 3
DEFAULT_LOOKBACK = 100
DEFAULT_FORECAST_STEPS = 10
REGULARIZATION = 0.01
MAX_MODES = 5


class KoopmanResult:
    """Container for Koopman operator analysis results."""

    def __init__(
        self,
        eigenvalues: list[dict],
        forecasts: list[float],
        recon_error: float,
        signal: str,
        reason: str,
        dominant_modulus: float,
        dim: int,
        actual_returns: list[float],
    ) -> None:
        self.eigenvalues = eigenvalues
        self.forecasts = forecasts
        self.recon_error = recon_error
        self.signal = signal
        self.reason = reason
        self.dominant_modulus = dominant_modulus
        self.dim = dim
        self.actual_returns = actual_returns


def dictionary(x: float, max_poly: int = DEFAULT_MAX_POLY, n_fourier: int = DEFAULT_N_FOURIER) -> list[float]:
    """Dictionary features: constant + polynomial + Fourier."""
    features = [1.0]
    for p in range(1, max_poly + 1):
        features.append(x ** p)
    for f in range(1, n_fourier + 1):
        features.append(math.sin(2 * math.pi * f * x))
        features.append(math.cos(2 * math.pi * f * x))
    return features


def edmd(states: list[float], next_states: list[float], dict_fn) -> dict:
    """Extended Dynamic Mode Decomposition: K ~ A * G^-1."""
    n = len(states)
    dim = len(dict_fn(states[0]))

    psi = [dict_fn(s) for s in states]
    psi_next = [dict_fn(s) for s in next_states]

    g = [[0.0] * dim for _ in range(dim)]
    a = [[0.0] * dim for _ in range(dim)]
    for i in range(dim):
        for j in range(dim):
            g[i][j] = sum(psi[k][i] * psi[k][j] for k in range(n))
            a[i][j] = sum(psi_next[k][i] * psi[k][j] for k in range(n))

    for i in range(dim):
        g[i][i] += REGULARIZATION

    aug = [g[i] + [a[j][i] for j in range(dim)] for i in range(dim)]
    for col in range(dim):
        max_row = col
        for r in range(col + 1, dim):
            if abs(aug[r][col]) > abs(aug[max_row][col]):
                max_row = r
        aug[col], aug[max_row] = aug[max_row], aug[col]
        if abs(aug[col][col]) < 1e-12:
            continue
        for r in range(col + 1, dim):
            factor = aug[r][col] / aug[col][col]
            for c in range(col, 2 * dim):
                aug[r][c] -= factor * aug[col][c]

    kt = [[0.0] * dim for _ in range(dim)]
    for i in range(dim - 1, -1, -1):
        for j in range(dim):
            kt[i][j] = aug[i][dim + j]
            for k in range(i + 1, dim):
                kt[i][j] -= aug[i][k] * kt[k][j]
            kt[i][j] /= aug[i][i] if abs(aug[i][i]) > 1e-12 else 1.0

    k = [[kt[j][i] for j in range(dim)] for i in range(dim)]
    return {"K": k, "Psi": psi, "PsiNext": psi_next, "dim": dim}


def power_iteration(m: list[list[float]], n_iter: int = 100, seed: int | None = None) -> dict:
    """Dominant eigenvalue via power iteration."""
    rng = random.Random(seed)
    n = len(m)
    v = [rng.random() - 0.5 for _ in range(n)]
    norm = math.sqrt(sum(x * x for x in v))
    v = [x / norm for x in v]

    for _ in range(n_iter):
        mv = [sum(m[i][j] * v[j] for j in range(n)) for i in range(n)]
        norm = math.sqrt(sum(x * x for x in mv))
        if norm < 1e-10:
            break
        v = [x / norm for x in mv]

    mv = [sum(m[i][j] * v[j] for j in range(n)) for i in range(n)]
    eigenvalue = sum(v[i] * mv[i] for i in range(n))
    return {"eigenvalue": eigenvalue, "eigenvector": v}


def koopman_signal(dominant_modulus: float, forecast_dir: float) -> tuple[str, str]:
    """Signal from dominant eigenvalue modulus and forecast direction."""
    if dominant_modulus > 0.95:
        signal = "PERSISTENT_DYNAMICS"
        reason = f"Dominant eigenvalue |λ|={dominant_modulus:.4f} (near-unit, persistent dynamics)"
    elif dominant_modulus < 0.5:
        signal = "FAST_DECAY"
        reason = f"Dominant eigenvalue |λ|={dominant_modulus:.4f} (fast decay, mean-reverting)"
    else:
        signal = "NEUTRAL"
        reason = f"Dominant eigenvalue |λ|={dominant_modulus:.4f} (moderate persistence)"

    if forecast_dir > 0.001:
        signal = "BULLISH_PERSISTENT" if signal == "PERSISTENT_DYNAMICS" else "BULLISH"
        reason += f" | Forecast: upward ({forecast_dir:.6f})"
    elif forecast_dir < -0.001:
        signal = "BEARISH_PERSISTENT" if signal == "PERSISTENT_DYNAMICS" else "BEARISH"
        reason += f" | Forecast: downward ({forecast_dir:.6f})"

    return signal, reason


def koopman_analysis(
    prices: list[float],
    max_poly: int = DEFAULT_MAX_POLY,
    n_fourier: int = DEFAULT_N_FOURIER,
    lookback: int = DEFAULT_LOOKBACK,
    forecast_steps: int = DEFAULT_FORECAST_STEPS,
    seed: int | None = None,
) -> KoopmanResult | None:
    """Full Koopman analysis of a price series. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)
    mean = sum(returns) / len(returns)
    std = math.sqrt(sum((r - mean) ** 2 for r in returns) / len(returns))
    norm_r = [(r - mean) / std if std > 0 else 0.0 for r in returns]

    states = norm_r[:-1]
    next_states = norm_r[1:]
    def dict_fn(x):
        return dictionary(x, max_poly, n_fourier)

    result = edmd(states, next_states, dict_fn)
    k = result["K"]
    psi = result["Psi"]
    dim = result["dim"]

    eigenvalues: list[dict] = []
    m = [row[:] for row in k]
    for _ in range(min(MAX_MODES, dim)):
        eig = power_iteration(m, 200, seed)
        if abs(eig["eigenvalue"]) < 1e-8:
            break
        eigenvalues.append(
            {
                "value": eig["eigenvalue"],
                "modulus": abs(eig["eigenvalue"]),
                "phase": math.atan2(0.0, eig["eigenvalue"]),
            }
        )
        for r in range(dim):
            for c in range(dim):
                m[r][c] -= eig["eigenvalue"] * eig["eigenvector"][r] * eig["eigenvector"][c]

    current_psi = dict_fn(norm_r[-1])
    psi_vec = current_psi[:]
    forecasts: list[float] = []
    for _ in range(forecast_steps):
        psi_vec = [sum(k[i][j] * psi_vec[j] for j in range(dim)) for i in range(dim)]
        forecasts.append(psi_vec[1] * std + mean)

    recon_error = 0.0
    for t in range(len(states)):
        predicted = [sum(k[i][j] * psi[t][j] for j in range(dim)) for i in range(dim)]
        error = predicted[1] - next_states[t]
        recon_error += error * error
    recon_error /= len(states)

    dominant_modulus = eigenvalues[0]["modulus"] if eigenvalues else 0.0
    last_actual = norm_r[-1] * std + mean
    forecast_dir = forecasts[-1] - last_actual if forecasts else 0.0
    signal, reason = koopman_signal(dominant_modulus, forecast_dir)

    return KoopmanResult(
        eigenvalues=eigenvalues,
        forecasts=forecasts,
        recon_error=recon_error,
        signal=signal,
        reason=reason,
        dominant_modulus=dominant_modulus,
        dim=dim,
        actual_returns=returns[-forecast_steps:],
    )
