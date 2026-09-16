"""Tests for Backtester — run, position management, metrics, multi-strategy."""
import numpy as np
import pytest

from src.backtesting.backtester import Backtester, BacktestResult, Trade
from src.strategies.signal import Signal, SignalDirection
from src.strategies.strategies import TrendFollowingStrategy


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
        # Defaults track the simulator's binance venue (alignment)
        assert bt.fee_pct == 0.04
        assert bt.slippage_bps == 2.0
        assert bt.leverage == 1
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
        assert len(result.equity_curve) == 51  # 100 candles - warmup 50 + initial point

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
        # Every recorded trade has an exit reason; if any trades occurred the
        # last must close by END (final bar force-close) or SL/TP/signal
        assert all(t.exit_reason for t in result.trades)
        assert not result.trades or result.trades[-1].exit_reason in (
            "END", "TAKE_PROFIT", "STOP_LOSS", "SIGNAL_EXIT")
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

    def test_no_lookahead_window_excludes_fill_bar(self):
        """analyze() must see only bars closed BEFORE the fill bar.

        Loop index i fills at candles[i].close — the strategy window must
        end at candles[i-1], never include candles[i] itself.
        """
        candles = make_candles(80)
        seen_last_ts = []

        class SpyStrategy:
            name = "spy"

            def analyze(self, symbol, window):
                seen_last_ts.append(window[-1]["timestamp"])
                return Signal(
                    symbol=symbol, direction=SignalDirection.NEUTRAL,
                    confidence=0, strategy="spy", entry_price=0,
                    stop_loss=0, take_profit=0)

        result = Backtester().run(candles, SpyStrategy(), warmup=50)
        # 30 loop iterations (i=50..79); call k must end its window on
        # candles[49+k] — the bar before the one that could fill.
        assert len(seen_last_ts) == result.signals_generated == 30
        assert seen_last_ts == [c["timestamp"] for c in candles[49:79]]


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
        assert result.recovery_factor >= 0  # |return|/max_drawdown is non-negative


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
