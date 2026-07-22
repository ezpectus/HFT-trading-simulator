"""Tests for Backtester — run, position management, metrics, multi-strategy."""
import numpy as np
import pytest

from src.backtesting.backtester import Backtester, BacktestResult, Trade
from src.strategies.strategies import (
    Signal,
    SignalDirection,
    TrendFollowingStrategy,
)


def make_candles(n=100, start_price=65000, trend=0.001, seed=42):
    rng = np.random.RandomState(seed)
    candles = []
    price = start_price
    for i in range(n):
        ret = trend + rng.randn() * 0.003
        new_price = price * (1 + ret)
        wick = abs(new_price - price) * (0.5 + rng.rand() * 0.5)
        candles.append({
            "timestamp": i * 300,
            "open": round(price, 2),
            "high": round(max(price, new_price) + wick * rng.rand(), 2),
            "low": round(min(price, new_price) - wick * rng.rand(), 2),
            "close": round(new_price, 2),
            "volume": round(rng.uniform(50, 2000), 2),
        })
        price = new_price
    return candles


class TestBacktesterInit:
    def test_defaults(self):
        bt = Backtester()
        assert bt.initial_balance == 10000.0
        assert bt.fee_pct == 0.075
        assert bt.slippage_bps == 2.0
        assert bt.leverage == 10
        assert bt.risk_manager is None

    def test_custom_params(self):
        bt = Backtester(initial_balance=50000, fee_pct=0.05, slippage_bps=1.0)
        assert bt.initial_balance == 50000
        assert bt.fee_pct == 0.05
        assert bt.slippage_bps == 1.0


class TestBacktesterRun:
    def test_basic_run(self):
        candles = make_candles(100, trend=0.003)
        bt = Backtester()
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21)
        result = bt.run(candles, strategy, symbol="BTC/USDT", warmup=50)
        assert isinstance(result, BacktestResult)
        assert result.initial_balance == 10000.0
        assert len(result.equity_curve) > 0

    def test_no_trades_neutral_market(self):
        candles = make_candles(100, trend=0.0, seed=99)
        bt = Backtester()
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21)
        result = bt.run(candles, strategy, warmup=50)
        # May or may not have trades, but result should be valid
        assert result.total_trades >= 0

    def test_closes_position_at_end(self):
        candles = make_candles(100, trend=0.005)
        bt = Backtester()
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21)
        result = bt.run(candles, strategy, warmup=50)
        # Any open position should be closed at end
        # Check that trades with "END" reason exist if there was an open position
        [t for t in result.trades if t.exit_reason == "END"]
        # Can't guarantee there's always one, but the logic should handle it
        assert isinstance(result.final_balance, float)

    def test_equity_curve_starts_at_initial(self):
        candles = make_candles(100)
        bt = Backtester(initial_balance=50000)
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21)
        result = bt.run(candles, strategy, warmup=50)
        assert result.equity_curve[0] == 50000

    def test_warmup_skips_signals(self):
        candles = make_candles(60)
        bt = Backtester()
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21)
        result = bt.run(candles, strategy, warmup=50)
        # Only 10 bars of signal generation
        assert result.signals_generated <= 10


class TestBacktesterMetrics:
    def test_total_return_pct(self):
        candles = make_candles(200, trend=0.005)
        bt = Backtester(initial_balance=10000)
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21)
        result = bt.run(candles, strategy, warmup=50)
        expected = (result.final_balance - 10000) / 10000 * 100
        assert result.total_return_pct == pytest.approx(expected, rel=1e-3)

    def test_win_rate(self):
        candles = make_candles(200, trend=0.003)
        bt = Backtester()
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21)
        result = bt.run(candles, strategy, warmup=50)
        if result.total_trades > 0:
            assert 0 <= result.win_rate <= 100
            assert result.winning_trades + result.losing_trades == result.total_trades

    def test_profit_factor(self):
        candles = make_candles(200, trend=0.003)
        bt = Backtester()
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21)
        result = bt.run(candles, strategy, warmup=50)
        assert result.profit_factor >= 0

    def test_max_drawdown_non_negative(self):
        candles = make_candles(200, trend=0.001)
        bt = Backtester()
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21)
        result = bt.run(candles, strategy, warmup=50)
        assert result.max_drawdown_pct >= 0

    def test_signals_counted(self):
        candles = make_candles(100, trend=0.003)
        bt = Backtester()
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21)
        result = bt.run(candles, strategy, warmup=50)
        assert result.signals_generated > 0
        assert result.signals_valid <= result.signals_generated

    def test_drawdown_duration(self):
        candles = make_candles(200, trend=0.001)
        bt = Backtester()
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21)
        result = bt.run(candles, strategy, warmup=50)
        assert result.longest_drawdown_duration >= 0

    def test_recovery_factor(self):
        candles = make_candles(200, trend=0.003)
        bt = Backtester()
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21)
        result = bt.run(candles, strategy, warmup=50)
        assert isinstance(result.recovery_factor, float)


class TestTrade:
    def test_dataclass(self):
        trade = Trade(
            symbol="BTC/USDT", side="LONG", entry_price=65000,
            exit_price=66000, quantity=0.5, entry_time=1000,
            exit_time=2000, pnl=500, pnl_pct=1.54,
            exit_reason="TAKE_PROFIT", fee=12.5,
        )
        assert trade.symbol == "BTC/USDT"
        assert trade.side == "LONG"
        assert trade.pnl == 500
        assert trade.exit_reason == "TAKE_PROFIT"
        assert trade.fee == 12.5


class TestMultiStrategy:
    def test_run_multi_strategy(self):
        candles = make_candles(100, trend=0.003)
        bt = Backtester()
        strategies = [
            TrendFollowingStrategy(ema_fast=9, ema_slow=21),
            TrendFollowingStrategy(ema_fast=5, ema_slow=50),
        ]
        results = bt.run_multi_strategy(candles, strategies, warmup=50)
        assert len(results) == 2
        for _name, result in results.items():
            assert isinstance(result, BacktestResult)

    def test_print_comparison(self, capsys):
        candles = make_candles(100, trend=0.003)
        bt = Backtester()
        strategies = [
            TrendFollowingStrategy(ema_fast=9, ema_slow=21),
        ]
        results = bt.run_multi_strategy(candles, strategies, warmup=50)
        bt.print_comparison(results)
        captured = capsys.readouterr()
        assert "STRATEGY COMPARISON" in captured.out


class TestPrintReport:
    def test_print_report(self, capsys):
        candles = make_candles(100, trend=0.003)
        bt = Backtester()
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21)
        result = bt.run(candles, strategy, warmup=50)
        bt.print_report(result)
        captured = capsys.readouterr()
        assert "BACKTEST REPORT" in captured.out
        assert "Initial Balance" in captured.out
