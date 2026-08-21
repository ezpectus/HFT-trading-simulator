"""Burgers Equation (nonlinear PDE, shock formation).

Models order flow dynamics via the viscous Burgers equation, capturing
nonlinear wave steepening and shock formation (sudden price jumps).
"""
from __future__ import annotations

import math

MIN_PRICES = 50
DEFAULT_NU = 0.01
DEFAULT_N_STEPS = 200
DEFAULT_DT = 0.01
DEFAULT_LOOKBACK = 100
MAX_GRID = 80


class BurgersResult:
    """Container for Burgers equation analysis results."""

    def __init__(
        self,
        x_grid: list[float],
        result: dict,
        shocks: list[dict],
        shock_times: dict,
        energy_history: list[dict],
        entropy_history: list[dict],
        signal: str,
        reason: str,
        total_shocks: int,
        max_shock_grad: float,
        energy_decay: float,
        u0: list[float],
        dx: float,
    ) -> None:
        self.x_grid = x_grid
        self.result = result
        self.shocks = shocks
        self.shock_times = shock_times
        self.energy_history = energy_history
        self.entropy_history = entropy_history
        self.signal = signal
        self.reason = reason
        self.total_shocks = total_shocks
        self.max_shock_grad = max_shock_grad
        self.energy_decay = energy_decay
        self.u0 = u0
        self.dx = dx


def compute_returns(prices: list[float]) -> list[float]:
    """Simple returns."""
    return [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]


def shock_threshold(u: list[float]) -> float:
    """Shock detection threshold: 2·RMS(u)."""
    std = math.sqrt(sum(v * v for v in u) / len(u))
    return 2 * std


def solve_burgers(
    u0: list[float],
    x_grid: list[float],
    dt: float,
    n_steps: int,
    nu: float,
) -> dict:
    """Solve viscous Burgers equation via finite differences (periodic BC)."""
    n = len(x_grid)
    dx = x_grid[1] - x_grid[0]
    u = u0[:]
    history = [u[:]]
    shock_points = []

    for step in range(n_steps):
        new_u = [0.0] * n
        for i in range(1, n - 1):
            du = (u[i + 1] - u[i - 1]) / (2 * dx)
            advection = -u[i] * du
            diffusion = nu * (u[i + 1] - 2 * u[i] + u[i - 1]) / (dx * dx)
            new_u[i] = u[i] + dt * (advection + diffusion)
        # Boundary: periodic
        new_u[0] = new_u[n - 2]
        new_u[n - 1] = new_u[1]

        # Detect shocks: large negative gradient
        threshold = shock_threshold(u)
        for i in range(1, n - 1):
            grad = (new_u[i + 1] - new_u[i - 1]) / (2 * dx)
            if grad < -threshold:
                shock_points.append({"step": step, "x_idx": i, "x": x_grid[i], "gradient": grad})

        u = new_u
        if step % max(1, n_steps // 20) == 0:
            history.append(u[:])

    return {"final_u": u, "history": history, "shock_points": shock_points}


def burgers_signal(total_shocks: int, max_shock_grad: float, nu: float) -> tuple[str, str]:
    """Signal from shock count and max gradient."""
    if total_shocks > 20:
        return (
            "SHOCK_FORMATION",
            f"{total_shocks} shock points detected (max gradient: {max_shock_grad:.4f}, nonlinear steepening)",
        )
    if total_shocks > 5:
        return (
            "WEAK_SHOCKS",
            f"{total_shocks} shock points (mild nonlinear effects, gradient: {max_shock_grad:.4f})",
        )
    return "SMOOTH_FLOW", f"{total_shocks} shock points (smooth flow, viscosity dominates, ν={nu})"


def burgers_analysis(
    prices: list[float],
    nu: float = DEFAULT_NU,
    n_steps: int = DEFAULT_N_STEPS,
    dt: float = DEFAULT_DT,
    lookback: int = DEFAULT_LOOKBACK,
) -> BurgersResult | None:
    """Full Burgers equation analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)

    # Normalize returns to be initial condition
    mean = sum(returns) / len(returns)
    std = math.sqrt(sum((r - mean) ** 2 for r in returns) / len(returns))
    norm_r = [(r - mean) / std if std > 0 else 0.0 for r in returns]

    # Spatial grid (return values as x-axis)
    n_grid = min(MAX_GRID, len(norm_r))
    x_min = min(norm_r) - 0.5
    x_max = max(norm_r) + 0.5
    dx = (x_max - x_min) / (n_grid - 1)
    x_grid = [x_min + i * dx for i in range(n_grid)]

    # Initial condition: histogram density mapped to velocity field
    bin_w = (x_max - x_min) / n_grid
    u0 = [0.0] * n_grid
    for r in norm_r:
        idx = min(n_grid - 1, max(0, math.floor((r - x_min) / bin_w)))
        u0[idx] += 1
    # Normalize and smooth
    max_u0 = max(u0) if u0 else 1.0
    max_u0 = max(max_u0, 1.0)
    u0 = [(v / max_u0) * 2 - 1 for v in u0]  # scale to [-1, 1]

    # Solve Burgers
    result = solve_burgers(u0, x_grid, dt, n_steps, nu)

    # Analyze shocks
    shocks = result["shock_points"]
    shock_times: dict = {}
    for s in shocks:
        shock_times[s["step"]] = shock_times.get(s["step"], 0) + 1

    # Energy: E = (1/2)∫u²dx
    energy_history = [{"energy": 0.5 * sum(v * v for v in u) * dx} for u in result["history"]]

    # Entropy: S = -∫u·log|u|dx
    entropy_history = [
        {"entropy": -sum(v * math.log(abs(v)) if abs(v) > 0.01 else 0.0 for v in u) * dx}
        for u in result["history"]
    ]

    # Signal
    total_shocks = len(shocks)
    max_shock_grad = min(s["gradient"] for s in shocks) if shocks else 0.0
    signal, reason = burgers_signal(total_shocks, max_shock_grad, nu)

    # Energy decay rate
    e0 = energy_history[0]["energy"]
    e_t = energy_history[-1]["energy"]
    energy_decay = (1 - e_t / e0) * 100 if e0 > 0 else 0.0

    return BurgersResult(
        x_grid=x_grid,
        result=result,
        shocks=shocks,
        shock_times=shock_times,
        energy_history=energy_history,
        entropy_history=entropy_history,
        signal=signal,
        reason=reason,
        total_shocks=total_shocks,
        max_shock_grad=max_shock_grad,
        energy_decay=energy_decay,
        u0=u0,
        dx=dx,
    )
