"""Lax-Milgram Theorem (variational formulation for PDEs).

Uses the Lax-Milgram theorem to solve variational problems arising
from PDEs in financial mathematics, ensuring existence and uniqueness.
"""
from __future__ import annotations

import math

from src.research._common import compute_returns

MIN_PRICES = 20
DEFAULT_LOOKBACK = 100
DEFAULT_EPS = 0.01
DEFAULT_B = 0.0
DEFAULT_C = 1.0
DEFAULT_N_ELEMENTS = 50
EPS_SWEEP = [0.001, 0.005, 0.01, 0.05, 0.1, 0.5]


class LaxResult:
    """Container for Lax-Milgram analysis results."""

    def __init__(
        self,
        grid: list[dict],
        solution: dict,
        eps_sweep: list[dict],
        is_coercive: bool,
        is_bounded: bool,
        lax_milgram_applies: bool,
        u_at_current: float,
        signal: str,
        reason: str,
        mean_r: float,
        std_r: float,
        current_return: float,
    ) -> None:
        self.grid = grid
        self.solution = solution
        self.eps_sweep = eps_sweep
        self.is_coercive = is_coercive
        self.is_bounded = is_bounded
        self.lax_milgram_applies = lax_milgram_applies
        self.u_at_current = u_at_current
        self.signal = signal
        self.reason = reason
        self.mean_r = mean_r
        self.std_r = std_r
        self.current_return = current_return


def solve_variational(
    eps: float,
    b: float,
    c: float,
    f,
    n_elements: int,
    n_points: int,
) -> dict:
    """Solve variational problem a(u,v) = L(v) via linear FEM (Thomas)."""
    h = 1 / n_elements
    n = n_elements + 1  # nodes

    # Stiffness matrix (tridiagonal for linear FEM)
    a = [[0.0] * n for _ in range(n)]
    f_vec = [0.0] * n

    for e in range(n_elements):
        i = e
        j = e + 1
        # Local stiffness: a(phi_i, phi_j) on element [x_e, x_{e+1}]
        # eps·∫phi'_i phi'_j dx = eps/h·[[1,-1],[-1,1]]
        # b·∫phi'_i phi_j dx = b/2·[[-1,1],[-1,1]]
        # c·∫phi_i phi_j dx = c·h/6·[[2,1],[1,2]]
        a[i][i] += eps / h + c * h / 3 - b / 2
        a[i][j] += -eps / h + c * h / 6 + b / 2
        a[j][i] += -eps / h + c * h / 6 - b / 2
        a[j][j] += eps / h + c * h / 3 + b / 2

        # Load: f·∫phi_i dx = f·h/2
        xm = (e + 0.5) * h
        fe = f(xm) if callable(f) else f
        f_vec[i] += fe * h / 2
        f_vec[j] += fe * h / 2

    # Boundary conditions: u(0) = u(1) = 0 (Dirichlet)
    a[0][0] = 1
    a[0][1] = 0
    f_vec[0] = 0
    a[n - 1][n - 1] = 1
    a[n - 1][n - 2] = 0
    f_vec[n - 1] = 0

    # Solve tridiagonal system (Thomas algorithm)
    cp = [0.0] * n
    dp = [0.0] * n
    cp[0] = a[0][1] / a[0][0]
    dp[0] = f_vec[0] / a[0][0]
    for i in range(1, n):
        m = a[i][i] - a[i][i - 1] * cp[i - 1]
        cp[i] = a[i][i + 1] / m if i < n - 1 else 0.0
        dp[i] = (f_vec[i] - a[i][i - 1] * dp[i - 1]) / m

    u = [0.0] * n
    u[n - 1] = dp[n - 1]
    for i in range(n - 2, -1, -1):
        u[i] = dp[i] - cp[i] * u[i + 1]

    # Coercivity check: a(u,u) >= alpha·||u||²
    a_uu = 0.0
    u_norm_sq = 0.0
    for e in range(n_elements):
        du = (u[e + 1] - u[e]) / h
        um = (u[e + 1] + u[e]) / 2
        a_uu += eps * du * du * h + c * um * um * h
        u_norm_sq += um * um * h
    alpha = a_uu / u_norm_sq if u_norm_sq > 0 else 0.0

    # Boundedness constant
    c_bound = eps / h + abs(b) / 2 + c * h / 3

    return {"u": u, "alpha": alpha, "C": c_bound, "h": h, "n": n}


def lax_signal(u_at_current: float) -> tuple[str, str]:
    """Signal from variational solution value at current return location."""
    if u_at_current > 0.01:
        return "VARIATIONAL_LONG", f"u(x_current) = {u_at_current:.6f} > 0 (variational solution suggests long)"
    if u_at_current < -0.01:
        return "VARIATIONAL_SHORT", f"u(x_current) = {u_at_current:.6f} < 0 (variational solution suggests short)"
    return "NEUTRAL", f"u(x_current) = {u_at_current:.6f} (neutral)"


def lax_analysis(
    prices: list[float],
    lookback: int = DEFAULT_LOOKBACK,
    eps: float = DEFAULT_EPS,
    b: float = DEFAULT_B,
    c: float = DEFAULT_C,
    n_elements: int = DEFAULT_N_ELEMENTS,
) -> LaxResult | None:
    """Full Lax-Milgram analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)

    n = len(returns)
    if n < 20:
        return None

    # Use returns to define forcing function f(x)
    mean_r = sum(returns) / n
    std_r = math.sqrt(sum((r - mean_r) ** 2 for r in returns) / n)

    # Forcing function: peaks at current return level
    current_return = returns[-1]

    def f(x: float) -> float:
        xc = (current_return - mean_r) / (4 * std_r + 0.001) + 0.5
        return math.exp(-((x - xc) ** 2) / 0.05) * abs(current_return) * 100

    # Solve variational problem
    solution = solve_variational(eps, b, c, f, n_elements, n_elements + 1)

    # Grid points
    grid = []
    for i in range(n_elements + 1):
        x = i / n_elements
        grid.append({"x": x, "u": solution["u"][i], "f": f(x)})

    # Coercivity and boundedness
    is_coercive = solution["alpha"] > 0
    is_bounded = solution["C"] > 0 and solution["C"] < 1e6
    lax_milgram_applies = is_coercive and is_bounded

    # Vary epsilon to see effect on solution
    eps_sweep = []
    for e in EPS_SWEEP:
        sol = solve_variational(e, b, c, f, n_elements, n_elements + 1)
        eps_sweep.append({"eps": e, "u": sol["u"], "alpha": sol["alpha"]})

    # Signal: use solution value at current return location
    xc = (current_return - mean_r) / (4 * std_r + 0.001) + 0.5
    idx = min(n_elements, max(0, math.floor(xc * n_elements)))
    u_at_current = solution["u"][idx]

    signal, reason = lax_signal(u_at_current)

    return LaxResult(
        grid=grid,
        solution=solution,
        eps_sweep=eps_sweep,
        is_coercive=is_coercive,
        is_bounded=is_bounded,
        lax_milgram_applies=lax_milgram_applies,
        u_at_current=u_at_current,
        signal=signal,
        reason=reason,
        mean_r=mean_r,
        std_r=std_r,
        current_return=current_return,
    )
