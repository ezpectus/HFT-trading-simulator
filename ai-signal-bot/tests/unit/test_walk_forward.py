"""Tests for WalkForwardAnalyzer — window splitting, overfitting detection, run() with mocks.

Tests cover: detect_overfitting with various IS/OOS scenarios, run() with mock
strategy factory and param grid, edge cases (empty data, insufficient data),
window splitting logic, and overfitting score computation.
"""
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from src.backtesting.backtest_engine import BacktestConfig, BacktestResult
from src.backtesting.walk_forward import (
    WalkForwardAnalyzer,
    WalkForwardResult,
    WalkForwardWindow,
)


class TestWalkForwardWindow:
    """Tests for WalkForwardWindow dataclass."""

    def test_default_values(self):
        w = WalkForwardWindow(0, 100, 100, 150)
        assert w.in_sample_start == 0
        assert w.in_sample_end == 100
        assert w.out_of_sample_start == 100
        assert w.out_of_sample_end == 150
        assert w.in_sample_result is None
        assert w.out_of_sample_result is None
        assert w.best_params == {}


class TestWalkForwardResult:
    """Tests for WalkForwardResult dataclass."""

    def test_default_values(self):
        r = WalkForwardResult()
        assert r.windows == []
        assert r.avg_in_sample_sharpe == 0.0
        assert r.avg_out_of_sample_sharpe == 0.0
        assert r.overfitting_score == 0.0
        assert r.is_overfit is False
        assert r.total_return == 0.0
        assert r.total_sharpe == 0.0


class TestDetectOverfitting:
    """Tests for detect_overfitting method."""

    def test_empty_lists_returns_not_overfit(self):
        analyzer = WalkForwardAnalyzer()
        result = analyzer.detect_overfitting([], [])
        assert result["overfit"] is False
        assert result["score"] == 0.0

    def test_equal_performance_not_overfit(self):
        analyzer = WalkForwardAnalyzer()
        result = analyzer.detect_overfitting([2.0, 2.0, 2.0], [2.0, 2.0, 2.0])
        assert result["overfit"] is False
        assert result["score"] == pytest.approx(0.0)

    def test_is_much_better_than_oos_is_overfit(self):
        analyzer = WalkForwardAnalyzer()
        # IS sharpe 3.0, OOS sharpe 1.0 → gap = 2.0 > 0.5
        result = analyzer.detect_overfitting([3.0, 3.0, 3.0], [1.0, 1.0, 1.0])
        assert result["overfit"] is True
        assert result["score"] == pytest.approx(2.0)

    def test_ratio_above_2_is_overfit(self):
        analyzer = WalkForwardAnalyzer()
        # IS=1.0, OOS=0.4 → gap=0.6>0.5, ratio=2.5>2.0
        result = analyzer.detect_overfitting([1.0], [0.4])
        assert result["overfit"] is True

    def test_ratio_exactly_2_not_overfit_by_ratio(self):
        analyzer = WalkForwardAnalyzer()
        # IS=1.0, OOS=0.5 → gap=0.5 (not > 0.5), ratio=2.0 (not > 2.0)
        result = analyzer.detect_overfitting([1.0], [0.5])
        assert result["overfit"] is False

    def test_oos_better_than_is_not_overfit(self):
        analyzer = WalkForwardAnalyzer()
        result = analyzer.detect_overfitting([1.0, 1.0], [2.0, 2.0])
        assert result["overfit"] is False
        assert result["score"] < 0  # negative gap

    def test_returns_is_mean_and_oos_mean(self):
        analyzer = WalkForwardAnalyzer()
        result = analyzer.detect_overfitting([1.5, 2.5], [0.5, 1.5])
        assert result["is_mean"] == pytest.approx(2.0)
        assert result["oos_mean"] == pytest.approx(1.0)

    def test_returns_ratio(self):
        analyzer = WalkForwardAnalyzer()
        result = analyzer.detect_overfitting([2.0], [1.0])
        assert result["ratio"] == pytest.approx(2.0)

    def test_oos_near_zero_uses_epsilon(self):
        analyzer = WalkForwardAnalyzer()
        # OOS near zero — should use epsilon to avoid division by zero
        result = analyzer.detect_overfitting([1.0], [0.0])
        assert "ratio" in result
        assert result["overfit"] is True  # gap = 1.0 > 0.5


class TestWalkForwardRun:
    """Tests for WalkForwardAnalyzer.run() with mocks."""

    def _make_candles(self, n):
        """Generate n simple candle dicts."""
        return [
            {"timestamp": i * 60, "open": 100.0 + i, "high": 101.0 + i,
             "low": 99.0 + i, "close": 100.5 + i, "volume": 1000.0}
            for i in range(n)
        ]

    def _make_mock_result(self, sharpe, return_pct=1.0):
        """Create a mock BacktestResult."""
        r = BacktestResult()
        r.sharpe_ratio = sharpe
        r.total_return_pct = return_pct
        return r

    def test_run_with_no_data_returns_empty_result(self):
        analyzer = WalkForwardAnalyzer(num_windows=3, min_window_size=10)
        result = analyzer.run([], lambda p: lambda s, c: {}, [{}])
        assert len(result.windows) == 0
        assert result.avg_in_sample_sharpe == 0.0

    def test_run_with_insufficient_data_returns_empty(self):
        analyzer = WalkForwardAnalyzer(num_windows=5, min_window_size=200)
        candles = self._make_candles(50)
        result = analyzer.run(candles, lambda p: lambda s, c: {}, [{}])
        # window_size = max(50//5, 200) = 200, but only 50 candles → no windows fit
        assert len(result.windows) == 0

    def test_run_single_window(self):
        analyzer = WalkForwardAnalyzer(
            in_sample_ratio=0.7, num_windows=1, min_window_size=10
        )
        candles = self._make_candles(100)

        # Mock BacktestEngine.run to return predictable results
        mock_engine = MagicMock()
        mock_engine.run.return_value = self._make_mock_result(1.5, 2.0)

        with patch("src.backtesting.walk_forward.BacktestEngine", return_value=mock_engine):
            def strategy_factory(p):
                return lambda s, c: {"action": "hold"}
            result = analyzer.run(candles, strategy_factory, [{"param": 1}])

        assert len(result.windows) == 1
        assert result.windows[0].best_params == {"param": 1}
        assert result.avg_in_sample_sharpe == pytest.approx(1.5)
        assert result.avg_out_of_sample_sharpe == pytest.approx(1.5)

    def test_run_multiple_windows(self):
        analyzer = WalkForwardAnalyzer(
            in_sample_ratio=0.6, num_windows=3, min_window_size=10
        )
        candles = self._make_candles(150)

        mock_engine = MagicMock()
        mock_engine.run.return_value = self._make_mock_result(2.0, 1.5)

        with patch("src.backtesting.walk_forward.BacktestEngine", return_value=mock_engine):
            def strategy_factory(p):
                return lambda s, c: {"action": "hold"}
            result = analyzer.run(candles, strategy_factory, [{"p": 1}, {"p": 2}])

        # window_size = max(150//3, 10) = 50, in_sample = 30, oos = 20
        # Window 0: IS [0:30], OOS [30:50]
        # Window 1: IS [20:50], OOS [50:70]
        # Window 2: IS [40:70], OOS [70:90]
        # All should fit since oos_end = 90 < 150
        assert len(result.windows) == 3

    def test_run_selects_best_params_from_grid(self):
        analyzer = WalkForwardAnalyzer(
            in_sample_ratio=0.7, num_windows=1, min_window_size=10
        )
        candles = self._make_candles(100)

        # First param gives sharpe 1.0, second gives 3.0
        results = [self._make_mock_result(1.0), self._make_mock_result(3.0)]
        mock_engine = MagicMock()
        mock_engine.run.side_effect = results * 10  # repeat for multiple calls

        with patch("src.backtesting.walk_forward.BacktestEngine", return_value=mock_engine):
            def strategy_factory(p):
                return lambda s, c: {"action": "hold"}
            result = analyzer.run(candles, strategy_factory, [{"p": 1}, {"p": 2}])

        assert len(result.windows) == 1
        # Best IS sharpe is 3.0 → best_params should be {"p": 2}
        assert result.windows[0].best_params == {"p": 2}
        assert result.avg_in_sample_sharpe == pytest.approx(3.0)

    def test_run_computes_overfitting_score(self):
        analyzer = WalkForwardAnalyzer(
            in_sample_ratio=0.7, num_windows=2, min_window_size=10
        )
        candles = self._make_candles(200)

        # IS sharpe = 3.0, OOS sharpe = 1.0 → overfitting_score = 2.0
        call_count = [0]
        def mock_run(candles, fn, symbol):
            call_count[0] += 1
            # Alternate: IS calls get 3.0, OOS calls get 1.0
            # For each window: 2 IS calls (param grid) + 1 OOS call
            # Window 0: calls 1,2 (IS) → 3.0, call 3 (OOS) → 1.0
            # Window 1: calls 4,5 (IS) → 3.0, call 6 (OOS) → 1.0
            idx = (call_count[0] - 1) % 3
            if idx < 2:
                return self._make_mock_result(3.0, 1.0)
            else:
                return self._make_mock_result(1.0, 0.5)

        mock_engine = MagicMock()
        mock_engine.run.side_effect = mock_run

        with patch("src.backtesting.walk_forward.BacktestEngine", return_value=mock_engine):
            def strategy_factory(p):
                return lambda s, c: {"action": "hold"}
            result = analyzer.run(candles, strategy_factory, [{"p": 1}, {"p": 2}])

        assert result.avg_in_sample_sharpe == pytest.approx(3.0)
        assert result.avg_out_of_sample_sharpe == pytest.approx(1.0)
        assert result.overfitting_score == pytest.approx(2.0)
        assert result.is_overfit is True

    def test_run_not_overfit_when_is_oos_similar(self):
        analyzer = WalkForwardAnalyzer(
            in_sample_ratio=0.7, num_windows=1, min_window_size=10
        )
        candles = self._make_candles(100)

        mock_engine = MagicMock()
        mock_engine.run.return_value = self._make_mock_result(2.0, 1.0)

        with patch("src.backtesting.walk_forward.BacktestEngine", return_value=mock_engine):
            def strategy_factory(p):
                return lambda s, c: {"action": "hold"}
            result = analyzer.run(candles, strategy_factory, [{"p": 1}])

        assert result.overfitting_score == pytest.approx(0.0)
        assert result.is_overfit is False

    def test_run_computes_total_return(self):
        analyzer = WalkForwardAnalyzer(
            in_sample_ratio=0.7, num_windows=2, min_window_size=10
        )
        candles = self._make_candles(200)

        mock_engine = MagicMock()
        mock_engine.run.return_value = self._make_mock_result(1.5, 3.0)

        with patch("src.backtesting.walk_forward.BacktestEngine", return_value=mock_engine):
            def strategy_factory(p):
                return lambda s, c: {"action": "hold"}
            result = analyzer.run(candles, strategy_factory, [{"p": 1}])

        # 2 windows, each OOS return_pct = 3.0 → total = 6.0
        assert result.total_return == pytest.approx(6.0)

    def test_run_total_sharpe_equals_avg_oos(self):
        analyzer = WalkForwardAnalyzer(
            in_sample_ratio=0.7, num_windows=1, min_window_size=10
        )
        candles = self._make_candles(100)

        mock_engine = MagicMock()
        mock_engine.run.return_value = self._make_mock_result(2.5, 1.0)

        with patch("src.backtesting.walk_forward.BacktestEngine", return_value=mock_engine):
            def strategy_factory(p):
                return lambda s, c: {"action": "hold"}
            result = analyzer.run(candles, strategy_factory, [{"p": 1}])

        assert result.total_sharpe == pytest.approx(result.avg_out_of_sample_sharpe)

    def test_run_window_boundaries_correct(self):
        analyzer = WalkForwardAnalyzer(
            in_sample_ratio=0.7, num_windows=2, min_window_size=10
        )
        candles = self._make_candles(200)

        mock_engine = MagicMock()
        mock_engine.run.return_value = self._make_mock_result(1.0, 1.0)

        with patch("src.backtesting.walk_forward.BacktestEngine", return_value=mock_engine):
            def strategy_factory(p):
                return lambda s, c: {"action": "hold"}
            result = analyzer.run(candles, strategy_factory, [{"p": 1}])

        # window_size = max(200//2, 10) = 100, in_sample = 70, oos = 30
        # Window 0: IS [0:70], OOS [70:100]
        # Window 1: IS [30:100], OOS [100:130]
        w0 = result.windows[0]
        assert w0.in_sample_start == 0
        assert w0.in_sample_end == 70
        assert w0.out_of_sample_start == 70
        assert w0.out_of_sample_end == 100

        w1 = result.windows[1]
        assert w1.in_sample_start == 30
        assert w1.in_sample_end == 100
        assert w1.out_of_sample_start == 100
        assert w1.out_of_sample_end == 130

    def test_run_stores_results_in_windows(self):
        analyzer = WalkForwardAnalyzer(
            in_sample_ratio=0.7, num_windows=1, min_window_size=10
        )
        candles = self._make_candles(100)

        is_result = self._make_mock_result(2.0, 1.0)
        oos_result = self._make_mock_result(1.5, 0.5)

        mock_engine = MagicMock()
        mock_engine.run.side_effect = [is_result, oos_result]

        with patch("src.backtesting.walk_forward.BacktestEngine", return_value=mock_engine):
            def strategy_factory(p):
                return lambda s, c: {"action": "hold"}
            result = analyzer.run(candles, strategy_factory, [{"p": 1}])

        w = result.windows[0]
        assert w.in_sample_result is is_result
        assert w.out_of_sample_result is oos_result

    def test_run_with_custom_config(self):
        analyzer = WalkForwardAnalyzer(
            in_sample_ratio=0.7, num_windows=1, min_window_size=10
        )
        candles = self._make_candles(100)
        config = BacktestConfig(initial_capital=50000, fee_rate=0.001)

        mock_engine = MagicMock()
        mock_engine.run.return_value = self._make_mock_result(1.0, 1.0)

        with patch("src.backtesting.walk_forward.BacktestEngine", return_value=mock_engine) as mock_cls:
            def strategy_factory(p):
                return lambda s, c: {"action": "hold"}
            analyzer.run(candles, strategy_factory, [{"p": 1}], config=config)

        # Verify BacktestEngine was initialized with the custom config
        mock_cls.assert_called_with(config)
