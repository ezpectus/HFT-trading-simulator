"""Monte Carlo simulation for trade-sequence robustness analysis.

Shuffles the realized PnL sequence many times to estimate the distribution
of possible equity outcomes, answering: "how robust is this strategy to
trade-order luck?"
"""
from __future__ import annotations

import math
import random

MIN_TRADES = 5
DEFAULT_RUNS = 100
DEFAULT_BALANCE = 10000.0


class MonteCarloResult:
    """Container for Monte Carlo simulation results."""

    def __init__(
        self,
        percentiles: dict[str, float],
        profit_prob: float,
        median_max_dd: float,
        worst_max_dd: float,
        best_return: float,
        worst_return: float,
        runs: int,
        mean_return: float,
        std_return: float,
        n_trades: int,
    ) -> None:
        self.percentiles = percentiles
        self.profit_prob = profit_prob
        self.median_max_dd = median_max_dd
        self.worst_max_dd = worst_max_dd
        self.best_return = best_return
        self.worst_return = worst_return
        self.runs = runs
        self.mean_return = mean_return
        self.std_return = std_return
        self.n_trades = n_trades


def _max_drawdown(curve: list[float]) -> float:
    """Maximum peak-to-trough drawdown of an equity curve."""
    peak = curve[0]
    max_dd = 0.0
    for value in curve:
        if value > peak:
            peak = value
        dd = peak - value
        if dd > max_dd:
            max_dd = dd
    return max_dd


def _percentile(sorted_values: list[float], q: float) -> float:
    """Value at quantile q of a sorted list (mirrors UI floor indexing)."""
    idx = min(len(sorted_values) - 1, int(len(sorted_values) * q))
    return sorted_values[idx]


def _extract_pnls(trades: list) -> list[float]:
    """Extract PnL values from trade dicts or raw numbers."""
    pnls: list[float] = []
    for trade in trades:
        if isinstance(trade, dict):
            pnls.append(float(trade.get("pnl", 0.0)))
        else:
            pnls.append(float(trade))
    return pnls


def monte_carlo_from_pnls(
    pnls: list[float],
    runs: int = DEFAULT_RUNS,
    initial_balance: float = DEFAULT_BALANCE,
    seed: int | None = None,
) -> MonteCarloResult | None:
    """Monte Carlo simulation on raw PnL values. None if fewer than 5 PnLs."""
    if not pnls or len(pnls) < MIN_TRADES or runs <= 0:
        return None

    rng = random.Random(seed)
    results: list[float] = []
    max_dds: list[float] = []

    for _ in range(runs):
        shuffled = pnls[:]
        rng.shuffle(shuffled)
        equity = initial_balance
        curve = [equity]
        for pnl in shuffled:
            equity += pnl
            curve.append(equity)
        results.append(equity - initial_balance)
        max_dds.append(_max_drawdown(curve))

    results.sort()
    max_dds.sort()

    percentiles = {
        "p5": _percentile(results, 0.05),
        "p25": _percentile(results, 0.25),
        "p50": _percentile(results, 0.50),
        "p75": _percentile(results, 0.75),
        "p95": _percentile(results, 0.95),
    }

    profitable = sum(1 for r in results if r > 0)
    profit_prob = profitable / runs * 100.0
    mean_return = sum(results) / runs
    std_return = math.sqrt(sum((r - mean_return) ** 2 for r in results) / runs)

    return MonteCarloResult(
        percentiles=percentiles,
        profit_prob=profit_prob,
        median_max_dd=max_dds[int(runs * 0.5)],
        worst_max_dd=max_dds[-1],
        best_return=results[-1],
        worst_return=results[0],
        runs=runs,
        mean_return=mean_return,
        std_return=std_return,
        n_trades=len(pnls),
    )


def run_monte_carlo(
    trades: list,
    runs: int = DEFAULT_RUNS,
    initial_balance: float = DEFAULT_BALANCE,
    seed: int | None = None,
) -> MonteCarloResult | None:
    """Monte Carlo simulation on trade dicts (with 'pnl' key) or raw PnL values."""
    if not trades or len(trades) < MIN_TRADES:
        return None
    pnls = _extract_pnls(trades)
    return monte_carlo_from_pnls(pnls, runs=runs, initial_balance=initial_balance, seed=seed)
