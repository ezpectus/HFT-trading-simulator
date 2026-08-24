"""Optimal Stopping (Snell Envelope) for American option exercise.

Implements the Snell envelope for optimal exercise of American options
via binomial tree (Cox-Ross-Rubinstein) and Longstaff-Schwartz Monte Carlo.
"""
from __future__ import annotations

import math
import random

DEFAULT_T = 30 / 365
DEFAULT_R = 0.05
DEFAULT_SIGMA = 0.3
DEFAULT_N_STEPS = 50
DEFAULT_N_PATHS = 1000
MIN_PATHS = 3


class BinomialResult:
    """Container for binomial tree American option pricing results."""

    def __init__(
        self,
        price: float,
        exercise_boundaries: list[dict],
        exercise_points: list[dict],
        critical_prices: list[dict],
        params: dict,
    ) -> None:
        self.price = price
        self.exercise_boundaries = exercise_boundaries
        self.exercise_points = exercise_points
        self.critical_prices = critical_prices
        self.params = params


class LongstaffSchwartzResult:
    """Container for Longstaff-Schwartz Monte Carlo results."""

    def __init__(
        self,
        price: float,
        euro_price: float,
        early_exercise_premium: float,
        exercise_prob: list[float],
        exercise_times: list[int],
        n_paths: int,
    ) -> None:
        self.price = price
        self.euro_price = euro_price
        self.early_exercise_premium = early_exercise_premium
        self.exercise_prob = exercise_prob
        self.exercise_times = exercise_times
        self.n_paths = n_paths


class OptimalStoppingResult:
    """Container for combined optimal stopping analysis."""

    def __init__(
        self,
        binomial: BinomialResult,
        lsm: LongstaffSchwartzResult,
        s0: float,
        strike: float,
        sigma: float,
        is_call: bool,
    ) -> None:
        self.binomial = binomial
        self.lsm = lsm
        self.s0 = s0
        self.strike = strike
        self.sigma = sigma
        self.is_call = is_call


def _solve3x3(a: list[list[float]], b: list[float]) -> list[float] | None:
    """Solve a 3x3 linear system via Cramer's rule. None if singular."""
    det = (
        a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
        - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
        + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])
    )
    if abs(det) < 1e-12:
        return None
    x = [
        (
            b[0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
            - a[0][1] * (b[1] * a[2][2] - a[1][2] * b[2])
            + a[0][2] * (b[1] * a[2][1] - a[1][1] * b[2])
        ) / det,
        (
            a[0][0] * (b[1] * a[2][2] - a[1][2] * b[2])
            - b[0] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
            + a[0][2] * (a[1][0] * b[2] - b[1] * a[2][0])
        ) / det,
        (
            a[0][0] * (a[1][1] * b[2] - b[1] * a[2][1])
            - a[0][1] * (a[1][0] * b[2] - b[1] * a[2][0])
            + b[0] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])
        ) / det,
    ]
    return x


def binomial_american(
    s0: float,
    k: float,
    t: float,
    r: float,
    sigma: float,
    n_steps: int,
    is_call: bool = True,
) -> BinomialResult | None:
    """Binomial tree American option price via Snell envelope. None if invalid params."""
    if s0 <= 0 or k <= 0 or t <= 0 or sigma <= 0 or n_steps <= 0:
        return None

    dt = t / n_steps
    u = math.exp(sigma * math.sqrt(dt))
    d = 1 / u
    risk_free = math.exp(r * dt)
    p = (risk_free - d) / (u - d)
    disc = 1 / risk_free

    stock = [s0 * u ** (n_steps - 2 * j) for j in range(n_steps + 1)]
    option_values = [max(0.0, s - k if is_call else k - s) for s in stock]

    exercise_boundaries: list[dict] = []
    for step in range(n_steps - 1, -1, -1):
        new_values: list[float] = []
        boundary: list[dict] = []
        for j in range(step + 1):
            s = s0 * u ** (step - 2 * j)
            intrinsic = max(0.0, s - k if is_call else k - s)
            continuation = disc * (p * option_values[j] + (1 - p) * option_values[j + 1])
            new_values.append(max(intrinsic, continuation))
            boundary.append(
                {"stock": s, "intrinsic": intrinsic, "continuation": continuation,
                 "exercise": intrinsic >= continuation}
            )
        option_values = new_values
        exercise_boundaries.append({"step": step, "boundary": boundary})

    exercise_points = [
        {"step": eb["step"], "stock": b["stock"], "intrinsic": b["intrinsic"],
         "continuation": b["continuation"]}
        for eb in exercise_boundaries
        for b in eb["boundary"]
        if b["exercise"]
    ]

    critical_prices: list[dict] = []
    for eb in exercise_boundaries:
        exercise_nodes = [b for b in eb["boundary"] if b["exercise"]]
        if not exercise_nodes:
            critical_prices.append({"step": eb["step"], "price": math.inf if is_call else 0.0})
            continue
        min_ex = min(b["stock"] for b in exercise_nodes)
        no_ex = [b for b in eb["boundary"] if not b["exercise"]]
        max_no_ex = max((b["stock"] for b in no_ex), default=0.0)
        critical_prices.append({"step": eb["step"], "price": min_ex if is_call else max_no_ex})

    return BinomialResult(
        price=option_values[0],
        exercise_boundaries=exercise_boundaries,
        exercise_points=exercise_points,
        critical_prices=critical_prices,
        params={"S0": s0, "K": k, "T": t, "r": r, "sigma": sigma,
                "nSteps": n_steps, "isCall": is_call, "u": u, "d": d, "p": p, "dt": dt},
    )


def longstaff_schwartz(
    s0: float,
    k: float,
    t: float,
    r: float,
    sigma: float,
    n_paths: int,
    n_steps: int,
    is_call: bool = True,
    seed: int | None = None,
) -> LongstaffSchwartzResult | None:
    """Longstaff-Schwartz Monte Carlo American option price. None if invalid params."""
    if s0 <= 0 or k <= 0 or t <= 0 or sigma <= 0 or n_paths < MIN_PATHS or n_steps <= 0:
        return None

    rng = random.Random(seed)
    dt = t / n_steps

    paths: list[list[float]] = []
    for _ in range(n_paths):
        path = [s0]
        for _step in range(1, n_steps + 1):
            z = rng.gauss(0, 1)
            s_prev = path[-1]
            path.append(s_prev * math.exp((r - 0.5 * sigma * sigma) * dt + sigma * math.sqrt(dt) * z))
        paths.append(path)

    def payoff(s: float) -> float:
        return max(0.0, s - k if is_call else k - s)

    cash_flows = [[0.0] * (n_steps + 1) for _ in range(n_paths)]
    for i in range(n_paths):
        cash_flows[i][n_steps] = payoff(paths[i][n_steps])
    exercise_times = [n_steps] * n_paths

    for step in range(n_steps - 1, 0, -1):
        itm = [i for i in range(n_paths) if payoff(paths[i][step]) > 0]
        if len(itm) < MIN_PATHS:
            continue

        x = [[1.0, paths[i][step], paths[i][step] ** 2] for i in itm]
        y: list[float] = []
        for i in itm:
            value = 0.0
            for tau in range(step + 1, n_steps + 1):
                if cash_flows[i][tau] > 0:
                    value = cash_flows[i][tau] * math.exp(-r * (tau - step) * dt)
                    break
            y.append(value)

        xtx = [[0.0] * 3 for _ in range(3)]
        xty = [0.0] * 3
        for k_idx in range(len(x)):
            for a in range(3):
                xty[a] += x[k_idx][a] * y[k_idx]
                for b in range(3):
                    xtx[a][b] += x[k_idx][a] * x[k_idx][b]

        coeffs = _solve3x3(xtx, xty)
        if coeffs is None:
            continue

        for i in itm:
            s = paths[i][step]
            continuation = coeffs[0] + coeffs[1] * s + coeffs[2] * s * s
            intrinsic = payoff(s)
            if intrinsic >= continuation and intrinsic > 0:
                cash_flows[i] = [0.0] * (n_steps + 1)
                cash_flows[i][step] = intrinsic
                exercise_times[i] = step

    total = sum(
        cash_flows[i][exercise_times[i]] * math.exp(-r * exercise_times[i] * dt)
        for i in range(n_paths)
    )
    price = total / n_paths
    euro_price = sum(payoff(paths[i][n_steps]) * math.exp(-r * t) for i in range(n_paths)) / n_paths
    early_exercise_premium = price - euro_price

    exercise_prob = [0.0] * (n_steps + 1)
    for i in range(n_paths):
        exercise_prob[exercise_times[i]] += 1
    for step in range(n_steps + 1):
        exercise_prob[step] /= n_paths

    return LongstaffSchwartzResult(
        price=price,
        euro_price=euro_price,
        early_exercise_premium=early_exercise_premium,
        exercise_prob=exercise_prob,
        exercise_times=exercise_times,
        n_paths=n_paths,
    )


def estimate_annualized_volatility(prices: list[float]) -> float | None:
    """Annualized volatility from simple returns (sqrt(365)). None if insufficient."""
    if not prices or len(prices) < 2:
        return None
    returns = []
    for i in range(1, len(prices)):
        if prices[i - 1] > 0:
            returns.append((prices[i] - prices[i - 1]) / prices[i - 1])
    if not returns:
        return None
    mean = sum(returns) / len(returns)
    variance = sum((r - mean) ** 2 for r in returns) / len(returns)
    return math.sqrt(variance) * math.sqrt(365)


def optimal_stopping_analysis(
    prices: list[float],
    strike: float | None = None,
    t: float = DEFAULT_T,
    r: float = DEFAULT_R,
    sigma: float | None = None,
    n_steps: int = DEFAULT_N_STEPS,
    n_paths: int = DEFAULT_N_PATHS,
    is_call: bool = False,
    seed: int | None = None,
) -> OptimalStoppingResult | None:
    """Full optimal stopping analysis with parameters estimated from prices."""
    if not prices:
        return None
    s0 = prices[-1]
    if strike is None:
        strike = s0
    if sigma is None:
        sigma = estimate_annualized_volatility(prices) or DEFAULT_SIGMA

    binomial = binomial_american(s0, strike, t, r, sigma, n_steps, is_call)
    lsm = longstaff_schwartz(s0, strike, t, r, sigma, n_paths, n_steps, is_call, seed)
    if binomial is None or lsm is None:
        return None
    return OptimalStoppingResult(
        binomial=binomial, lsm=lsm, s0=s0, strike=strike, sigma=sigma, is_call=is_call
    )
