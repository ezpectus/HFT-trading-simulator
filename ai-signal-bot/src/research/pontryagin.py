"""Pontryagin Maximum Principle (optimal trading trajectory).

Applies the PMP to find the optimal trading trajectory minimizing
execution cost + market impact (Almgren-Chriss with risk penalty).
"""
from __future__ import annotations

import math

from src.research._common import compute_returns


MIN_PRICES = 50
DEFAULT_KAPPA = 0.1
DEFAULT_LAMBDA = 0.01
DEFAULT_ETA = 0.05
DEFAULT_X0 = 1.0
DEFAULT_T = 1.0
DEFAULT_LOOKBACK = 100
N_STEPS = 100
SHOOTING_ITER = 50


class PontryaginResult:
    """Container for Pontryagin optimal execution results."""

    def __init__(
        self,
        trajectory: list[dict],
        total_cost: float,
        twap_cost: float,
        savings: float,
        savings_pct: float,
        immediate_cost: float,
        signal: str,
        reason: str,
        current_u: float,
        trade_direction: str,
        eta_calibrated: float,
    ) -> None:
        self.trajectory = trajectory
        self.total_cost = total_cost
        self.twap_cost = twap_cost
        self.savings = savings
        self.savings_pct = savings_pct
        self.immediate_cost = immediate_cost
        self.signal = signal
        self.reason = reason
        self.current_u = current_u
        self.trade_direction = trade_direction
        self.eta_calibrated = eta_calibrated


def solve_pmp(
    x0: float,
    t: float,
    kappa: float,
    lambda_: float,
    eta: float,
    n_steps: int = N_STEPS,
) -> dict:
    """Solve PMP via shooting method (bisection on p(0))."""
    dt = t / n_steps
    p0_low = -10.0
    p0_high = 10.0
    best_solution: list[dict] | None = None

    for _ in range(SHOOTING_ITER):
        p0 = (p0_low + p0_high) / 2
        trajectory: list[dict] = []
        x = x0
        p = p0

        for step in range(n_steps):
            t_step = step * dt
            u = -p / (kappa + 2 * lambda_ * x + 1e-10)
            u_clamped = max(-abs(x0) * 2, min(abs(x0) * 2, u))

            cost = 0.5 * kappa * u_clamped * u_clamped + lambda_ * u_clamped * u_clamped * x + eta * x * x
            trajectory.append({"t": t_step, "x": x, "p": p, "u": u_clamped, "cost": cost})

            x = x + u_clamped * dt
            p = p + (-lambda_ * u_clamped * u_clamped - 2 * eta * x) * dt

        if abs(x) < 0.01:
            best_solution = trajectory
            break
        if x > 0:
            p0_low = p0
        else:
            p0_high = p0
        best_solution = trajectory

    total_cost = sum(item["cost"] * dt for item in best_solution) if best_solution else 0.0
    twap_cost = 0.5 * kappa * (x0 / t) ** 2 * t + eta * x0 ** 2 * t / 3

    return {
        "trajectory": best_solution,
        "total_cost": total_cost,
        "twap_cost": twap_cost,
        "savings": twap_cost - total_cost,
    }


def pmp_signal(savings_pct: float) -> tuple[str, str]:
    """Signal from cost savings vs TWAP."""
    if savings_pct > 10:
        return "SIGNIFICANT_SAVINGS", f"PMP saves {savings_pct:.1f}% vs TWAP"
    if savings_pct > 0:
        return "OPTIMAL_EXECUTION", f"PMP saves {savings_pct:.1f}% vs TWAP"
    return "TWAP_PREFERRED", "TWAP preferred (PMP cost higher)"


def pontryagin_analysis(
    prices: list[float],
    kappa: float = DEFAULT_KAPPA,
    lambda_: float = DEFAULT_LAMBDA,
    eta: float = DEFAULT_ETA,
    x0: float = DEFAULT_X0,
    t: float = DEFAULT_T,
    lookback: int = DEFAULT_LOOKBACK,
) -> PontryaginResult | None:
    """Full Pontryagin optimal execution analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)
    std_r = math.sqrt(sum(r * r for r in returns) / len(returns))

    eta_calibrated = eta * std_r * std_r * 252

    result = solve_pmp(x0, t, kappa, lambda_, eta_calibrated, N_STEPS)

    twap_rate = x0 / t
    x_twap = x0
    for step in range(N_STEPS):
        t_step = step * (t / N_STEPS)
        x_twap = x_twap - twap_rate * (t / N_STEPS)

    immediate_cost = 0.5 * kappa * (x0 / 0.01) ** 2 * 0.01 + lambda_ * (x0 / 0.01) ** 2 * x0

    savings_pct = (result["savings"] / result["twap_cost"]) * 100 if result["twap_cost"] > 0 else 0.0
    signal, reason = pmp_signal(savings_pct)
    reason += f" (cost: {result['total_cost']:.6f} vs {result['twap_cost']:.6f})"

    current_u = result["trajectory"][0]["u"] if result["trajectory"] else 0.0
    if current_u < 0:
        trade_direction = "SELLING"
    elif current_u > 0:
        trade_direction = "BUYING"
    else:
        trade_direction = "NEUTRAL"

    return PontryaginResult(
        trajectory=result["trajectory"] or [],
        total_cost=result["total_cost"],
        twap_cost=result["twap_cost"],
        savings=result["savings"],
        savings_pct=savings_pct,
        immediate_cost=immediate_cost,
        signal=signal,
        reason=reason,
        current_u=current_u,
        trade_direction=trade_direction,
        eta_calibrated=eta_calibrated,
    )
