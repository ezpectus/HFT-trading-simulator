"""Itô Calculus Generator (infinitesimal generator of diffusions).

Computes the infinitesimal generator A of an Itô diffusion, which
characterizes the expected rate of change of functions of the process.
"""
from __future__ import annotations

import math

from src.research._common import compute_returns

MIN_PRICES = 50
DEFAULT_MODEL_TYPE = "ou"
DEFAULT_LOOKBACK = 100
DEFAULT_FUNC_TYPE = "identity"
N_GRID = 60
HIT_ITERATIONS = 5000
HIT_DT = 0.001
SIGNAL_THRESHOLD = 0.0001


class ItoGeneratorResult:
    """Container for Itô generator analysis results."""

    def __init__(
        self,
        x_grid: list[float],
        af_values: list[float],
        f_values: list[float],
        dynkin_predictions: list[dict],
        hitting_times: list[float],
        current_hitting_time: float,
        stationary: list[float],
        signal: str,
        reason: str,
        af_current: float,
        current_x: float,
        params: dict,
        func_name: str,
        dx: float,
    ) -> None:
        self.x_grid = x_grid
        self.af_values = af_values
        self.f_values = f_values
        self.dynkin_predictions = dynkin_predictions
        self.hitting_times = hitting_times
        self.current_hitting_time = current_hitting_time
        self.stationary = stationary
        self.signal = signal
        self.reason = reason
        self.af_current = af_current
        self.current_x = current_x
        self.params = params
        self.func_name = func_name
        self.dx = dx


def apply_generator(x: float, mu_fn, sigma_fn, f, f_prime, f_double_prime) -> float:
    """A·f(x) = μ(x)·f'(x) + (1/2)·σ²(x)·f''(x)."""
    return mu_fn(x) * f_prime(x) + 0.5 * sigma_fn(x) ** 2 * f_double_prime(x)


def num_prime(f, x: float, h: float = 1e-5) -> float:
    """Central difference first derivative."""
    return (f(x + h) - f(x - h)) / (2 * h)


def num_double_prime(f, x: float, h: float = 1e-4) -> float:
    """Central difference second derivative."""
    return (f(x + h) - 2 * f(x) + f(x - h)) / (h * h)


def expected_hitting_time(
    x_grid: list[float],
    mu_fn,
    sigma_fn,
    target_idx: int,
    iterations: int = HIT_ITERATIONS,
    dt: float = HIT_DT,
) -> list[float]:
    """Solve A·T = -1 with T(target) = 0 via tridiagonal (Thomas) solve.

    Central-difference discretization:
        μ_i·(T_{i+1}-T_{i-1})/(2dx) + (1/2)σ²_i·(T_{i+1}-2T_i+T_{i-1})/dx² = -1
    Dirichlet condition T(target) = 0; Neumann (copy) conditions at the ends.

    Note: the UI's explicit iteration T += dt·(-1 - A·T) is numerically
    unstable (diverges from a zero initial guess, stuck at 0); the port
    solves the linear system directly. `iterations`/`dt` are accepted for
    API compatibility with the UI but not used by the direct solver.
    """
    n = len(x_grid)
    dx = x_grid[1] - x_grid[0]
    target_idx = max(1, min(n - 2, target_idx))

    lower = [0.0] * n
    diag = [0.0] * n
    upper = [0.0] * n
    rhs = [-1.0] * n

    for i in range(1, n - 1):
        m = mu_fn(x_grid[i])
        s2 = sigma_fn(x_grid[i]) ** 2
        lower[i] = -m / (2 * dx) + 0.5 * s2 / (dx * dx)
        diag[i] = -s2 / (dx * dx)
        upper[i] = m / (2 * dx) + 0.5 * s2 / (dx * dx)

    # Dirichlet at target: T[target] = 0
    lower[target_idx] = 0.0
    diag[target_idx] = 1.0
    upper[target_idx] = 0.0
    rhs[target_idx] = 0.0

    # Neumann (copy) at boundaries: T[0] = T[1], T[n-1] = T[n-2]
    diag[0] = 1.0
    upper[0] = -1.0
    rhs[0] = 0.0
    lower[n - 1] = -1.0
    diag[n - 1] = 1.0
    rhs[n - 1] = 0.0

    # Thomas algorithm
    cp = [0.0] * n
    dp = [0.0] * n
    cp[0] = upper[0] / diag[0]
    dp[0] = rhs[0] / diag[0]
    for i in range(1, n):
        denom = diag[i] - lower[i] * cp[i - 1]
        if abs(denom) < 1e-300:
            denom = 1e-300
        cp[i] = upper[i] / denom if i < n - 1 else 0.0
        dp[i] = (rhs[i] - lower[i] * dp[i - 1]) / denom

    t_values = [0.0] * n
    t_values[n - 1] = dp[n - 1]
    for i in range(n - 2, -1, -1):
        t_values[i] = dp[i] - cp[i] * t_values[i + 1]

    return [max(0.0, v) for v in t_values]


def ito_signal(af_current: float) -> tuple[str, str]:
    """Signal from the generator value at the current return."""
    if af_current > SIGNAL_THRESHOLD:
        return (
            "GENERATOR_POSITIVE",
            f"A·f(x) = {af_current:.6f} > 0 (expected increase in f(X_t))",
        )
    if af_current < -SIGNAL_THRESHOLD:
        return (
            "GENERATOR_NEGATIVE",
            f"A·f(x) = {af_current:.6f} < 0 (expected decrease in f(X_t))",
        )
    return (
        "NEUTRAL",
        f"A·f(x) = {af_current:.6f} ≈ 0 (f is harmonic, no drift)",
    )


def ito_generator_analysis(
    prices: list[float],
    model_type: str = DEFAULT_MODEL_TYPE,
    lookback: int = DEFAULT_LOOKBACK,
    func_type: str = DEFAULT_FUNC_TYPE,
) -> ItoGeneratorResult | None:
    """Full Itô generator analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)

    mean_r = sum(returns) / len(returns)
    var_r = sum((r - mean_r) ** 2 for r in returns) / len(returns)
    std_r = math.sqrt(var_r)

    # ACF(1) for OU kappa
    acf1 = 0.0
    for i in range(len(returns) - 1):
        acf1 += (returns[i] - mean_r) * (returns[i + 1] - mean_r)
    acf1 /= (len(returns) - 1) * var_r if var_r > 0 else 1.0
    kappa = -math.log(acf1) if 0 < acf1 < 1 else 1.0
    theta = mean_r
    sigma_ou = std_r * math.sqrt(2 * max(0.01, kappa))

    # Model functions
    if model_type == "ou":
        def mu_fn(x):
            return kappa * (theta - x)
        def sigma_fn(x):
            return sigma_ou
    elif model_type == "gbm":
        def mu_fn(x):
            return mean_r * x
        def sigma_fn(x):
            return std_r * abs(x)
    else:
        def mu_fn(x):
            return mean_r
        def sigma_fn(x):
            return std_r

    # Test functions
    test_functions = {
        "identity": {
            "f": lambda x: x,
            "f_prime": lambda x: 1.0,
            "f_double_prime": lambda x: 0.0,
            "name": "f(x) = x",
        },
        "square": {
            "f": lambda x: x * x,
            "f_prime": lambda x: 2 * x,
            "f_double_prime": lambda x: 2.0,
            "name": "f(x) = x²",
        },
        "exp": {
            "f": lambda x: math.exp(x),
            "f_prime": lambda x: math.exp(x),
            "f_double_prime": lambda x: math.exp(x),
            "name": "f(x) = eˣ",
        },
        "log": {
            "f": lambda x: math.log(abs(x) + 0.01),
            "f_prime": lambda x: 1.0 / (x + 0.01),
            "f_double_prime": lambda x: -1.0 / ((x + 0.01) ** 2),
            "name": "f(x) = ln|x|",
        },
        "cosh": {
            "f": lambda x: math.cosh(x),
            "f_prime": lambda x: math.sinh(x),
            "f_double_prime": lambda x: math.cosh(x),
            "name": "f(x) = cosh(x)",
        },
    }
    tf = test_functions.get(func_type, test_functions["identity"])

    # Grid
    x_min = mean_r - 4 * std_r
    x_max = mean_r + 4 * std_r
    dx = (x_max - x_min) / (N_GRID - 1)
    x_grid = [x_min + i * dx for i in range(N_GRID)]

    # Compute A·f on grid
    af_values = [
        apply_generator(x, mu_fn, sigma_fn, tf["f"], tf["f_prime"], tf["f_double_prime"])
        for x in x_grid
    ]
    f_values = [tf["f"](x) for x in x_grid]

    # Dynkin's formula verification: E[f(X_t)] ≈ f(x) + A·f(x)·t
    current_x = returns[-1]
    af_current = apply_generator(current_x, mu_fn, sigma_fn, tf["f"], tf["f_prime"], tf["f_double_prime"])
    dynkin_predictions = []
    for t in range(21):
        dynkin_predictions.append(
            {
                "t": t * 0.1,
                "predicted": tf["f"](current_x) + af_current * t * 0.1,
                "actual": tf["f"](current_x),
            }
        )

    # Expected hitting time to mean
    target_idx = math.floor((theta - x_min) / dx)
    hitting_times = expected_hitting_time(
        x_grid, mu_fn, sigma_fn, max(1, min(N_GRID - 2, target_idx))
    )
    current_idx = max(1, min(N_GRID - 2, math.floor((current_x - x_min) / dx)))
    current_hitting_time = hitting_times[current_idx]

    # Stationary distribution (OU): N(θ, σ²/(2κ))
    stat_var = sigma_ou ** 2 / (2 * max(0.01, kappa))
    stationary = [
        math.exp(-((x - theta) ** 2) / (2 * stat_var)) / math.sqrt(2 * math.pi * stat_var)
        for x in x_grid
    ]

    signal, reason = ito_signal(af_current)

    return ItoGeneratorResult(
        x_grid=x_grid,
        af_values=af_values,
        f_values=f_values,
        dynkin_predictions=dynkin_predictions,
        hitting_times=hitting_times,
        current_hitting_time=current_hitting_time,
        stationary=stationary,
        signal=signal,
        reason=reason,
        af_current=af_current,
        current_x=current_x,
        params={"kappa": kappa, "theta": theta, "sigma_ou": sigma_ou, "mean_r": mean_r, "std_r": std_r},
        func_name=tf["name"],
        dx=dx,
    )
