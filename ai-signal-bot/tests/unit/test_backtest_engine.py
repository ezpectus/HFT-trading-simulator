"""Tests for BacktestEngine — run, enter/exit, metrics, edge cases."""
import numpy as np
import pytest

from src.backtesting.backtest_engine import (
    BacktestConfig,
    BacktestEngine,
    BacktestResult,
    BacktestTrade,
)


def make_candles(n=100, start_price=65000, trend=0.001):
    candles = []
    price = start_price
    for i in range(n):
        high = price * (1 + abs(np.random.randn()) * 0.002)
        low = price * (1 - abs(np.random.randn()) * 0.002)
        close = price * (1 + trend + np.random.randn() * 0.003)
        candles.append({
            "timestamp": i * 60,
            "open": price,
            "high": high,
            "low": low,
            "close": close,
            "volume": 1000,
        })
        price = close
    return candles


def always_long(symbol, candles):
    return {
        "direction": "LONG",
        "confidence": 70,
        "entry_price": candles[-1]["close"],
        "stop_loss": candles[-1]["close"] * 0.98,
        "take_profit": candles[-1]["close"] * 1.04,
    }


def always_neutral(symbol, candles):
    return {"direction": "NEUTRAL", "confidence": 0}


class TestBacktestConfig:
    def test_defaults(self):
        cfg = BacktestConfig()
        assert cfg.initial_capital == 100000.0
        assert cfg.fee_rate == 0.0004
        assert cfg.slippage_bps == 1.0
        assert cfg.leverage == 1
        assert cfg.position_size_pct == 0.1


class TestBacktestEngineRun:
    def test_basic_run(self):
        np.random.seed(42)
        engine = BacktestEngine(BacktestConfig(initial_capital=100000))
        candles = make_candles(100, trend=0.002)
        result = engine.run(candles, always_long, "BTCUSDT")
        assert isinstance(result, BacktestResult)
        assert result.total_trades > 0
        assert len(result.equity_curve) > 0

    def test_neutral_strategy_no_trades(self):
        np.random.seed(42)
        engine = BacktestEngine()
        candles = make_candles(100)
        result = engine.run(candles, always_neutral, "BTCUSDT")
        assert result.total_trades == 0
        assert result.final_equity == pytest.approx(100000, rel=1e-3)

    def test_closes_position_at_end(self):
        np.random.seed(42)
        engine = BacktestEngine()
        candles = make_candles(100, trend=0.005)
        result = engine.run(candles, always_long, "BTCUSDT")
        # Should have at least one trade (the final close)
        assert result.total_trades >= 1

    def test_equity_curve_length(self):
        np.random.seed(42)
        engine = BacktestEngine()
        candles = make_candles(100)
        result = engine.run(candles, always_long, "BTCUSDT")
        # lookback=50, so equity_curve has 50 entries
        assert len(result.equity_curve) == 50


class TestBacktestMetrics:
    def test_win_rate(self):
        np.random.seed(42)
        engine = BacktestEngine()
        candles = make_candles(200, trend=0.003)
        result = engine.run(candles, always_long, "BTCUSDT")
        assert 0 <= result.win_rate <= 100
        assert result.winning_trades + result.losing_trades == result.total_trades

    def test_profit_factor(self):
        np.random.seed(42)
        engine = BacktestEngine()
        candles = make_candles(200, trend=0.003)
        result = engine.run(candles, always_long, "BTCUSDT")
        assert result.profit_factor >= 0

    def test_max_drawdown_non_negative(self):
        np.random.seed(42)
        engine = BacktestEngine()
        candles = make_candles(200, trend=0.001)
        result = engine.run(candles, always_long, "BTCUSDT")
        assert result.max_drawdown_pct >= 0

    def test_sharpe_ratio(self):
        np.random.seed(42)
        engine = BacktestEngine()
        candles = make_candles(200, trend=0.003)
        result = engine.run(candles, always_long, "BTCUSDT")
        assert isinstance(result.sharpe_ratio, float)

    def test_total_return(self):
        np.random.seed(42)
        engine = BacktestEngine(BacktestConfig(initial_capital=100000))
        candles = make_candles(200, trend=0.005)
        result = engine.run(candles, always_long, "BTCUSDT")
        assert result.total_return == result.final_equity - 100000

    def test_to_dict(self):
        np.random.seed(42)
        engine = BacktestEngine()
        candles = make_candles(100)
        result = engine.run(candles, always_long, "BTCUSDT")
        d = result.to_dict()
        assert "total_return" in d
        assert "sharpe_ratio" in d
        assert "win_rate" in d
        assert "final_equity" in d


class TestBacktestTrade:
    def test_dataclass(self):
        trade = BacktestTrade(
            timestamp=1000, symbol="BTC", side="LONG", qty=0.5,
            entry_price=65000, exit_price=66000, pnl=500,
            fee=13, funding=1.5, hold_time_s=3600, reason="Take profit",
        )
        assert trade.pnl == 500
        assert trade.reason == "Take profit"
        assert trade.hold_time_s == 3600


class TestBacktestExitLogic:
    def test_stop_loss_triggers(self):
        np.random.seed(42)
        engine = BacktestEngine(BacktestConfig(initial_capital=100000))

        # Strategy with very tight stop loss
        def tight_sl(symbol, candles):
            price = candles[-1]["close"]
            return {
                "direction": "LONG",
                "confidence": 70,
                "entry_price": price,
                "stop_loss": price * 0.999,  # Very tight
                "take_profit": price * 1.10,
            }

        candles = make_candles(100, trend=0.0)
        result = engine.run(candles, tight_sl, "BTCUSDT")
        # With tight stops, most trades should be stop losses
        assert result.total_trades > 0

    def test_fees_deducted(self):
        np.random.seed(42)
        engine = BacktestEngine(BacktestConfig(
            initial_capital=100000, fee_rate=0.001,  # High fee
        ))
        candles = make_candles(100, trend=0.003)
        result = engine.run(candles, always_long, "BTCUSDT")
        # With high fees, total return should be lower than without
        engine_no_fee = BacktestEngine(BacktestConfig(
            initial_capital=100000, fee_rate=0.0,
        ))
        np.random.seed(42)
        result_no_fee = engine_no_fee.run(candles, always_long, "BTCUSDT")
        assert result.final_equity < result_no_fee.final_equity
