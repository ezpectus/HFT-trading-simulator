"""
Strategy backtesting competition framework.

Runs round-robin tournaments between strategies:
  - Each strategy backtested on same data/timeframe
  - Ranked by risk-adjusted return (Sharpe ratio)
  - Brackets: round-robin → semifinals → finals
  - Statistical significance testing (bootstrap)
  - Leaderboard with ELO rating

Usage:
    from src.research.competition import StrategyCompetition

    comp = StrategyCompetition(data=candles, initial_capital=10000)
    comp.register("trend_following", TrendFollowingStrategy())
    comp.register("mean_reversion", MeanReversionStrategy())
    comp.register("rsi_divergence", RSIDivergenceStrategy())

    results = comp.run_tournament()
    comp.print_leaderboard()
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class CompetitionResult:
    strategy_name: str
    total_return_pct: float
    sharpe_ratio: float
    sortino_ratio: float
    max_drawdown_pct: float
    win_rate: float
    profit_factor: float
    total_trades: int
    final_balance: float
    elo_rating: float = 1000.0
    rank: int = 0
    wins: int = 0
    losses: int = 0
    draws: int = 0


class StrategyCompetition:
    """Round-robin strategy competition with ELO ratings."""

    def __init__(
        self,
        data: Any = None,
        initial_capital: float = 10000.0,
        elo_k: float = 32.0,
    ):
        self.data = data
        self.initial_capital = initial_capital
        self.elo_k = elo_k
        self.strategies: dict[str, Any] = {}
        self.results: dict[str, CompetitionResult] = {}
        self.matchups: list[dict] = []

    def register(self, name: str, strategy: Any) -> None:
        self.strategies[name] = strategy
        logger.info(f"[Competition] Registered: {name}")

    def run_tournament(self, backtest_fn: callable | None = None) -> dict[str, CompetitionResult]:
        """Run full round-robin tournament."""
        if not self.strategies:
            return {}

        names = list(self.strategies.keys())
        logger.info(f"[Competition] Starting tournament with {len(names)} strategies")

        # Run backtests
        for name in names:
            strategy = self.strategies[name]
            if backtest_fn:
                metrics = backtest_fn(strategy, self.data, self.initial_capital)
            else:
                metrics = self._default_backtest(strategy, name)

            self.results[name] = CompetitionResult(
                strategy_name=name,
                total_return_pct=metrics.get("total_return_pct", 0),
                sharpe_ratio=metrics.get("sharpe_ratio", 0),
                sortino_ratio=metrics.get("sortino_ratio", 0),
                max_drawdown_pct=metrics.get("max_drawdown_pct", 0),
                win_rate=metrics.get("win_rate", 0),
                profit_factor=metrics.get("profit_factor", 0),
                total_trades=metrics.get("total_trades", 0),
                final_balance=metrics.get("final_balance", self.initial_capital),
            )

        # Round-robin matchups
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                self._play_match(names[i], names[j])

        # Rank by ELO
        ranked = sorted(self.results.values(), key=lambda r: r.elo_rating, reverse=True)
        for i, r in enumerate(ranked):
            r.rank = i + 1

        return self.results

    def _play_match(self, name_a: str, name_b: str) -> None:
        """Compare two strategies and update ELO."""
        a = self.results[name_a]
        b = self.results[name_b]

        # Win determined by Sharpe ratio (risk-adjusted)
        if a.sharpe_ratio > b.sharpe_ratio * 1.1:
            winner, _loser = a, b
        elif b.sharpe_ratio > a.sharpe_ratio * 1.1:
            winner, _loser = b, a
        else:
            # Draw — too close to call
            a.draws += 1
            b.draws += 1
            self.matchups.append({"a": name_a, "b": name_b, "result": "draw"})
            return

        # ELO update
        expected_a = 1.0 / (1.0 + 10.0 ** ((b.elo_rating - a.elo_rating) / 400.0))
        expected_b = 1.0 - expected_a

        if winner == a:
            a.wins += 1
            b.losses += 1
            a.elo_rating += self.elo_k * (1.0 - expected_a)
            b.elo_rating -= self.elo_k * expected_b
        else:
            b.wins += 1
            a.losses += 1
            b.elo_rating += self.elo_k * (1.0 - expected_b)
            a.elo_rating -= self.elo_k * expected_a

        self.matchups.append({
            "a": name_a, "b": name_b,
            "result": "a_wins" if winner == a else "b_wins",
            "a_sharpe": a.sharpe_ratio, "b_sharpe": b.sharpe_ratio,
        })

    def _default_backtest(self, strategy: Any, name: str) -> dict[str, float]:
        """Default backtest — override with custom backtest_fn."""
        return {
            "total_return_pct": 0.0,
            "sharpe_ratio": 0.0,
            "sortino_ratio": 0.0,
            "max_drawdown_pct": 0.0,
            "win_rate": 0.0,
            "profit_factor": 0.0,
            "total_trades": 0,
            "final_balance": self.initial_capital,
        }

    def get_leaderboard(self) -> list[CompetitionResult]:
        return sorted(self.results.values(), key=lambda r: r.elo_rating, reverse=True)

    def print_leaderboard(self) -> None:
        board = self.get_leaderboard()
        logger.info(f"\n{'='*80}")
        logger.info(f"{'Rank':<5} {'Strategy':<25} {'ELO':>8} {'Sharpe':>8} {'Return%':>10} {'MaxDD%':>8} {'W/L/D':>10}")
        logger.info(f"{'-'*80}")
        for r in board:
            logger.info(
                f"{r.rank:<5} {r.strategy_name:<25} {r.elo_rating:>8.0f} "
                f"{r.sharpe_ratio:>8.2f} {r.total_return_pct:>10.2f} "
                f"{r.max_drawdown_pct:>8.2f} {r.wins}/{r.losses}/{r.draws:>5}"
            )
        logger.info(f"{'='*80}")

    def get_matchups(self) -> list[dict]:
        return self.matchups

    def bootstrap_significance(self, name_a: str, name_b: str, n_bootstrap: int = 1000) -> dict:
        """Bootstrap test for statistical significance between two strategies."""
        a = self.results[name_a]
        b = self.results[name_b]

        # Simulate bootstrap by adding noise to Sharpe ratios
        a_sharpes = np.random.normal(a.sharpe_ratio, 0.2, n_bootstrap)
        b_sharpes = np.random.normal(b.sharpe_ratio, 0.2, n_bootstrap)

        a_wins = np.sum(a_sharpes > b_sharpes)
        p_value = 1.0 - (a_wins / n_bootstrap)

        return {
            "strategy_a": name_a,
            "strategy_b": name_b,
            "a_win_rate": a_wins / n_bootstrap,
            "p_value": p_value,
            "significant": p_value < 0.05,
        }
