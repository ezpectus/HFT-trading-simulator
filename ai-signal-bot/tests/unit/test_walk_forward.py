"""Tests for StrategyOptimizer.walk_forward — the live walk-forward path.

(Replaces the dead `walk_forward.py`/`WalkForwardAnalyzer` suite — that module
was a 201-line duplicate with zero production callers; S259.)
"""
import pytest

from src.backtesting.backtester import BacktestResult
from src.backtesting.optimizer import StrategyOptimizer
from src.strategies.signal import Signal, SignalDirection


def _result(final_balance=10500.0):
    return BacktestResult(
        initial_balance=10000.0, final_balance=final_balance,
        total_return_pct=5.0, total_trades=10, winning_trades=6,
        losing_trades=4, win_rate=60.0, profit_factor=1.5,
        max_drawdown_pct=3.0, sharpe_ratio=1.2, sortino_ratio=1.5,
        calmar_ratio=2.0, recovery_factor=1.67,
        equity_curve=[10000, 10500], trades=[],
    )


class FakeStrategy:
    def __init__(self, **kwargs):
        self.kwargs = kwargs

    def analyze(self, symbol, candles):
        return Signal(
            symbol=symbol, direction=SignalDirection.NEUTRAL,
            confidence=0, strategy="fake", entry_price=0,
            stop_loss=0, take_profit=0,
        )


class RecordingBacktester:
    """Records each run() call's candle window."""
    def __init__(self):
        self.calls = []

    def run(self, candles, strategy, symbol, warmup=50):
        self.calls.append(list(candles))
        return _result()


class FlakyBacktester:
    """Raises on every other call — exercises per-window failure isolation."""
    def __init__(self):
        self.calls = 0

    def run(self, candles, strategy, symbol, warmup=50):
        self.calls += 1
        if self.calls % 2 == 0:
            raise RuntimeError("window blew up")
        return _result()


class TestWalkForwardLive:
    def test_window_stepping(self):
        bt = RecordingBacktester()
        opt = StrategyOptimizer(bt)
        candles = [{"close": i} for i in range(120)]
        results = opt.walk_forward(
            FakeStrategy, {"x": 1}, candles,
            train_size=30, test_size=10, warmup=10,
        )
        # windows at start=10,20,...,80 → test slices [40:50],[50:60],...
        assert len(results) == len(bt.calls) > 0
        # each run sees only the test window
        for call in bt.calls:
            assert len(call) == 10

    def test_insufficient_data_returns_empty(self):
        opt = StrategyOptimizer(RecordingBacktester())
        results = opt.walk_forward(
            FakeStrategy, {}, [{"close": i} for i in range(20)],
            train_size=30, test_size=10, warmup=10,
        )
        assert results == []

    def test_window_failure_isolated(self):
        bt = FlakyBacktester()
        opt = StrategyOptimizer(bt)
        candles = [{"close": i} for i in range(120)]
        results = opt.walk_forward(
            FakeStrategy, {}, candles,
            train_size=30, test_size=10, warmup=10,
        )
        # roughly half the windows raised — the loop kept going
        assert 0 < len(results) < bt.calls

    def test_params_propagated_to_strategy(self):
        seen = {}

        class ParamSpy(FakeStrategy):
            def __init__(self, **kwargs):
                super().__init__(**kwargs)
                seen.update(kwargs)

        opt = StrategyOptimizer(RecordingBacktester())
        opt.walk_forward(
            ParamSpy, {"ema_fast": 9, "x": 42},
            [{"close": i} for i in range(120)],
            train_size=30, test_size=10, warmup=10,
        )
        assert seen == {"ema_fast": 9, "x": 42}

    def test_results_carry_fitness(self):
        opt = StrategyOptimizer(RecordingBacktester())
        results = opt.walk_forward(
            FakeStrategy, {}, [{"close": i} for i in range(120)],
            train_size=30, test_size=10, warmup=10,
        )
        assert results and all(r.fitness is not None for r in results)
