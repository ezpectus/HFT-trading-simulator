"""Unit tests for backtesting/optimizer.py.

Covers: OptimizationResult, StrategyOptimizer.
"""
import pytest

from src.strategies.signal import Signal, SignalDirection


class TestOptimizationResult:
    def test_creation(self):
        from src.backtesting.backtester import BacktestResult
        from src.backtesting.optimizer import OptimizationResult
        result = BacktestResult(
            initial_balance=10000.0, final_balance=10500.0,
            total_return_pct=5.0, total_trades=10, winning_trades=6,
            losing_trades=4, win_rate=60.0, profit_factor=1.5,
            max_drawdown_pct=3.0, sharpe_ratio=1.2, sortino_ratio=1.5,
            calmar_ratio=2.0, recovery_factor=1.67,
            equity_curve=[10000, 10500], trades=[],
        )
        opt = OptimizationResult(params={"ema_fast": 9}, result=result, fitness=10.5)
        assert opt.params == {"ema_fast": 9}
        assert opt.fitness == 10.5


class TestStrategyOptimizer:
    @pytest.fixture
    def optimizer(self):
        from src.backtesting.backtester import Backtester
        from src.backtesting.optimizer import StrategyOptimizer

        class MockBacktester:
            def run(self, candles, strategy, symbol, warmup=50):
                from src.backtesting.backtester import BacktestResult
                return BacktestResult(
                    initial_balance=10000.0, final_balance=10500.0,
                    total_return_pct=5.0, total_trades=10, winning_trades=6,
                    losing_trades=4, win_rate=60.0, profit_factor=1.5,
                    max_drawdown_pct=3.0, sharpe_ratio=1.2, sortino_ratio=1.5,
                    calmar_ratio=2.0, recovery_factor=1.67,
                    equity_curve=[10000, 10500], trades=[],
                )

        return StrategyOptimizer(MockBacktester())

    def test_init_default_fitness(self, optimizer):
        assert optimizer.fitness_fn is not None

    def test_default_fitness_no_trades(self):
        from src.backtesting.backtester import BacktestResult
        from src.backtesting.optimizer import StrategyOptimizer
        result = BacktestResult(
            initial_balance=10000.0, final_balance=10000.0,
            total_return_pct=0.0, total_trades=0, winning_trades=0,
            losing_trades=0, win_rate=0.0, profit_factor=0.0,
            max_drawdown_pct=0.0, sharpe_ratio=0.0, sortino_ratio=0.0,
            calmar_ratio=0.0, recovery_factor=0.0,
            equity_curve=[10000], trades=[],
        )
        assert StrategyOptimizer.default_fitness(result) == -999.0

    def test_default_fitness_with_trades(self):
        from src.backtesting.backtester import BacktestResult
        from src.backtesting.optimizer import StrategyOptimizer
        result = BacktestResult(
            initial_balance=10000.0, final_balance=10500.0,
            total_return_pct=5.0, total_trades=10, winning_trades=6,
            losing_trades=4, win_rate=60.0, profit_factor=1.5,
            max_drawdown_pct=3.0, sharpe_ratio=1.2, sortino_ratio=1.5,
            calmar_ratio=2.0, recovery_factor=1.67,
            equity_curve=[10000, 10500], trades=[],
        )
        fitness = StrategyOptimizer.default_fitness(result)
        assert fitness > 0

    def test_sharpe_fitness(self):
        from src.backtesting.backtester import BacktestResult
        from src.backtesting.optimizer import StrategyOptimizer
        result = BacktestResult(
            initial_balance=10000.0, final_balance=10500.0,
            total_return_pct=5.0, total_trades=10, winning_trades=6,
            losing_trades=4, win_rate=60.0, profit_factor=1.5,
            max_drawdown_pct=3.0, sharpe_ratio=1.2, sortino_ratio=1.5,
            calmar_ratio=2.0, recovery_factor=1.67,
            equity_curve=[10000, 10500], trades=[],
        )
        assert StrategyOptimizer.sharpe_fitness(result) == 1.2

    def test_sharpe_fitness_insufficient_trades(self):
        from src.backtesting.backtester import BacktestResult
        from src.backtesting.optimizer import StrategyOptimizer
        result = BacktestResult(
            initial_balance=10000.0, final_balance=10000.0,
            total_return_pct=0.0, total_trades=2, winning_trades=1,
            losing_trades=1, win_rate=50.0, profit_factor=1.0,
            max_drawdown_pct=0.0, sharpe_ratio=0.0, sortino_ratio=0.0,
            calmar_ratio=0.0, recovery_factor=0.0,
            equity_curve=[10000], trades=[],
        )
        assert StrategyOptimizer.sharpe_fitness(result) == -999.0

    def test_calmar_fitness(self):
        from src.backtesting.backtester import BacktestResult
        from src.backtesting.optimizer import StrategyOptimizer
        result = BacktestResult(
            initial_balance=10000.0, final_balance=10500.0,
            total_return_pct=5.0, total_trades=10, winning_trades=6,
            losing_trades=4, win_rate=60.0, profit_factor=1.5,
            max_drawdown_pct=3.0, sharpe_ratio=1.2, sortino_ratio=1.5,
            calmar_ratio=2.0, recovery_factor=1.67,
            equity_curve=[10000, 10500], trades=[],
        )
        assert StrategyOptimizer.calmar_fitness(result) == 2.0

    def test_calmar_fitness_no_drawdown(self):
        from src.backtesting.backtester import BacktestResult
        from src.backtesting.optimizer import StrategyOptimizer
        result = BacktestResult(
            initial_balance=10000.0, final_balance=10000.0,
            total_return_pct=0.0, total_trades=0, winning_trades=0,
            losing_trades=0, win_rate=0.0, profit_factor=0.0,
            max_drawdown_pct=0.0, sharpe_ratio=0.0, sortino_ratio=0.0,
            calmar_ratio=0.0, recovery_factor=0.0,
            equity_curve=[10000], trades=[],
        )
        assert StrategyOptimizer.calmar_fitness(result) == -999.0

    def test_profit_factor_fitness(self):
        from src.backtesting.backtester import BacktestResult
        from src.backtesting.optimizer import StrategyOptimizer
        result = BacktestResult(
            initial_balance=10000.0, final_balance=10500.0,
            total_return_pct=5.0, total_trades=10, winning_trades=6,
            losing_trades=4, win_rate=60.0, profit_factor=1.5,
            max_drawdown_pct=3.0, sharpe_ratio=1.2, sortino_ratio=1.5,
            calmar_ratio=2.0, recovery_factor=1.67,
            equity_curve=[10000, 10500], trades=[],
        )
        assert StrategyOptimizer.profit_factor_fitness(result) == 1.5

    def test_grid_search(self, optimizer, sample_candles):
        class FakeStrategy:
            def __init__(self, **kwargs):
                self.params = kwargs
            def analyze(self, symbol, candles):
                return Signal(
                    symbol=symbol, direction=SignalDirection.NEUTRAL,
                    confidence=0, strategy="fake", entry_price=0,
                    stop_loss=0, take_profit=0,
                )

        results = optimizer.grid_search(
            strategy_class=FakeStrategy,
            param_grid={"x": [1, 2, 3]},
            candles=sample_candles,
            symbol="BTC/USDT",
        )
        assert len(results) == 3
        assert results[0].fitness >= results[-1].fitness

    def test_grid_search_max_combinations(self, optimizer, sample_candles):
        class FakeStrategy:
            def __init__(self, **kwargs):
                pass
            def analyze(self, symbol, candles):
                return Signal(
                    symbol=symbol, direction=SignalDirection.NEUTRAL,
                    confidence=0, strategy="fake", entry_price=0,
                    stop_loss=0, take_profit=0,
                )

        results = optimizer.grid_search(
            strategy_class=FakeStrategy,
            param_grid={"x": list(range(5))},
            candles=sample_candles,
            max_combinations=3,
        )
        assert len(results) <= 3

    def test_best_params_empty(self, optimizer):
        assert optimizer.best_params([]) is None

    def test_best_params_with_results(self, optimizer, sample_candles):
        class FakeStrategy:
            def __init__(self, **kwargs):
                pass
            def analyze(self, symbol, candles):
                return Signal(
                    symbol=symbol, direction=SignalDirection.NEUTRAL,
                    confidence=0, strategy="fake", entry_price=0,
                    stop_loss=0, take_profit=0,
                )

        results = optimizer.grid_search(
            strategy_class=FakeStrategy,
            param_grid={"x": [1, 2]},
            candles=sample_candles,
        )
        best = optimizer.best_params(results)
        assert best is not None
        assert "x" in best

    def test_print_results(self, optimizer, sample_candles):
        class FakeStrategy:
            def __init__(self, **kwargs):
                pass
            def analyze(self, symbol, candles):
                return Signal(
                    symbol=symbol, direction=SignalDirection.NEUTRAL,
                    confidence=0, strategy="fake", entry_price=0,
                    stop_loss=0, take_profit=0,
                )

        results = optimizer.grid_search(
            strategy_class=FakeStrategy,
            param_grid={"x": [1, 2]},
            candles=sample_candles,
        )
        optimizer.print_results(results, top_n=2)

    def test_walk_forward(self, optimizer, sample_candles):
        class FakeStrategy:
            def __init__(self, **kwargs):
                pass
            def analyze(self, symbol, candles):
                return Signal(
                    symbol=symbol, direction=SignalDirection.NEUTRAL,
                    confidence=0, strategy="fake", entry_price=0,
                    stop_loss=0, take_profit=0,
                )

        results = optimizer.walk_forward(
            strategy_class=FakeStrategy,
            params={"x": 1},
            candles=sample_candles,
            train_size=20,
            test_size=10,
            warmup=5,
        )
        assert len(results) > 0
