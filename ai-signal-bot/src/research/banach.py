"""Banach Fixed-Point Iteration (contraction mapping equilibrium).

Uses Banach's contraction mapping theorem to find fixed points of
market equilibrium operators, detecting convergence/divergence regimes.
"""
from __future__ import annotations

import math

MIN_PRICES = 50
DEFAULT_LOOKBACK = 100
DEFAULT_MAX_ITER = 50
DEFAULT_COUPLING = 0.3
CONVERGENCE_TOL = 1e-8
CONVERGED_TOL = 1e-6


class BanachResult:
    """Container for Banach fixed-point analysis results."""

    def __init__(
        self,
        result: dict,
        params: dict,
        q: float,
        nash_x: float,
        nash_y: float,
        signal: str,
        reason: str,
        final_error: float,
        convergence_rate: float,
        error_decay: list[dict],
        mean_r: float,
        std_r: float,
    ) -> None:
        self.result = result
        self.params = params
        self.q = q
        self.nash_x = nash_x
        self.nash_y = nash_y
        self.signal = signal
        self.reason = reason
        self.final_error = final_error
        self.convergence_rate = convergence_rate
        self.error_decay = error_decay
        self.mean_r = mean_r
        self.std_r = std_r


def compute_returns(prices: list[float]) -> list[float]:
    """Simple returns."""
    return [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]


def best_response(x: float, y: float, params: dict) -> dict:
    """Best-response operator for 2-player game."""
    a1 = params["a1"]
    b1 = params["b1"]
    c1 = params["c1"]
    a2 = params["a2"]
    b2 = params["b2"]
    c2 = params["c2"]
    new_x = (a1 - c1 * y) / (2 * b1)
    new_y = (a2 - c2 * x) / (2 * b2)
    return {"x": new_x, "y": new_y}


def contraction_constant(params: dict) -> float:
    """Contraction constant: spectral radius of Jacobian of T."""
    c1 = params["c1"]
    b1 = params["b1"]
    c2 = params["c2"]
    b2 = params["b2"]
    # Jacobian: [[0, -c1/(2b1)], [-c2/(2b2), 0]]
    # Eigenvalues: ±sqrt(c1·c2/(4·b1·b2))
    return math.sqrt(abs(c1 * c2) / (4 * b1 * b2))


def fixed_point_iteration(
    x0: float,
    y0: float,
    params: dict,
    max_iter: int,
) -> dict:
    """Fixed-point iteration of the best-response operator."""
    trajectory = [{"x": x0, "y": y0, "iter": 0}]
    x = x0
    y = y0
    errors = []

    for i in range(1, max_iter + 1):
        new = best_response(x, y, params)
        new_x = new["x"]
        new_y = new["y"]
        error = math.sqrt((new_x - x) ** 2 + (new_y - y) ** 2)
        trajectory.append({"x": new_x, "y": new_y, "iter": i})
        errors.append({"iter": i, "error": error})
        x = new_x
        y = new_y
        if error < CONVERGENCE_TOL:
            break

    converged = errors[-1]["error"] < CONVERGED_TOL
    return {"trajectory": trajectory, "errors": errors, "converged": converged}


def banach_signal(q: float, converged: bool, nash_x: float, nash_y: float, n_iters: int, final_error: float, max_iter: int) -> tuple[str, str]:
    """Signal from contraction constant and convergence status."""
    if q < 1 and converged:
        return (
            "EQUILIBRIUM_FOUND",
            f"Converged to Nash equilibrium ({nash_x:.6f}, {nash_y:.6f}) in {n_iters} iterations, q={q:.4f}",
        )
    if q < 1 and not converged:
        return (
            "CONVERGING_SLOW",
            f"Converging slowly (q={q:.4f} < 1), error={final_error:.8f} after {max_iter} iterations",
        )
    return "DIVERGING", f"Diverging (q={q:.4f} >= 1), no equilibrium exists for this coupling"


def banach_analysis(
    prices: list[float],
    lookback: int = DEFAULT_LOOKBACK,
    max_iter: int = DEFAULT_MAX_ITER,
    coupling: float = DEFAULT_COUPLING,
) -> BanachResult | None:
    """Full Banach fixed-point analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)

    # Estimate game parameters from market data
    mean_r = sum(returns) / len(returns)
    var_r = sum((r - mean_r) ** 2 for r in returns) / len(returns)
    std_r = math.sqrt(var_r)

    # Player 1 = momentum, Player 2 = mean-reversion; coupling = interaction
    params = {
        "a1": 0.02 if mean_r > 0 else -0.02,
        "b1": 0.05,
        "c1": coupling,
        "a2": -mean_r * 0.5,
        "b2": 0.05,
        "c2": coupling,
    }

    q = contraction_constant(params)

    # Initial conditions from recent data
    x0 = returns[-1] if returns else 0.01
    y0 = -x0 * 0.5

    result = fixed_point_iteration(x0, y0, params, max_iter)

    # Analytical Nash equilibrium
    det = 4 * params["b1"] * params["b2"] - params["c1"] * params["c2"]
    nash_x = (params["a1"] * 2 * params["b2"] - params["c1"] * params["a2"]) / det if det != 0 else 0.0
    nash_y = (params["a2"] * 2 * params["b1"] - params["c2"] * params["a1"]) / det if det != 0 else 0.0

    # Convergence rate
    final_error = result["errors"][-1]["error"]
    if len(result["errors"]) > 2:
        prev_error = result["errors"][-2]["error"]
        convergence_rate = math.log(final_error + 1e-20) / math.log(prev_error + 1e-20)
    else:
        convergence_rate = 0.0

    signal, reason = banach_signal(
        q, result["converged"], nash_x, nash_y, len(result["trajectory"]) - 1, final_error, max_iter
    )

    # Error decay
    error_decay = [{"iter": e["iter"], "log_error": math.log(e["error"] + 1e-20)} for e in result["errors"]]

    return BanachResult(
        result=result,
        params=params,
        q=q,
        nash_x=nash_x,
        nash_y=nash_y,
        signal=signal,
        reason=reason,
        final_error=final_error,
        convergence_rate=convergence_rate,
        error_decay=error_decay,
        mean_r=mean_r,
        std_r=std_r,
    )
