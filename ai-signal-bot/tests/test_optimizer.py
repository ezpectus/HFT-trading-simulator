"""Tests for strategy optimizer."""
import pytest

from src.backtesting import Backtester, StrategyOptimizer
from src.strategies import TrendFollowingStrategy, MeanReversionStrategy


def make_trending_candles(n=200, start=100, slope=0.3):
    import math
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


class TestStrategyOptimizer:
    def test_grid_search_basic(self):
        candles = make_trending_candles(n=200, slope=0.5)
        bt = Backtester(initial_balance=10000)
        opt = StrategyOptimizer(bt)
        results = opt.grid_search(
            strategy_class=TrendFollowingStrategy,
            param_grid={
                "ema_fast": [5, 9],
                "ema_slow": [21, 30],
                "adx_threshold": [0],
            },
            candles=candles,
            warmup=50,
        )
        assert len(results) > 0
        assert all(hasattr(r, "fitness") for r in results)
        # Results should be sorted by fitness descending
        for i in range(len(results) - 1):
            assert results[i].fitness >= results[i + 1].fitness

    def test_grid_search_empty(self):
        candles = make_trending_candles(n=10, slope=0.5)
        bt = Backtester(initial_balance=10000)
        opt = StrategyOptimizer(bt)
        results = opt.grid_search(
            strategy_class=TrendFollowingStrategy,
            param_grid={"ema_fast": [5], "ema_slow": [21], "adx_threshold": [0]},
            candles=candles,
            warmup=50,
        )
        # Should have results even if no trades
        assert len(results) == 1

    def test_best_params(self):
        candles = make_trending_candles(n=200, slope=0.5)
        bt = Backtester(initial_balance=10000)
        opt = StrategyOptimizer(bt)
        results = opt.grid_search(
            strategy_class=TrendFollowingStrategy,
            param_grid={"ema_fast": [5, 9], "ema_slow": [21], "adx_threshold": [0]},
            candles=candles,
            warmup=50,
        )
        best = opt.best_params(results)
        assert best is not None
        assert "ema_fast" in best

    def test_best_params_empty(self):
        bt = Backtester(initial_balance=10000)
        opt = StrategyOptimizer(bt)
        assert opt.best_params([]) is None

    def test_default_fitness(self):
        from src.backtesting.backtester import BacktestResult
        result = BacktestResult(
            total_return_pct=10.0,
            sharpe_ratio=1.5,
            max_drawdown_pct=5.0,
            profit_factor=2.0,
            total_trades=10,
        )
        fitness = StrategyOptimizer.default_fitness(result)
        assert fitness > 0

    def test_default_fitness_no_trades(self):
        from src.backtesting.backtester import BacktestResult
        result = BacktestResult(total_trades=0)
        fitness = StrategyOptimizer.default_fitness(result)
        assert fitness == -999.0

    def test_walk_forward(self):
        candles = make_trending_candles(n=400, slope=0.3)
        bt = Backtester(initial_balance=10000)
        opt = StrategyOptimizer(bt)
        results = opt.walk_forward(
            strategy_class=TrendFollowingStrategy,
            params={"ema_fast": 9, "ema_slow": 21, "adx_threshold": 0},
            candles=candles,
            train_size=150,
            test_size=50,
            warmup=50,
        )
        assert len(results) > 0

    def test_sharpe_fitness(self):
        from src.backtesting.backtester import BacktestResult
        result = BacktestResult(sharpe_ratio=2.0, total_trades=10)
        fitness = StrategyOptimizer.sharpe_fitness(result)
        assert fitness == 2.0

    def test_calmar_fitness(self):
        from src.backtesting.backtester import BacktestResult
        result = BacktestResult(calmar_ratio=1.5, total_trades=10, max_drawdown_pct=5.0)
        fitness = StrategyOptimizer.calmar_fitness(result)
        assert fitness == 1.5
