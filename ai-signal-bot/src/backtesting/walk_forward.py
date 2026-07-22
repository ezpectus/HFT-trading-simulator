"""Walk-forward analysis — in-sample/out-of-sample splitting, parameter optimization,
overfitting detection.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np

from src.backtesting.backtest_engine import BacktestConfig, BacktestEngine, BacktestResult

logger = logging.getLogger(__name__)


@dataclass
class WalkForwardWindow:
    in_sample_start: int
    in_sample_end: int
    out_of_sample_start: int
    out_of_sample_end: int
    in_sample_result: BacktestResult | None = None
    out_of_sample_result: BacktestResult | None = None
    best_params: dict = field(default_factory=dict)


@dataclass
class WalkForwardResult:
    windows: list[WalkForwardWindow] = field(default_factory=list)
    avg_in_sample_sharpe: float = 0.0
    avg_out_of_sample_sharpe: float = 0.0
    overfitting_score: float = 0.0     # IS vs OOS performance gap
    is_overfit: bool = False
    total_return: float = 0.0
    total_sharpe: float = 0.0


class WalkForwardAnalyzer:
    """Walk-forward optimization with overfitting detection."""

    def __init__(self, in_sample_ratio: float = 0.7,
                 num_windows: int = 5,
                 min_window_size: int = 200):
        self.in_sample_ratio = in_sample_ratio
        self.num_windows = num_windows
        self.min_window_size = min_window_size

    def run(
        self, candles: list[dict],
        strategy_factory: Callable[[dict], Callable[[str, list[dict]], dict]],
        param_grid: list[dict],
        symbol: str = "BTCUSDT",
        config: BacktestConfig | None = None
    ) -> WalkForwardResult:
        """Run walk-forward analysis.

        strategy_factory(params) -> analyze_fn(symbol, candles) -> signal_dict
        param_grid: list of parameter dicts to test on in-sample
        """
        result = WalkForwardResult()
        total_len = len(candles)
        window_size = max(total_len // self.num_windows, self.min_window_size)
        in_sample_size = int(window_size * self.in_sample_ratio)
        oos_size = window_size - in_sample_size

        all_is_sharpes = []
        all_oos_sharpes = []

        for w in range(self.num_windows):
            is_start = w * oos_size
            is_end = is_start + in_sample_size
            oos_start = is_end
            oos_end = oos_start + oos_size

            if oos_end > total_len:
                break

            window = WalkForwardWindow(
                in_sample_start=is_start,
                in_sample_end=is_end,
                out_of_sample_start=oos_start,
                out_of_sample_end=oos_end,
            )

            # Optimize on in-sample
            best_sharpe = -float("inf")
            best_params = {}
            best_is_result = None

            for params in param_grid:
                analyze_fn = strategy_factory(params)
                engine = BacktestEngine(config)
                is_result = engine.run(candles[is_start:is_end], analyze_fn, symbol)
                if is_result.sharpe_ratio > best_sharpe:
                    best_sharpe = is_result.sharpe_ratio
                    best_params = params
                    best_is_result = is_result

            # Test on out-of-sample with best params
            analyze_fn = strategy_factory(best_params)
            engine = BacktestEngine(config)
            oos_result = engine.run(candles[oos_start:oos_end], analyze_fn, symbol)

            window.in_sample_result = best_is_result
            window.out_of_sample_result = oos_result
            window.best_params = best_params

            result.windows.append(window)
            all_is_sharpes.append(best_sharpe)
            all_oos_sharpes.append(oos_result.sharpe_ratio)

            logger.info(
                f"[WalkForward] Window {w}: IS sharpe={best_sharpe:.2f} "
                f"OOS sharpe={oos_result.sharpe_ratio:.2f} params={best_params}"
            )

        # Compute aggregate metrics
        if all_is_sharpes and all_oos_sharpes:
            result.avg_in_sample_sharpe = float(np.mean(all_is_sharpes))
            result.avg_out_of_sample_sharpe = float(np.mean(all_oos_sharpes))
            result.overfitting_score = float(result.avg_in_sample_sharpe - result.avg_out_of_sample_sharpe)
            result.is_overfit = bool(result.overfitting_score > 0.5)  # IS much better than OOS
            result.total_sharpe = result.avg_out_of_sample_sharpe

            # Total return across all OOS windows
            result.total_return = float(sum(
                w.out_of_sample_result.total_return_pct for w in result.windows
                if w.out_of_sample_result
            ))

        return result

    def detect_overfitting(
        self, in_sample_results: list[float], out_of_sample_results: list[float]
    ) -> dict:
        """Detect overfitting from IS vs OOS performance."""
        if not in_sample_results or not out_of_sample_results:
            return {"overfit": False, "score": 0.0}

        is_mean = float(np.mean(in_sample_results))
        oos_mean = float(np.mean(out_of_sample_results))
        gap = is_mean - oos_mean
        ratio = is_mean / max(oos_mean, 1e-10)

        # Overfit if IS is much better than OOS
        overfit = bool(gap > 0.5 or ratio > 2.0)

        return {
            "overfit": overfit,
            "score": gap,
            "is_mean": is_mean,
            "oos_mean": oos_mean,
            "ratio": ratio,
        }
