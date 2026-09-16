"""Contract tests for backtesting.backtest_metrics — pure metric math."""
import pytest

from src.backtesting.backtest_metrics import (
    calculate_drawdown_metrics,
    calculate_trade_metrics,
    track_equity,
    update_drawdown,
)
from src.backtesting.results import BacktestResult, Trade


def _trade(pnl, pnl_pct, entry=0, exit=300):
    return Trade(symbol="S", side="LONG", entry_price=100.0, exit_price=100.0 + pnl,
                 quantity=1.0, entry_time=entry, exit_time=exit,
                 pnl=pnl, pnl_pct=pnl_pct, exit_reason="END")


class TestTrackEquity:
    def test_flat_position_returns_balance(self):
        assert track_equity(None, 1000.0, 50.0) == 1000.0

    def test_long_unrealized_gain(self):
        pos = {"side": "LONG", "entry_price": 100.0, "quantity": 2.0}
        assert track_equity(pos, 1000.0, 110.0) == 1020.0  # +10/pt x 2 qty

    def test_short_unrealized_gain(self):
        pos = {"side": "SHORT", "entry_price": 100.0, "quantity": 2.0}
        assert track_equity(pos, 1000.0, 90.0) == 1020.0


class TestUpdateDrawdown:
    def test_new_peak_no_drawdown(self):
        r = BacktestResult()
        peak = update_drawdown(120.0, 100.0, r)
        assert peak == 120.0
        assert r.max_drawdown_pct == 0.0

    def test_drawdown_recorded(self):
        r = BacktestResult()
        peak = update_drawdown(90.0, 100.0, r)
        assert peak == 100.0
        assert r.max_drawdown_pct == 10.0

    def test_max_keeps_worst(self):
        r = BacktestResult()
        update_drawdown(90.0, 100.0, r)
        update_drawdown(95.0, 100.0, r)  # 5% — not worse than 10%
        assert r.max_drawdown_pct == 10.0


class TestCalculateTradeMetrics:
    def _result(self, pnls):
        r = BacktestResult()
        r.trades = [_trade(p, p / 10) for p in pnls]
        return r

    def test_win_rate_and_averages(self):
        r = self._result([100, 200, -50])
        calculate_trade_metrics(r)
        assert r.total_trades == 3
        assert r.winning_trades == 2 and r.losing_trades == 1
        assert r.win_rate == pytest.approx(200 / 3)
        assert r.avg_win == 150.0 and r.avg_loss == -50.0
        assert r.profit_factor == 300 / 50

    def test_all_wins_profit_factor_inf(self):
        r = self._result([100, 50])
        calculate_trade_metrics(r)
        assert r.profit_factor == float("inf")

    def test_trade_metrics_do_not_set_sharpe(self):
        # Sharpe/Sortino moved to the per-bar equity basis — sparse
        # per-trade returns annualized by bars/year inflated the ratio.
        r = self._result([100, -100, 150, -50, 80])
        calculate_trade_metrics(r)
        assert r.sharpe_ratio == 0
        assert r.sortino_ratio == 0

    def test_empty_trades_noop(self):
        r = BacktestResult()
        calculate_trade_metrics(r)
        assert r.total_trades == 0

    def test_avg_duration(self):
        r = BacktestResult()
        r.trades = [_trade(10, 1, entry=0, exit=300), _trade(10, 1, entry=0, exit=600)]
        calculate_trade_metrics(r)
        assert r.avg_trade_duration == 450


class TestCalculateDrawdownMetrics:
    def test_single_point_noop(self):
        r = BacktestResult()
        calculate_drawdown_metrics(r, [100], 100, 100, 60)
        assert r.longest_drawdown_duration == 0

    def test_drawdown_duration_and_avg(self):
        # peak 100 → dip to 80 (2 bars) → recover to 110
        r = BacktestResult(max_drawdown_pct=20.0)
        calculate_drawdown_metrics(r, [100, 80, 90, 110], 110, 100, 60)
        assert r.longest_drawdown_duration == 2
        assert r.avg_drawdown == (20.0 + 10.0) / 2

    def test_recovery_factor(self):
        r = BacktestResult(max_drawdown_pct=20.0, total_return_pct=30.0)
        calculate_drawdown_metrics(r, [100, 80, 110], 130, 100, 60)
        # max_dd_amount = 20% of peak 110 = 22; net = 30 → 1.36
        assert abs(r.recovery_factor - 30 / 22) < 0.01
        assert r.calmar_ratio > 0

    def test_sharpe_sortino_from_equity_curve(self):
        # Rising-with-dips curve → positive mean per-bar return, nonzero
        # downside deviation → both ratios positive.
        r = BacktestResult()
        calculate_drawdown_metrics(r, [100, 101, 100, 103, 102, 106], 106, 100, 60)
        assert r.sharpe_ratio > 0
        assert r.sortino_ratio > 0

    def test_sharpe_flat_equity_is_zero(self):
        r = BacktestResult()
        calculate_drawdown_metrics(r, [100, 100, 100, 100], 100, 100, 60)
        assert r.sharpe_ratio == 0
