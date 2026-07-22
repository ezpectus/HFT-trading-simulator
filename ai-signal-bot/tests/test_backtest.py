"""Tests for backtesting engine."""
import math

import pytest

from src.backtesting import Backtester, BacktestResult
from src.strategies import FFTCycleStrategy, MeanReversionStrategy, TrendFollowingStrategy


def make_trending_candles(n=200, start=100, slope=0.3):
    """Generate upward-trending candle data."""
    candles = []
    for i in range(n):
        close = start + i * slope + math.sin(i * 0.1) * 2
        candles.append({
            "timestamp": 1704067200 + i * 300,
            "open": close - slope * 0.5,
            "high": close + 1,
            "low": close - 1,
            "close": close,
            "volume": 100.0,
        })
    return candles


def make_ranging_candles(n=200, center=100, amplitude=5):
    """Generate oscillating/ranging candle data."""
    candles = []
    for i in range(n):
        close = center + amplitude * math.sin(i * 0.2)
        candles.append({
            "timestamp": 1704067200 + i * 300,
            "open": close - 0.5,
            "high": close + 1,
            "low": close - 1,
            "close": close,
            "volume": 100.0,
        })
    return candles


class TestBacktester:
    def test_trend_following_on_uptrend(self):
        candles = make_trending_candles(n=200, slope=0.5)
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=0)
        bt = Backtester(initial_balance=10000, fee_pct=0.075, slippage_bps=2.0)
        result = bt.run(candles, strategy, symbol="BTC/USDT", warmup=50)
        assert result.initial_balance == 10000
        assert len(result.equity_curve) > 0
        assert result.signals_generated > 0

    def test_mean_reversion_on_range(self):
        candles = make_ranging_candles(n=200, center=100, amplitude=10)
        strategy = MeanReversionStrategy(rsi_oversold=30, rsi_overbought=70)
        bt = Backtester(initial_balance=10000)
        result = bt.run(candles, strategy, symbol="BTC/USDT", warmup=50)
        assert result.signals_generated > 0

    def test_fft_on_trend(self):
        candles = make_trending_candles(n=200, slope=0.5)
        strategy = FFTCycleStrategy(min_data=64)
        bt = Backtester(initial_balance=10000)
        result = bt.run(candles, strategy, symbol="BTC/USDT", warmup=50)
        assert result.signals_generated > 0

    def test_multi_strategy(self):
        candles = make_trending_candles(n=200, slope=0.3)
        strategies = [
            TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=0),
            MeanReversionStrategy(rsi_oversold=30, rsi_overbought=70),
        ]
        bt = Backtester(initial_balance=10000)
        results = bt.run_multi_strategy(candles, strategies, warmup=50)
        assert len(results) == 2
        assert "trend_following" in results
        assert "mean_reversion" in results

    def test_empty_candles(self):
        strategy = TrendFollowingStrategy()
        bt = Backtester(initial_balance=10000)
        result = bt.run([], strategy, warmup=50)
        assert result.final_balance == 10000
        assert result.total_trades == 0

    def test_insufficient_candles(self):
        strategy = TrendFollowingStrategy()
        bt = Backtester(initial_balance=10000)
        result = bt.run(make_trending_candles(n=10), strategy, warmup=50)
        assert result.total_trades == 0

    def test_equity_curve_length(self):
        candles = make_trending_candles(n=100, slope=0.5)
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=0)
        bt = Backtester(initial_balance=10000)
        result = bt.run(candles, strategy, warmup=50)
        # Equity curve: initial + one per candle after warmup
        assert len(result.equity_curve) == 51  # 1 initial + 50 candles

    def test_report_prints(self, capsys):
        result = BacktestResult(
            initial_balance=10000,
            final_balance=10500,
            total_return_pct=5.0,
            total_trades=10,
            winning_trades=6,
            losing_trades=4,
            win_rate=60.0,
        )
        bt = Backtester()
        bt.print_report(result)
        captured = capsys.readouterr()
        assert "BACKTEST REPORT" in captured.out
        assert "10,000.00" in captured.out
