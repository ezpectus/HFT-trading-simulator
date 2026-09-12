"""Contract tests for backtesting.backtest_report — console rendering."""
import pytest

from src.backtesting.backtest_report import print_backtest_report, print_comparison_report
from src.backtesting.results import BacktestResult, Trade


def _result(**kw):
    base = dict(initial_balance=10000.0, final_balance=11000.0,
                total_return_pct=10.0, total_trades=2, winning_trades=1,
                losing_trades=1, win_rate=50.0, avg_win=200.0, avg_loss=-100.0,
                profit_factor=2.0, max_drawdown_pct=5.0, sharpe_ratio=1.5,
                equity_curve=[10000, 10500, 11000],
                trades=[Trade(symbol="S", side="LONG", entry_price=100, exit_price=102,
                              quantity=1, entry_time=0, exit_time=1, pnl=200,
                              pnl_pct=2.0, exit_reason="TAKE_PROFIT"),
                        Trade(symbol="S", side="LONG", entry_price=100, exit_price=99,
                              quantity=1, entry_time=0, exit_time=1, pnl=-100,
                              pnl_pct=-1.0, exit_reason="STOP_LOSS")])
    base.update(kw)
    return BacktestResult(**base)


class TestPrintBacktestReport:
    def test_prints_key_metrics(self, capsys):
        print_backtest_report(_result())
        out = capsys.readouterr().out
        assert "10.0" in out or "10.00" in out   # return pct
        assert "50.0" in out or "50.00" in out   # win rate
        assert "TAKE_PROFIT" in out or "STOP_LOSS" in out or "2" in out


class TestPrintComparisonReport:
    def test_ranks_strategies(self, capsys):
        print_comparison_report({"good": _result(total_return_pct=20.0),
                                 "bad": _result(total_return_pct=-5.0)})
        out = capsys.readouterr().out
        assert "good" in out and "bad" in out
        assert out.index("good") < out.index("bad")  # ranked by return

    def test_empty_dict_no_crash(self, capsys):
        print_comparison_report({})
        capsys.readouterr()  # no exception is the contract
