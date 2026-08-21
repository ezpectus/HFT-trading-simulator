"""Stochastic Optimal Control (Hamilton-Jacobi-Bellman equation).

Solves the HJB equation for optimal trading decisions under stochastic
dynamics, finding the value function and optimal policy.
"""
from __future__ import annotations

import math

MIN_PRICES = 50
DEFAULT_GAMMA = 2.0
DEFAULT_RHO = 0.05
DEFAULT_LOOKBACK = 100
DEFAULT_N_T = 30
DEFAULT_N_X = 50
X_MIN = 0.1
X_MAX = 3.0
HORIZON = 1.0


class StochasticControlResult:
    """Container for stochastic optimal control results."""

    def __init__(
        self,
        v: list[list[float]],
        u: list[list[float]],
        x_grid: list[float],
        t_grid: list[float],
        optimal_position: float,
        current_value: float,
        position_trajectory: list[dict],
        value_slices: list[dict],
        signal: str,
        reason: str,
        mu: float,
        sigma: float,
        sharpe: float,
        current_wealth: float,
        current_idx: int,
    ) -> None:
        self.v = v
        self.u = u
        self.x_grid = x_grid
        self.t_grid = t_grid
        self.optimal_position = optimal_position
        self.current_value = current_value
        self.position_trajectory = position_trajectory
        self.value_slices = value_slices
        self.signal = signal
        self.reason = reason
        self.mu = mu
        self.sigma = sigma
        self.sharpe = sharpe
        self.current_wealth = current_wealth
        self.current_idx = current_idx


def compute_returns(prices: list[float]) -> list[float]:
    """Simple returns."""
    return [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]


def solve_hjb(
    x_grid: list[float],
    t_grid: list[float],
    mu: float,
    sigma: float,
    gamma: float,
    rho: float,
    dt: float,
    dx: float,
) -> dict:
    """Solve HJB via backward finite differences."""
    n_x = len(x_grid)
    n_t = len(t_grid)
    v = [[0.0] * n_x for _ in range(n_t)]
    u = [[0.0] * n_x for _ in range(n_t)]

    for i in range(n_x):
        v[n_t - 1][i] = math.log(max(x_grid[i], 0.01))

    for t in range(n_t - 2, -1, -1):
        for i in range(1, n_x - 1):
            x = x_grid[i]
            vx = (v[t + 1][i + 1] - v[t + 1][i - 1]) / (2 * dx)
            vxx = (v[t + 1][i + 1] - 2 * v[t + 1][i] + v[t + 1][i - 1]) / (dx * dx)

            numerator = mu * x * (1 + vx)
            denominator = sigma * sigma * x * x * (gamma - vxx)
            u_opt = numerator / denominator if abs(denominator) > 1e-10 else 0.0
            u_opt = max(-2.0, min(2.0, u_opt))

            drift = u_opt * mu * x
            diffusion = u_opt * sigma * x
            reward = u_opt * mu * x - (gamma / 2) * u_opt * u_opt * sigma * sigma * x * x

            v_t = reward + drift * vx + 0.5 * diffusion * diffusion * vxx - rho * v[t + 1][i]
            v[t][i] = v[t + 1][i] + dt * v_t
            u[t][i] = u_opt

        v[t][0] = v[t][1]
        v[t][n_x - 1] = v[t][n_x - 2]
        u[t][0] = 0.0
        u[t][n_x - 1] = 0.0

    return {"V": v, "U": u}


def sc_signal(optimal_position: float, gamma: float) -> tuple[str, str]:
    """Signal from optimal position."""
    if optimal_position > 0.3:
        return "LONG", f"Optimal position u*={optimal_position:.4f} (long, risk aversion γ={gamma})"
    if optimal_position < -0.3:
        return "SHORT", f"Optimal position u*={optimal_position:.4f} (short, risk aversion γ={gamma})"
    return "NEUTRAL", f"Optimal position u*={optimal_position:.4f} (near zero, high risk aversion)"


def stochastic_control_analysis(
    prices: list[float],
    gamma: float = DEFAULT_GAMMA,
    rho: float = DEFAULT_RHO,
    lookback: int = DEFAULT_LOOKBACK,
    n_t: int = DEFAULT_N_T,
    n_x: int = DEFAULT_N_X,
) -> StochasticControlResult | None:
    """Full stochastic optimal control analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)

    mean_r = sum(returns) / len(returns)
    var_r = sum((r - mean_r) ** 2 for r in returns) / len(returns)
    std_r = math.sqrt(var_r)
    mu = mean_r * 252
    sigma = std_r * math.sqrt(252)

    current_wealth = 1.0
    dx = (X_MAX - X_MIN) / (n_x - 1)
    x_grid = [X_MIN + i * dx for i in range(n_x)]

    dt = HORIZON / n_t
    t_grid = [i * dt for i in range(n_t + 1)]

    result = solve_hjb(x_grid, t_grid, mu, sigma, gamma, rho, dt, dx)
    v = result["V"]
    u = result["U"]

    current_idx = min(n_x - 2, max(1, int((current_wealth - X_MIN) / dx)))
    optimal_position = u[0][current_idx]
    current_value = v[0][current_idx]

    position_trajectory: list[dict] = []
    wealth_idx = current_idx
    for t in range(n_t):
        position_trajectory.append(
            {
                "t": t * dt,
                "position": u[t][wealth_idx],
                "wealth": x_grid[wealth_idx],
                "value": v[t][wealth_idx],
            }
        )
        u_val = u[t][wealth_idx]
        new_wealth = x_grid[wealth_idx] * (1 + u_val * mu * dt)
        wealth_idx = min(n_x - 2, max(1, int((new_wealth - X_MIN) / dx)))

    value_slices = [
        {"t_label": f"t={t_idx * dt:.2f}", "values": v[t_idx][:]}
        for t_idx in [0, n_t // 3, 2 * n_t // 3, n_t - 1]
    ]

    signal, reason = sc_signal(optimal_position, gamma)
    sharpe = (optimal_position * mu) / (abs(optimal_position) * sigma + 1e-10)

    return StochasticControlResult(
        v=v,
        u=u,
        x_grid=x_grid,
        t_grid=t_grid,
        optimal_position=optimal_position,
        current_value=current_value,
        position_trajectory=position_trajectory,
        value_slices=value_slices,
        signal=signal,
        reason=reason,
        mu=mu,
        sigma=sigma,
        sharpe=sharpe,
        current_wealth=current_wealth,
        current_idx=current_idx,
    )
