"""Tests for BacktestComparison — comparison, best-by-metric, bootstrap, CSV/JSON export."""
import json

import numpy as np
import pytest

from src.backtesting.backtest_comparison import (
    BacktestComparison,
    ComparisonResult,
    ComparisonRow,
)
from src.backtesting.backtest_engine import BacktestResult, BacktestTrade


def make_result(name="test", return_pct=10.0, sharpe=1.5, sortino=2.0,
                calmar=1.2, max_dd=5.0, win_rate=60.0, pf=1.8,
                trades=20, final_equity=11000.0, equity_curve=None):
    if equity_curve is None:
        equity_curve = list(np.linspace(10000, final_equity, 50).tolist())
    return BacktestResult(
        total_return_pct=return_pct,
        total_return=1000.0,
        sharpe_ratio=sharpe,
        sortino_ratio=sortino,
        calmar_ratio=calmar,
        max_drawdown=max_dd,
        max_drawdown_pct=max_dd,
        win_rate=win_rate,
        profit_factor=pf,
        total_trades=trades,
        winning_trades=12,
        losing_trades=8,
        avg_win=100.0,
        avg_loss=-50.0,
        avg_hold_time=3600.0,
        equity_curve=equity_curve,
        underwater_curve=[],
        trades=[],
        final_equity=final_equity,
    )


class TestComparisonRow:
    def test_dataclass(self):
        row = ComparisonRow(
            name="Trend", total_return_pct=15.0, sharpe_ratio=1.8,
            sortino_ratio=2.1, calmar_ratio=1.3, max_drawdown_pct=4.5,
            win_rate=65.0, profit_factor=2.0, total_trades=25,
            final_equity=11500.0,
        )
        assert row.name == "Trend"
        assert row.sharpe_ratio == 1.8
        assert row.total_trades == 25


class TestComparisonResult:
    def test_empty_to_dict(self):
        result = ComparisonResult()
        d = result.to_dict()
        assert d["rows"] == []
        assert d["best_by_sharpe"] == ""

    def test_to_json(self):
        result = ComparisonResult()
        result.best_by_sharpe = "Trend"
        j = result.to_json()
        data = json.loads(j)
        assert data["best_by_sharpe"] == "Trend"

    def test_to_csv(self):
        row = ComparisonRow(
            name="Trend", total_return_pct=15.0, sharpe_ratio=1.8,
            sortino_ratio=2.1, calmar_ratio=1.3, max_drawdown_pct=4.5,
            win_rate=65.0, profit_factor=2.0, total_trades=25,
            final_equity=11500.0,
        )
        result = ComparisonResult(rows=[row])
        csv_str = result.to_csv()
        assert "Name" in csv_str
        assert "Trend" in csv_str
        assert "15.00" in csv_str


class TestBacktestComparison:
    def test_add_and_compare(self):
        comp = BacktestComparison()
        comp.add("Trend", make_result(return_pct=15.0, sharpe=1.8))
        comp.add("MeanRev", make_result(return_pct=8.0, sharpe=1.2))
        result = comp.compare()
        assert len(result.rows) == 2
        assert result.best_by_return == "Trend"
        assert result.best_by_sharpe == "Trend"

    def test_best_by_different_metrics(self):
        comp = BacktestComparison()
        comp.add("A", make_result(return_pct=10.0, sharpe=1.0, calmar=0.5, pf=1.5))
        comp.add("B", make_result(return_pct=8.0, sharpe=2.0, calmar=1.5, pf=2.5))
        result = comp.compare()
        assert result.best_by_return == "A"
        assert result.best_by_sharpe == "B"
        assert result.best_by_calmar == "B"
        assert result.best_by_profit_factor == "B"

    def test_empty_comparison(self):
        comp = BacktestComparison()
        result = comp.compare()
        assert len(result.rows) == 0
        assert result.best_by_sharpe == ""

    def test_single_strategy(self):
        comp = BacktestComparison()
        comp.add("Only", make_result())
        result = comp.compare()
        assert len(result.rows) == 1
        assert result.best_by_sharpe == "Only"
        assert result.best_by_return == "Only"

    def test_equity_curves_stored(self):
        comp = BacktestComparison()
        comp.add("A", make_result(equity_curve=[10000, 10500, 11000]))
        comp.add("B", make_result(equity_curve=[10000, 10200, 10400]))
        result = comp.compare()
        assert "A" in result.equity_curves
        assert "B" in result.equity_curves
        assert len(result.equity_curves["A"]) == 3

    def test_significance_tests(self):
        comp = BacktestComparison()
        comp.add("A", make_result(equity_curve=list(np.linspace(10000, 11000, 50))))
        comp.add("B", make_result(equity_curve=list(np.linspace(10000, 10500, 50))))
        result = comp.compare()
        assert len(result.significance_tests) == 1
        key = "A_vs_B"
        assert key in result.significance_tests
        test = result.significance_tests[key]
        assert "significant" in test
        assert "p_value" in test

    def test_short_equity_curve_no_significance(self):
        comp = BacktestComparison()
        comp.add("A", make_result(equity_curve=[10000, 10100]))
        comp.add("B", make_result(equity_curve=[10000, 10050]))
        result = comp.compare()
        key = "A_vs_B"
        assert result.significance_tests[key]["significant"] is False
        assert result.significance_tests[key]["p_value"] == 1.0

    def test_print_table(self):
        comp = BacktestComparison()
        comp.add("Trend", make_result(return_pct=15.0, sharpe=1.8))
        comp.add("MeanRev", make_result(return_pct=8.0, sharpe=1.2))
        table = comp.print_table()
        assert "Trend" in table
        assert "MeanRev" in table
        assert "Best Sharpe" in table
        assert "Best Return" in table

    def test_three_strategies_pairwise(self):
        comp = BacktestComparison()
        comp.add("A", make_result())
        comp.add("B", make_result())
        comp.add("C", make_result())
        result = comp.compare()
        # 3 pairs: A_vs_B, A_vs_C, B_vs_C
        assert len(result.significance_tests) == 3
