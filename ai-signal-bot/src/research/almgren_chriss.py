"""Almgren-Chriss optimal execution model.

Minimizes the trade-off between market impact and timing risk when
executing a large order over a time horizon.
"""
from __future__ import annotations

import math

DEFAULT_N_STEPS = 20
DEFAULT_ETA = 0.1
DEFAULT_GAMMA = 0.01
DEFAULT_LAMBDA = 1e-6
DEFAULT_SIGMA = 0.02
MIN_KAPPA = 1e-12


class AlmgrenChrissResult:
    """Container for Almgren-Chriss optimal execution results."""

    def __init__(
        self,
        trajectory: list[dict],
        trades: list[dict],
        expected_cost: float,
        std_dev: float,
        utility: float,
        twap_cost: float,
        twap_std_dev: float,
        twap_utility: float,
        frontier: list[dict],
        kappa: float,
        dt: float,
        n_steps: int,
        perm_impact_cost: float,
        temp_impact_cost: float,
    ) -> None:
        self.trajectory = trajectory
        self.trades = trades
        self.expected_cost = expected_cost
        self.std_dev = std_dev
        self.utility = utility
        self.twap_cost = twap_cost
        self.twap_std_dev = twap_std_dev
        self.twap_utility = twap_utility
        self.frontier = frontier
        self.kappa = kappa
        self.dt = dt
        self.n_steps = n_steps
        self.perm_impact_cost = perm_impact_cost
        self.temp_impact_cost = temp_impact_cost


def _arange(start: float, stop: float, step: float) -> list[float]:
    """Inclusive range with float step (mirrors JS for-loop semantics)."""
    values: list[float] = []
    value = start
    while value <= stop + 1e-12:
        values.append(value)
        value += step
    return values


def _optimal_trajectory(
    x_total: float,
    t_horizon: float,
    kappa: float,
    n_steps: int,
) -> tuple[list[dict], list[dict], float]:
    """Optimal trajectory x(t) = X*sinh(k(T-t))/sinh(kT) plus trade schedule."""
    dt = t_horizon / n_steps
    trajectory: list[dict] = []
    trades: list[dict] = []
    prev_x = x_total
    for i in range(n_steps + 1):
        t = i * dt
        if kappa > MIN_KAPPA:
            x = x_total * math.sinh(kappa * (t_horizon - t)) / math.sinh(kappa * t_horizon)
        else:
            x = x_total * (1 - t / t_horizon)
        trajectory.append({"t": t, "x": x})
        if i > 0:
            trades.append({"t": t, "amount": prev_x - x, "rate": (prev_x - x) / dt})
        prev_x = x
    return trajectory, trades, dt


def _twap_metrics(
    x_total: float,
    t_horizon: float,
    sigma: float,
    eta: float,
    gamma: float,
    lambda_: float,
    n_steps: int,
) -> tuple[float, float, float]:
    """TWAP benchmark: cost, std dev and utility for uniform execution."""
    dt = t_horizon / n_steps
    twap_per_step = x_total / n_steps
    twap_temp = sum(eta * (twap_per_step / dt) ** 2 * dt for _ in range(n_steps))
    twap_cost = 0.5 * gamma * x_total * x_total + twap_temp

    twap_var = 0.0
    remaining = x_total
    for _ in range(n_steps):
        twap_var += sigma * sigma * remaining * remaining * dt
        remaining -= twap_per_step

    twap_std_dev = math.sqrt(twap_var)
    twap_utility = twap_cost + lambda_ * twap_var
    return twap_cost, twap_std_dev, twap_utility


def efficient_frontier(
    x_total: float,
    t_horizon: float,
    sigma: float,
    eta: float,
    gamma: float,
    n_steps: int = DEFAULT_N_STEPS,
) -> list[dict]:
    """Efficient frontier: (cost, std_dev) pairs for lambda in 10^-3 .. 10^3."""
    dt = t_horizon / n_steps
    frontier: list[dict] = []
    for li in _arange(-3.0, 3.0, 0.5):
        lam = 10 ** li
        k = math.sqrt(lam * sigma * sigma / eta)
        ec = 0.0
        varc = 0.0
        prev_x = x_total
        for i in range(n_steps + 1):
            t = i * dt
            if k > MIN_KAPPA:
                x = x_total * math.sinh(k * (t_horizon - t)) / math.sinh(k * t_horizon)
            else:
                x = x_total * (1 - t / t_horizon)
            if i > 0:
                v = (prev_x - x) / dt
                ec += eta * v * v * dt
            if i < n_steps:
                varc += sigma * sigma * x * x * dt
            prev_x = x
        ec += 0.5 * gamma * x_total * x_total
        frontier.append({"lambda": lam, "cost": ec, "std_dev": math.sqrt(varc), "utility": ec + lam * varc})
    return frontier


def almgren_chriss(
    x_total: float,
    t_horizon: float,
    sigma: float,
    eta: float,
    gamma: float,
    lambda_: float,
    n_steps: int = DEFAULT_N_STEPS,
) -> AlmgrenChrissResult | None:
    """Compute the Almgren-Chriss optimal execution schedule. None if invalid params."""
    if x_total <= 0 or t_horizon <= 0 or sigma <= 0 or eta <= 0 or n_steps <= 0:
        return None

    kappa = math.sqrt(lambda_ * sigma * sigma / eta)
    trajectory, trades, dt = _optimal_trajectory(x_total, t_horizon, kappa, n_steps)

    temp_impact_cost = sum(eta * tr["rate"] * tr["rate"] * dt for tr in trades)
    perm_impact_cost = 0.5 * gamma * x_total * x_total
    expected_cost = perm_impact_cost + temp_impact_cost

    variance = sum(sigma * sigma * p["x"] * p["x"] * dt for p in trajectory[:-1])
    std_dev = math.sqrt(variance)
    utility = expected_cost + lambda_ * variance

    twap_cost, twap_std_dev, twap_utility = _twap_metrics(
        x_total, t_horizon, sigma, eta, gamma, lambda_, n_steps
    )
    frontier = efficient_frontier(x_total, t_horizon, sigma, eta, gamma, n_steps)

    return AlmgrenChrissResult(
        trajectory=trajectory,
        trades=trades,
        expected_cost=expected_cost,
        std_dev=std_dev,
        utility=utility,
        twap_cost=twap_cost,
        twap_std_dev=twap_std_dev,
        twap_utility=twap_utility,
        frontier=frontier,
        kappa=kappa,
        dt=dt,
        n_steps=n_steps,
        perm_impact_cost=perm_impact_cost,
        temp_impact_cost=temp_impact_cost,
    )


def estimate_volatility(prices: list[float]) -> float:
    """Estimate daily volatility from simple returns. Default 0.02 if insufficient."""
    if not prices or len(prices) < 2:
        return DEFAULT_SIGMA
    returns = []
    for i in range(1, len(prices)):
        if prices[i - 1] > 0:
            returns.append((prices[i] - prices[i - 1]) / prices[i - 1])
    if not returns:
        return DEFAULT_SIGMA
    mean = sum(returns) / len(returns)
    variance = sum((r - mean) ** 2 for r in returns) / len(returns)
    return math.sqrt(variance)


def almgren_chriss_analysis(
    prices: list[float],
    order_size: float,
    time_horizon: float,
    eta: float = DEFAULT_ETA,
    gamma: float = DEFAULT_GAMMA,
    lambda_: float = DEFAULT_LAMBDA,
    n_steps: int = DEFAULT_N_STEPS,
) -> AlmgrenChrissResult | None:
    """Almgren-Chriss execution plan with volatility estimated from prices."""
    sigma = estimate_volatility(prices)
    return almgren_chriss(order_size, time_horizon, sigma, eta, gamma, lambda_, n_steps)
