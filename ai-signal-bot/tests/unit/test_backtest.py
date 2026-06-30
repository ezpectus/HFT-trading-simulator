"""Unit tests for backtesting engine."""

import pytest
from src.backtesting.backtest_engine import BacktestEngine, BacktestConfig, BacktestResult
from src.backtesting.backtest_comparison import BacktestComparison
from src.backtesting.walk_forward import WalkForwardAnalyzer
import random


def make_candles(n=200, start_price=50000.0, seed=42):
    candles = []
    price = start_price
    rng = random.Random(seed)
    for i in range(n):
        ret = rng.gauss(0.0001, 0.003)
        o = price
        c = price * (1 + ret)
        h = max(o, c) * (1 + abs(rng.gauss(0, 0.001)))
        l = min(o, c) * (1 - abs(rng.gauss(0, 0.001)))
        candles.append({"timestamp": i * 60, "open": o, "high": h, "low": l, "close": c, "volume": 100.0})
        price = c
    return candles


def dummy_strategy(symbol, candles):
    """Simple strategy: buy if last close > previous close."""
    if len(candles) < 2:
        return {"direction": "NEUTRAL", "confidence": 0, "entry_price": 0, "stop_loss": 0, "take_profit": 0}
    if candles[-1]["close"] > candles[-2]["close"]:
        return {"direction": "LONG", "confidence": 60, "entry_price": candles[-1]["close"],
                "stop_loss": candles[-1]["close"] * 0.99, "take_profit": candles[-1]["close"] * 1.02}
    return {"direction": "NEUTRAL", "confidence": 0, "entry_price": 0, "stop_loss": 0, "take_profit": 0}


class TestBacktestEngine:
    def test_run_basic(self):
        engine = BacktestEngine(BacktestConfig(initial_capital=100000))
        candles = make_candles(100)
        result = engine.run(candles, dummy_strategy, "BTCUSDT")
        assert result.final_equity > 0
        assert len(result.equity_curve) > 0
        assert result.total_trades >= 0

    def test_empty_candles(self):
        engine = BacktestEngine()
        result = engine.run([], dummy_strategy, "BTC")
        assert result.final_equity == 100000.0

    def test_results_have_metrics(self):
        engine = BacktestEngine()
        result = engine.run(make_candles(200), dummy_strategy, "BTC")
        assert hasattr(result, "sharpe_ratio")
        assert hasattr(result, "max_drawdown_pct")
        assert hasattr(result, "win_rate")
        assert hasattr(result, "profit_factor")


class TestBacktestComparison:
    def test_compare_two(self):
        engine = BacktestEngine()
        candles = make_candles(200)
        r1 = engine.run(candles, dummy_strategy, "BTC")
        r2 = engine.run(candles, dummy_strategy, "ETH")

        comp = BacktestComparison()
        comp.add("strategy_a", r1)
        comp.add("strategy_b", r2)
        result = comp.compare()

        assert len(result.rows) == 2
        assert result.best_by_sharpe in ("strategy_a", "strategy_b")

    def test_to_csv(self):
        engine = BacktestEngine()
        r1 = engine.run(make_candles(100), dummy_strategy, "BTC")
        comp = BacktestComparison()
        comp.add("test", r1)
        comp.compare()
        csv = comp.to_csv()
        assert "Name" in csv
        assert "test" in csv

    def test_to_json(self):
        engine = BacktestEngine()
        r1 = engine.run(make_candles(100), dummy_strategy, "BTC")
        comp = BacktestComparison()
        comp.add("test", r1)
        result = comp.compare()
        j = result.to_json()
        assert "rows" in j
