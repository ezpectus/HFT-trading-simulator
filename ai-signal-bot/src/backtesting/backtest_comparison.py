"""Backtest comparison — compare multiple backtests side-by-side.

Metrics table, equity curve overlay, statistical significance (bootstrap),
export to CSV/JSON.
"""

from __future__ import annotations

import csv
import io
import json
import logging
from dataclasses import dataclass, field

import numpy as np

from src.backtesting.backtester import BacktestResult

logger = logging.getLogger(__name__)


@dataclass
class ComparisonRow:
    name: str
    total_return_pct: float
    sharpe_ratio: float
    sortino_ratio: float
    calmar_ratio: float
    max_drawdown_pct: float
    win_rate: float
    profit_factor: float
    total_trades: int
    final_equity: float


@dataclass
class ComparisonResult:
    rows: list[ComparisonRow] = field(default_factory=list)
    best_by_sharpe: str = ""
    best_by_return: str = ""
    best_by_calmar: str = ""
    best_by_profit_factor: str = ""
    significance_tests: dict = field(default_factory=dict)
    equity_curves: dict[str, list[float]] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "rows": [r.__dict__ for r in self.rows],
            "best_by_sharpe": self.best_by_sharpe,
            "best_by_return": self.best_by_return,
            "best_by_calmar": self.best_by_calmar,
            "best_by_profit_factor": self.best_by_profit_factor,
            "significance_tests": self.significance_tests,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)

    def to_csv(self) -> str:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Name", "Total Return %", "Sharpe", "Sortino", "Calmar",
            "Max DD %", "Win Rate %", "Profit Factor", "Trades", "Final Equity"
        ])
        for r in self.rows:
            writer.writerow([
                r.name, f"{r.total_return_pct:.2f}", f"{r.sharpe_ratio:.4f}",
                f"{r.sortino_ratio:.4f}", f"{r.calmar_ratio:.4f}",
                f"{r.max_drawdown_pct:.2f}", f"{r.win_rate:.2f}",
                f"{r.profit_factor:.4f}", r.total_trades, f"{r.final_equity:.2f}"
            ])
        return output.getvalue()


class BacktestComparison:
    """Compare multiple backtest results."""

    def __init__(self):
        self.results: dict[str, BacktestResult] = {}

    def add(self, name: str, result: BacktestResult) -> None:
        """Add a backtest result for comparison."""
        self.results[name] = result

    def to_csv(self) -> str:
        """Export comparison results to CSV (delegates to compare().to_csv)."""
        return self.compare().to_csv()

    def compare(self) -> ComparisonResult:
        """Run comparison across all added backtests."""
        result = ComparisonResult()

        for name, bt in self.results.items():
            row = ComparisonRow(
                name=name,
                total_return_pct=bt.total_return_pct,
                sharpe_ratio=bt.sharpe_ratio,
                sortino_ratio=bt.sortino_ratio,
                calmar_ratio=bt.calmar_ratio,
                max_drawdown_pct=bt.max_drawdown_pct,
                win_rate=bt.win_rate,
                profit_factor=bt.profit_factor,
                total_trades=bt.total_trades,
                final_equity=bt.final_equity,
            )
            result.rows.append(row)
            result.equity_curves[name] = bt.equity_curve

        if not result.rows:
            return result

        # Find best by each metric
        result.best_by_sharpe = max(result.rows, key=lambda r: r.sharpe_ratio).name
        result.best_by_return = max(result.rows, key=lambda r: r.total_return_pct).name
        result.best_by_calmar = max(result.rows, key=lambda r: r.calmar_ratio).name
        result.best_by_profit_factor = max(result.rows, key=lambda r: r.profit_factor).name

        # Pairwise significance tests
        names = list(self.results.keys())
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                pair = f"{names[i]}_vs_{names[j]}"
                result.significance_tests[pair] = self._bootstrap_test(
                    self.results[names[i]], self.results[names[j]]
                )

        return result

    def _bootstrap_test(self, a: BacktestResult, b: BacktestResult, n_bootstrap: int = 1000) -> dict:
        """Bootstrap test for statistical significance between two backtests."""
        if len(a.equity_curve) < 10 or len(b.equity_curve) < 10:
            return {"significant": False, "p_value": 1.0}

        # Compute per-bar returns
        returns_a = np.diff(a.equity_curve) / np.maximum(np.array(a.equity_curve[:-1]), 1e-10)
        returns_b = np.diff(b.equity_curve) / np.maximum(np.array(b.equity_curve[:-1]), 1e-10)

        min_len = min(len(returns_a), len(returns_b))
        returns_a = returns_a[:min_len]
        returns_b = returns_b[:min_len]

        observed_diff = returns_a.mean() - returns_b.mean()

        # Bootstrap
        rng = np.random.default_rng(42)
        boot_diffs = []
        combined = np.column_stack([returns_a, returns_b])
        for _ in range(n_bootstrap):
            indices = rng.integers(0, min_len, size=min_len)
            sample_a = combined[indices, 0].mean()
            sample_b = combined[indices, 1].mean()
            boot_diffs.append(sample_a - sample_b)

        boot_diffs = np.array(boot_diffs)
        p_value = np.mean(np.abs(boot_diffs) >= np.abs(observed_diff))

        return {
            "significant": p_value < 0.05,
            "p_value": float(p_value),
            "observed_diff": float(observed_diff),
            "confidence_interval": [
                float(np.percentile(boot_diffs, 2.5)),
                float(np.percentile(boot_diffs, 97.5)),
            ],
        }

    def print_table(self) -> str:
        """Print formatted comparison table."""
        result = self.compare()
        header = f"{'Name':<20} {'Return%':>10} {'Sharpe':>8} {'Sortino':>8} {'Calmar':>8} {'MaxDD%':>8} {'WinRate':>8} {'PF':>8} {'Trades':>8}"
        separator = "-" * len(header)
        lines = [header, separator]
        for r in result.rows:
            lines.append(
                f"{r.name:<20} {r.total_return_pct:>10.2f} {r.sharpe_ratio:>8.4f} "
                f"{r.sortino_ratio:>8.4f} {r.calmar_ratio:>8.4f} {r.max_drawdown_pct:>8.2f} "
                f"{r.win_rate:>8.2f} {r.profit_factor:>8.4f} {r.total_trades:>8d}"
            )
        lines.append(separator)
        lines.append(f"Best Sharpe:       {result.best_by_sharpe}")
        lines.append(f"Best Return:       {result.best_by_return}")
        lines.append(f"Best Calmar:       {result.best_by_calmar}")
        lines.append(f"Best Profit Factor:{result.best_by_profit_factor}")
        return "\n".join(lines)
