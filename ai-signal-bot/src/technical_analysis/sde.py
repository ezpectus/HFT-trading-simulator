"""Stochastic Differential Equations (SDE) simulation.

Simulates financial SDEs using Euler-Maruyama and Milstein schemes.
Includes GBM, Ornstein-Uhlenbeck, CIR, Heston, and Jump-Diffusion models.

    General SDE: dX_t = mu(X_t, t) dt + sigma(X_t, t) dW_t
    Euler-Maruyama: X_{n+1} = X_n + mu*dt + sigma*sqrt(dt)*Z_n
    Milstein (strong order 1.0):
      X_{n+1} = X_n + mu*dt + sigma*sqrt(dt)*Z_n + 0.5*sigma*sigma'*(Z_n^2 - 1)*dt

    Models:
    GBM:  dS = mu*S dt + sigma*S dW
    OU:   dX = theta*(mu - X) dt + sigma dW
    CIR:  dX = kappa*(theta - X) dt + sigma*sqrt(X) dW
    Heston: dS = mu*S dt + sqrt(v)*S dW1,  dv = kappa*(theta-v) dt + xi*sqrt(v) dW2
    Merton: dS = mu*S dt + sigma*S dW + S*J*dN (Poisson jumps)

Ported from UI-only StochasticDifferentialEquations.jsx into trading logic.
Reference: future_development.md §0.2 — extended model list.
"""
from __future__ import annotations

import math
import random

MIN_PRICES = 30
DEFAULT_N_STEPS = 100
DEFAULT_N_PATHS = 50
DEFAULT_T = 30 / 365


class SDEResult:
    """Container for SDE simulation results."""

    def __init__(
        self,
        sim: list[list[float]],
        vol_sim: list[list[float]] | None,
        s0: float,
        mean_final: float,
        mean_path: list[float],
        p5: float,
        p25: float,
        median: float,
        p75: float,
        p95: float,
        expected_return: float,
        signal: str,
        ci_width: float,
        used_mu: float,
        used_sigma: float,
    ) -> None:
        self.sim = sim
        self.vol_sim = vol_sim
        self.s0 = s0
        self.mean_final = mean_final
        self.mean_path = mean_path
        self.p5 = p5
        self.p25 = p25
        self.median = median
        self.p75 = p75
        self.p95 = p95
        self.expected_return = expected_return
        self.signal = signal
        self.ci_width = ci_width
        self.used_mu = used_mu
        self.used_sigma = used_sigma


def _random_normal(rng: random.Random) -> float:
    """Box-Muller standard normal sample."""
    u = rng.random()
    while u == 0:
        u = rng.random()
    v = rng.random()
    while v == 0:
        v = rng.random()
    return math.sqrt(-2 * math.log(u)) * math.cos(2 * math.pi * v)


def simulate_gbm(
    s0: float,
    mu: float,
    sigma: float,
    t: float,
    n_steps: int,
    n_paths: int,
    seed: int | None = None,
) -> list[list[float]]:
    """Euler-Maruyama GBM."""
    rng = random.Random(seed)
    dt = t / n_steps
    paths = []
    for _ in range(n_paths):
        path = [s0]
        for i in range(1, n_steps):
            z = _random_normal(rng)
            path.append(path[i - 1] * (1 + mu * dt + sigma * math.sqrt(dt) * z))
        paths.append(path)
    return paths


def simulate_gbm_milstein(
    s0: float,
    mu: float,
    sigma: float,
    t: float,
    n_steps: int,
    n_paths: int,
    seed: int | None = None,
) -> list[list[float]]:
    """Milstein GBM (strong order 1.0)."""
    rng = random.Random(seed)
    dt = t / n_steps
    paths = []
    for _ in range(n_paths):
        path = [s0]
        for i in range(1, n_steps):
            z = _random_normal(rng)
            s = path[i - 1]
            path.append(
                s + mu * s * dt + sigma * s * math.sqrt(dt) * z
                + 0.5 * sigma * sigma * s * (z * z - 1) * dt
            )
        paths.append(path)
    return paths


def simulate_ou(
    x0: float,
    theta: float,
    mu: float,
    sigma: float,
    t: float,
    n_steps: int,
    n_paths: int,
    seed: int | None = None,
) -> list[list[float]]:
    """Ornstein-Uhlenbeck (mean-reverting)."""
    rng = random.Random(seed)
    dt = t / n_steps
    paths = []
    for _ in range(n_paths):
        path = [x0]
        for i in range(1, n_steps):
            z = _random_normal(rng)
            x = path[i - 1]
            path.append(x + theta * (mu - x) * dt + sigma * math.sqrt(dt) * z)
        paths.append(path)
    return paths


def simulate_cir(
    x0: float,
    kappa: float,
    theta: float,
    sigma: float,
    t: float,
    n_steps: int,
    n_paths: int,
    seed: int | None = None,
) -> list[list[float]]:
    """CIR (Cox-Ingersoll-Ross) with Milstein correction."""
    rng = random.Random(seed)
    dt = t / n_steps
    paths = []
    for _ in range(n_paths):
        path = [x0]
        for i in range(1, n_steps):
            z = _random_normal(rng)
            x = max(0.0, path[i - 1])
            drift = kappa * (theta - x) * dt
            vol = sigma * math.sqrt(x) * math.sqrt(dt) * z
            milstein = 0.25 * sigma * sigma * (z * z - 1) * dt
            path.append(max(0.0, x + drift + vol + milstein))
        paths.append(path)
    return paths


def simulate_heston(
    s0: float,
    v0: float,
    mu: float,
    kappa: float,
    theta: float,
    xi: float,
    rho: float,
    t: float,
    n_steps: int,
    n_paths: int,
    seed: int | None = None,
) -> dict:
    """Heston stochastic volatility model."""
    rng = random.Random(seed)
    dt = t / n_steps
    paths: list[list[float]] = []
    vol_paths: list[list[float]] = []
    for _ in range(n_paths):
        price = [s0]
        vol = [v0]
        for i in range(1, n_steps):
            z1 = _random_normal(rng)
            z2 = rho * z1 + math.sqrt(1 - rho * rho) * _random_normal(rng)
            v_prev = max(0.0, vol[i - 1])
            s_prev = price[i - 1]
            vol.append(max(0.0, v_prev + kappa * (theta - v_prev) * dt + xi * math.sqrt(v_prev) * math.sqrt(dt) * z2))
            price.append(s_prev * (1 + mu * dt + math.sqrt(v_prev) * math.sqrt(dt) * z1))
        paths.append(price)
        vol_paths.append(vol)
    return {"paths": paths, "vol_paths": vol_paths}


def simulate_merton(
    s0: float,
    mu: float,
    sigma: float,
    lambda_: float,
    jump_mean: float,
    jump_std: float,
    t: float,
    n_steps: int,
    n_paths: int,
    seed: int | None = None,
) -> list[list[float]]:
    """Merton jump-diffusion."""
    rng = random.Random(seed)
    dt = t / n_steps
    paths = []
    for _ in range(n_paths):
        path = [s0]
        for i in range(1, n_steps):
            z = _random_normal(rng)
            s = path[i - 1]
            n_jumps = 1 if rng.random() < lambda_ * dt else 0
            jump_component = 0.0
            for _ in range(n_jumps):
                jump_component += math.exp(jump_mean + jump_std * _random_normal(rng)) - 1
            path.append(s * (1 + mu * dt + sigma * math.sqrt(dt) * z + jump_component))
        paths.append(path)
    return paths


def estimate_params(returns: list[float]) -> dict:
    """Estimate drift/vol and OU parameters from returns."""
    n = len(returns)
    mean = sum(returns) / n
    variance = sum((r - mean) ** 2 for r in returns) / n
    std = math.sqrt(variance)

    sum_xy = 0.0
    sum_xx = 0.0
    sum_x = 0.0
    sum_y = 0.0
    for i in range(n - 1):
        sum_x += returns[i]
        sum_y += returns[i + 1]
        sum_xy += returns[i] * returns[i + 1]
        sum_xx += returns[i] * returns[i]

    denom = n * sum_xx - sum_x * sum_x
    phi = (n * sum_xy - sum_x * sum_y) / denom if denom != 0 else 0.0
    ou_theta = -math.log(max(0.01, abs(phi)))
    ou_mu = (sum_y - phi * sum_x) / (n * (1 - phi)) if (1 - phi) != 0 else 0.0

    return {"mu": mean * 252, "sigma": std * math.sqrt(252), "ou_theta": ou_theta, "ou_mu": ou_mu * 252}


def sde_signal(expected_return: float) -> str:
    """Trading signal from expected simulated return."""
    if expected_return > 0.01:
        return "BUY"
    if expected_return < -0.01:
        return "SELL"
    return "NEUTRAL"


def sde_analysis(
    prices: list[float],
    model: str = "gbm",
    scheme: str = "euler",
    n_steps: int = DEFAULT_N_STEPS,
    n_paths: int = DEFAULT_N_PATHS,
    t: float = DEFAULT_T,
    mu: float = 0.1,
    sigma: float = 0.3,
    theta: float = 5.0,
    kappa: float = 2.0,
    xi: float = 0.3,
    rho: float = -0.7,
    lambda_: float = 5.0,
    auto_params: bool = True,
    seed: int | None = None,
) -> SDEResult | None:
    """Full SDE simulation analysis. None if insufficient data."""
    if not prices or len(prices) < MIN_PRICES:
        return None

    returns = [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]
    est = estimate_params(returns)
    used_mu = est["mu"] if auto_params else mu
    used_sigma = est["sigma"] if auto_params else sigma
    s0 = prices[-1]

    sim: list[list[float]] | None = None
    vol_sim: list[list[float]] | None = None

    if model == "gbm":
        sim = (
            simulate_gbm_milstein(s0, used_mu, used_sigma, t, n_steps, n_paths, seed)
            if scheme == "milstein"
            else simulate_gbm(s0, used_mu, used_sigma, t, n_steps, n_paths, seed)
        )
    elif model == "ou":
        sim = simulate_ou(s0, theta, est["ou_mu"] or 0.0, used_sigma, t, n_steps, n_paths, seed)
    elif model == "cir":
        sim = simulate_cir(used_sigma * used_sigma, kappa, used_sigma * used_sigma * 0.25, xi, t, n_steps, n_paths, seed)
    elif model == "heston":
        h = simulate_heston(s0, used_sigma * used_sigma, used_mu, kappa, used_sigma * used_sigma * 0.25, xi, rho, t, n_steps, n_paths, seed)
        sim = h["paths"]
        vol_sim = h["vol_paths"]
    elif model == "merton":
        sim = simulate_merton(s0, used_mu, used_sigma, lambda_, -0.05, 0.08, t, n_steps, n_paths, seed)

    if sim is None:
        return None

    final_prices = sorted(p[-1] for p in sim)
    mean_final = sum(final_prices) / len(final_prices)
    p5 = final_prices[int(len(final_prices) * 0.05)]
    p25 = final_prices[int(len(final_prices) * 0.25)]
    median = final_prices[int(len(final_prices) * 0.5)]
    p75 = final_prices[int(len(final_prices) * 0.75)]
    p95 = final_prices[int(len(final_prices) * 0.95)]

    mean_path = [sum(p[t] for p in sim) / n_paths for t in range(n_steps)]

    expected_return = (mean_final - s0) / s0
    signal = sde_signal(expected_return)
    ci_width = (p95 - p5) / s0

    return SDEResult(
        sim=sim,
        vol_sim=vol_sim,
        s0=s0,
        mean_final=mean_final,
        mean_path=mean_path,
        p5=p5,
        p25=p25,
        median=median,
        p75=p75,
        p95=p95,
        expected_return=expected_return,
        signal=signal,
        ci_width=ci_width,
        used_mu=used_mu,
        used_sigma=used_sigma,
    )
