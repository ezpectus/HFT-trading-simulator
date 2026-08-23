"""Malliavin Calculus (sensitivity estimation via Monte Carlo).

Uses Malliavin calculus to compute Greeks (sensitivities) of financial
instruments via Monte Carlo simulation, avoiding finite differences.
"""
from __future__ import annotations

import math
import random

from src.research._common import compute_returns


MIN_PRICES = 30
LOOKBACK = 50
DEFAULT_N_PATHS = 1000
DEFAULT_N_STEPS = 50
DEFAULT_STRIKE_PCT = 1.0
DEFAULT_T_DAYS = 30
DEFAULT_RISK_FREE_RATE = 0.05
TRADING_DAYS = 252
DEFAULT_SEED = 42


class MalliavinResult:
    """Container for Malliavin calculus analysis results."""

    def __init__(
        self,
        s0: float,
        k: float,
        t: float,
        sigma: float,
        mu: float,
        price: float,
        delta: float,
        vega: float,
        gamma: float,
        fd_delta: float,
        fd_gamma: float,
        fd_vega: float,
        delta_se: float,
        mean_payoff: float,
        analytical_price: float,
        analytical: dict,
        delta_error: float,
        vega_error: float,
        gamma_error: float,
        price_error: float,
        signal: str,
        reason: str,
        convergence: list[dict],
    ) -> None:
        self.s0 = s0
        self.k = k
        self.t = t
        self.sigma = sigma
        self.mu = mu
        self.price = price
        self.delta = delta
        self.vega = vega
        self.gamma = gamma
        self.fd_delta = fd_delta
        self.fd_gamma = fd_gamma
        self.fd_vega = fd_vega
        self.delta_se = delta_se
        self.mean_payoff = mean_payoff
        self.analytical_price = analytical_price
        self.analytical = analytical
        self.delta_error = delta_error
        self.vega_error = vega_error
        self.gamma_error = gamma_error
        self.price_error = price_error
        self.signal = signal
        self.reason = reason
        self.convergence = convergence


def random_normal(rng: random.Random) -> float:
    """Box-Muller standard normal."""
    u = rng.random()
    while u == 0.0:
        u = rng.random()
    v = rng.random()
    while v == 0.0:
        v = rng.random()
    return math.sqrt(-2 * math.log(u)) * math.cos(2 * math.pi * v)


def simulate_paths(
    s0: float,
    mu: float,
    sigma: float,
    t: float,
    n_steps: int,
    n_paths: int,
    rng: random.Random,
) -> dict:
    """Simulate GBM paths and Brownian paths (n_steps-1 increments, as in UI)."""
    dt = t / n_steps
    paths = []
    brownian_paths = []

    for _ in range(n_paths):
        path = [s0]
        brownian = [0.0]
        s = s0
        w = 0.0
        for _ in range(1, n_steps):
            dw = random_normal(rng) * math.sqrt(dt)
            w += dw
            s = s * math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * dw)
            path.append(s)
            brownian.append(w)
        paths.append(path)
        brownian_paths.append(brownian)

    return {"paths": paths, "brownian_paths": brownian_paths}


def norm_cdf(x: float) -> float:
    """Normal CDF (Abramowitz-Stegun approximation)."""
    t = 1 / (1 + 0.2316419 * abs(x))
    d = 0.3989423 * math.exp(-x * x / 2)
    p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
    return 1 - p if x > 0 else p


def bs_call(s: float, k: float, t: float, r: float, sigma: float) -> float:
    """Black-Scholes call price (analytical)."""
    d1 = (math.log(s / k) + (r + 0.5 * sigma * sigma) * t) / (sigma * math.sqrt(t))
    d2 = d1 - sigma * math.sqrt(t)
    return s * norm_cdf(d1) - k * math.exp(-r * t) * norm_cdf(d2)


def bs_greeks(s: float, k: float, t: float, r: float, sigma: float) -> dict:
    """Black-Scholes Greeks (analytical)."""
    d1 = (math.log(s / k) + (r + 0.5 * sigma * sigma) * t) / (sigma * math.sqrt(t))
    d2 = d1 - sigma * math.sqrt(t)
    pdf = lambda x: math.exp(-x * x / 2) / math.sqrt(2 * math.pi)
    return {
        "delta": norm_cdf(d1),
        "gamma": pdf(d1) / (s * sigma * math.sqrt(t)),
        "vega": s * pdf(d1) * math.sqrt(t),
        "theta": (-s * pdf(d1) * sigma / (2 * math.sqrt(t)) - r * k * math.exp(-r * t) * norm_cdf(d2)),
        "rho": k * t * math.exp(-r * t) * norm_cdf(d2),
    }


def malliavin_greeks(
    paths: list[list[float]],
    brownian_paths: list[list[float]],
    s0: float,
    k: float,
    t: float,
    r: float,
    sigma: float,
    n_steps: int,
) -> dict:
    """Malliavin Greeks estimation via integration-by-parts weights."""
    n_paths = len(paths)
    dt = t / n_steps

    # Payoff: max(S_T - K, 0) for call
    payoffs = [max(p[n_steps - 1] - k, 0.0) for p in paths]
    mean_payoff = sum(payoffs) / n_paths
    price = math.exp(-r * t) * mean_payoff

    # Malliavin Delta weight: π^Δ = (1/(S₀σT))·W_T·1{S_T>K}
    delta_sum = 0.0
    delta_values = []
    for p in range(n_paths):
        wt = brownian_paths[p][n_steps - 1]
        in_money = 1.0 if paths[p][n_steps - 1] > k else 0.0
        weight = wt / (s0 * sigma * t)
        value = math.exp(-r * t) * in_money * weight
        delta_sum += value
        delta_values.append(value)
    delta = delta_sum / n_paths

    # Malliavin Vega weight: π^ν = (W_T² - T)/(2σT) - W_T/σ
    vega_sum = 0.0
    for p in range(n_paths):
        wt = brownian_paths[p][n_steps - 1]
        weight = (wt * wt - t) / (2 * sigma * t) - wt / sigma
        vega_sum += math.exp(-r * t) * payoffs[p] * weight
    vega = vega_sum / n_paths

    # Malliavin Gamma (simplified second-order weight)
    gamma_sum = 0.0
    for p in range(n_paths):
        wt = brownian_paths[p][n_steps - 1]
        st = paths[p][n_steps - 1]
        in_money = 1.0 if st > k else 0.0
        weight = (wt * wt - t) / (s0 * s0 * sigma * sigma * t * t) - 1 / (s0 * sigma * t)
        gamma_sum += math.exp(-r * t) * in_money * weight / s0
    gamma = gamma_sum / n_paths

    # Finite difference comparison
    ds = s0 * 0.01
    price_up = bs_call(s0 + ds, k, t, r, sigma)
    price_down = bs_call(s0 - ds, k, t, r, sigma)
    fd_delta = (price_up - price_down) / (2 * ds)
    fd_gamma = (price_up - 2 * price + price_down) / (ds * ds)

    d_sig = 0.01
    fd_vega = (bs_call(s0, k, t, r, sigma + d_sig) - bs_call(s0, k, t, r, sigma - d_sig)) / (2 * d_sig)

    # Standard error of delta
    delta_se = math.sqrt(sum((v - delta) ** 2 for v in delta_values) / n_paths) / math.sqrt(n_paths)

    return {
        "price": price,
        "delta": delta,
        "vega": vega,
        "gamma": gamma,
        "fd_delta": fd_delta,
        "fd_gamma": fd_gamma,
        "fd_vega": fd_vega,
        "delta_se": delta_se,
        "mean_payoff": mean_payoff,
    }


def malliavin_signal(delta: float) -> tuple[str, str]:
    """Signal from Malliavin delta."""
    if delta > 0.5:
        return "BUY", f"Delta = {delta:.4f} > 0.5 (ITM call)"
    if delta < 0.1:
        return "SELL", f"Delta = {delta:.4f} < 0.1 (OTM call)"
    return "NEUTRAL", f"Delta = {delta:.4f} (near ATM)"


def malliavin_analysis(
    prices: list[float],
    n_paths: int = DEFAULT_N_PATHS,
    n_steps: int = DEFAULT_N_STEPS,
    strike_pct: float = DEFAULT_STRIKE_PCT,
    t_days: int = DEFAULT_T_DAYS,
    risk_free_rate: float = DEFAULT_RISK_FREE_RATE,
    seed: int = DEFAULT_SEED,
) -> MalliavinResult | None:
    """Full Malliavin calculus analysis. None if insufficient data."""
    if not prices or len(prices) < MIN_PRICES:
        return None

    prices = prices[-LOOKBACK:]
    returns = compute_returns(prices)

    s0 = prices[-1]
    mean_r = sum(returns) / len(returns)
    var_r = sum((r - mean_r) ** 2 for r in returns) / len(returns)
    std_r = math.sqrt(var_r)
    sigma = std_r * math.sqrt(TRADING_DAYS)
    mu = mean_r * TRADING_DAYS
    k = s0 * strike_pct
    t = t_days / 365

    n_paths = max(100, n_paths)
    n_steps = max(10, n_steps)
    rng = random.Random(seed)

    sim = simulate_paths(s0, mu, sigma, t, n_steps, n_paths, rng)
    malliavin = malliavin_greeks(sim["paths"], sim["brownian_paths"], s0, k, t, risk_free_rate, sigma, n_steps)

    analytical = bs_greeks(s0, k, t, risk_free_rate, sigma)
    analytical_price = bs_call(s0, k, t, risk_free_rate, sigma)

    delta_error = abs(malliavin["delta"] - analytical["delta"])
    vega_error = abs(malliavin["vega"] - analytical["vega"])
    gamma_error = abs(malliavin["gamma"] - analytical["gamma"])
    price_error = abs(malliavin["price"] - analytical_price)

    signal, reason = malliavin_signal(malliavin["delta"])

    # Convergence: run with increasing path counts
    convergence = []
    step = max(50, n_paths // 10)
    for np in range(100, n_paths + 1, step):
        sub_paths = sim["paths"][:np]
        sub_brown = sim["brownian_paths"][:np]
        sub_result = malliavin_greeks(sub_paths, sub_brown, s0, k, t, risk_free_rate, sigma, n_steps)
        convergence.append({"n_paths": np, "delta": sub_result["delta"], "price": sub_result["price"]})

    return MalliavinResult(
        s0=s0,
        k=k,
        t=t,
        sigma=sigma,
        mu=mu,
        price=malliavin["price"],
        delta=malliavin["delta"],
        vega=malliavin["vega"],
        gamma=malliavin["gamma"],
        fd_delta=malliavin["fd_delta"],
        fd_gamma=malliavin["fd_gamma"],
        fd_vega=malliavin["fd_vega"],
        delta_se=malliavin["delta_se"],
        mean_payoff=malliavin["mean_payoff"],
        analytical_price=analytical_price,
        analytical=analytical,
        delta_error=delta_error,
        vega_error=vega_error,
        gamma_error=gamma_error,
        price_error=price_error,
        signal=signal,
        reason=reason,
        convergence=convergence,
    )
