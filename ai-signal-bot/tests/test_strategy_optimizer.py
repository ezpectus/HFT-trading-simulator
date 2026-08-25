"""Tests for StrategyOptimizer."""
import pytest
from src.backtesting.optimizer import StrategyOptimizer, OptimizationResult


class TestStrategyOptimizer:
    @pytest.fixture
    def optimizer(self):
        from src.backtesting.backtester import Backtester
        return StrategyOptimizer(Backtester(initial_balance=10000))

    def test_creation(self, optimizer):
        assert optimizer is not None

    def test_grid_search_returns_results(self, optimizer):
        from src.strategies.strategies import TrendFollowingStrategy
        candles = []
        price = 65000
        for i in range(100):
            candles.append({
                "timestamp": 1700000000 + i * 300,
                "open": price, "high": price * 1.01, "low": price * 0.99,
                "close": price * 1.001, "volume": 100,
            })
            price *= 1.001
        results = optimizer.grid_search(
            strategy_class=TrendFollowingStrategy,
            param_grid={"ema_fast": [5, 9], "ema_slow": [21], "adx_threshold": [0]},
            candles=candles, symbol="BTC/USDT", warmup=30,
        )
        assert isinstance(results, list)
        assert len(results) > 0
        assert all(isinstance(r, OptimizationResult) for r in results)
