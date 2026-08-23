"""Rough Volatility (rBergomi model) simulation.

Volatility follows a fractional Brownian motion with Hurst exponent H < 1/2,
capturing the roughness observed in real volatility surfaces.
"""
from __future__ import annotations

import math
import random

MIN_PRICES = 40
DEFAULT_ETA = 1.5
DEFAULT_RHO = -0.7
DEFAULT_T = 30 / 365
DEFAULT_N_STEPS = 50
DEFAULT_N_PATHS = 50
HURST_SCALES = [1, 2, 5, 10, 20]


class RBergomiResult:
    """Container for rBergomi simulation results."""

    def __init__(
        self,
        paths: list[list[float]],
        vol_paths: list[list[float]],
        mean_vol: list[float],
        mean_price_path: list[float],
        mean_price: float,
        p5: float,
        p95: float,
        var_swaps: list[float],
        atm_vol: float,
        skew: float,
        est_h: float,
        used_h: float,
        xi0: float,
        expected_return: float,
        signal: str,
        vol_regime: str,
        n_steps: int,
        n_paths: int,
    ) -> None:
        self.paths = paths
        self.vol_paths = vol_paths
        self.mean_vol = mean_vol
        self.mean_price_path = mean_price_path
        self.mean_price = mean_price
        self.p5 = p5
        self.p95 = p95
        self.var_swaps = var_swaps
        self.atm_vol = atm_vol
        self.skew = skew
        self.est_h = est_h
        self.used_h = used_h
        self.xi0 = xi0
        self.expected_return = expected_return
        self.signal = signal
        self.vol_regime = vol_regime
        self.n_steps = n_steps
        self.n_paths = n_paths


def frac_gaussian_noise(n: int, h: float, seed: int | None = None) -> list[float]:
    """Fractional Gaussian noise via Cholesky decomposition."""
    rng = random.Random(seed)
    cov = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            diff = abs(i - j)
            cov[i][j] = 0.5 * (
                abs(i - j + 1) ** (2 * h)
                + abs(i - j - 1) ** (2 * h)
                - 2 * diff ** (2 * h)
            )

    chol = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1):
            total = cov[i][j]
            for k in range(j):
                total -= chol[i][k] * chol[j][k]
            if i == j:
                chol[i][j] = math.sqrt(max(1e-10, total))
            else:
                chol[i][j] = total / chol[j][j] if chol[j][j] > 0 else 0.0

    fgn = [0.0] * n
    for i in range(n):
        z = rng.gauss(0, 1)
        for j in range(i + 1):
            fgn[i] += chol[i][j] * z
    return fgn


def fbm(n: int, h: float, seed: int | None = None) -> list[float]:
    """Fractional Brownian motion (cumulative sum of fGn)."""
    gn = frac_gaussian_noise(n, h, seed)
    bm = [0.0]
    for i in range(n - 1):
        bm.append(bm[i] + gn[i])
    return bm


def simulate_rbergomi(
    h: float,
    eta: float,
    rho: float,
    xi0: float,
    t: float,
    n_steps: int,
    n_paths: int = DEFAULT_N_PATHS,
    seed: int | None = None,
) -> dict:
    """Simulate the rBergomi model."""
    rng = random.Random(seed)
    dt = t / n_steps
    paths: list[list[float]] = []
    vol_paths: list[list[float]] = []
    var_swaps: list[float] = []

    for _ in range(n_paths):
        w1 = [0.0] * n_steps
        w2 = [0.0] * n_steps
        for step in range(1, n_steps):
            z1 = rng.gauss(0, 1)
            z2 = rho * z1 + math.sqrt(1 - rho * rho) * rng.gauss(0, 1)
            w1[step] = w1[step - 1] + math.sqrt(dt) * z1
            w2[step] = w2[step - 1] + math.sqrt(dt) * z2

        w_h = fbm(n_steps, h, rng.randrange(2**31))

        vol = [0.0] * n_steps
        price = [0.0] * n_steps
        price[0] = 100.0
        vol[0] = xi0

        for step in range(1, n_steps):
            t_h = (step * dt) ** (2 * h)
            vol[step] = xi0 * math.exp(eta * w_h[step] * dt ** h - 0.5 * eta * eta * t_h)
            vol_t = math.sqrt(max(0.0, vol[step]))
            price[step] = price[step - 1] * (1 + vol_t * (w1[step] - w1[step - 1]))

        var_swap = sum(vol[step] * dt for step in range(n_steps))
        paths.append(price)
        vol_paths.append(vol)
        var_swaps.append(var_swap / t)

    final_prices = sorted(p[-1] for p in paths)
    mean_price = sum(final_prices) / len(final_prices)
    p5 = final_prices[int(len(final_prices) * 0.05)]
    p95 = final_prices[int(len(final_prices) * 0.95)]

    mean_vol = [sum(vp[step] for vp in vol_paths) / n_paths for step in range(n_steps)]
    mean_price_path = [sum(p[step] for p in paths) / n_paths for step in range(n_steps)]

    atm_vol = math.sqrt(mean_vol[n_steps - 1])
    skew = eta * t ** (h - 0.5)

    return {
        "paths": paths,
        "vol_paths": vol_paths,
        "mean_vol": mean_vol,
        "mean_price_path": mean_price_path,
        "final_prices": final_prices,
        "mean_price": mean_price,
        "p5": p5,
        "p95": p95,
        "var_swaps": var_swaps,
        "atm_vol": atm_vol,
        "skew": skew,
        "n_steps": n_steps,
        "n_paths": n_paths,
    }


def estimate_hurst(returns: list[float]) -> float:
    """Estimate Hurst exponent from realized volatility scaling."""
    log_returns: list[float] = []
    log_scales: list[float] = []
    for scale in HURST_SCALES:
        if len(returns) < scale * 4:
            continue
        agg_returns = [
            sum(returns[i : i + scale]) for i in range(0, len(returns) - scale, scale)
        ]
        rv = math.sqrt(sum(r * r for r in agg_returns) / len(agg_returns))
        if rv > 0:
            log_returns.append(math.log(rv))
            log_scales.append(math.log(scale))

    if len(log_returns) < 2:
        return 0.1

    n = len(log_returns)
    mean_x = sum(log_scales) / n
    mean_y = sum(log_returns) / n
    num = sum((log_scales[i] - mean_x) * (log_returns[i] - mean_y) for i in range(n))
    den = sum((log_scales[i] - mean_x) ** 2 for i in range(n))
    hurst = num / den if den > 0 else 0.1
    return max(0.01, min(0.99, hurst))


def rbergomi_signal(expected_return: float) -> str:
    """Trading signal from expected simulated return."""
    if expected_return > 0.01:
        return "BUY"
    if expected_return < -0.01:
        return "SELL"
    return "NEUTRAL"


def rbergomi_analysis(
    prices: list[float],
    h: float | None = None,
    eta: float = DEFAULT_ETA,
    rho: float = DEFAULT_RHO,
    t: float = DEFAULT_T,
    n_steps: int = DEFAULT_N_STEPS,
    n_paths: int = DEFAULT_N_PATHS,
    auto_hurst: bool = True,
    seed: int | None = None,
) -> RBergomiResult | None:
    """Full rBergomi analysis of a price series. None if insufficient data."""
    if not prices or len(prices) < MIN_PRICES:
        return None

    returns = [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]
    est_h = estimate_hurst(returns)
    used_h = est_h if auto_hurst else (h if h is not None else est_h)

    recent_rets = returns[-30:]
    xi0 = math.sqrt(sum(r * r for r in recent_rets) / len(recent_rets)) * math.sqrt(252)

    sim = simulate_rbergomi(used_h, eta, rho, xi0, t, n_steps, n_paths, seed)

    current_price = prices[-1]
    expected_return = (sim["mean_price"] - current_price) / current_price
    signal = rbergomi_signal(expected_return)

    current_vol = xi0
    long_vol = math.sqrt(sum(r * r for r in returns) / len(returns)) * math.sqrt(252)
    if current_vol > long_vol * 1.5:
        vol_regime = "HIGH"
    elif current_vol < long_vol * 0.7:
        vol_regime = "LOW"
    else:
        vol_regime = "NORMAL"

    return RBergomiResult(
        paths=sim["paths"],
        vol_paths=sim["vol_paths"],
        mean_vol=sim["mean_vol"],
        mean_price_path=sim["mean_price_path"],
        mean_price=sim["mean_price"],
        p5=sim["p5"],
        p95=sim["p95"],
        var_swaps=sim["var_swaps"],
        atm_vol=sim["atm_vol"],
        skew=sim["skew"],
        est_h=est_h,
        used_h=used_h,
        xi0=xi0,
        expected_return=expected_return,
        signal=signal,
        vol_regime=vol_regime,
        n_steps=n_steps,
        n_paths=n_paths,
    )
