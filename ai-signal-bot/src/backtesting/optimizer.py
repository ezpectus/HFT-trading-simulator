"""Strategy parameter optimizer — grid search and walk-forward optimization.

Finds optimal strategy parameters by running backtests across parameter
combinations and ranking by a configurable fitness function.

Usage:
    from src.backtesting.optimizer import StrategyOptimizer
    from src.strategies import TrendFollowingStrategy

    optimizer = StrategyOptimizer(Backtester(initial_balance=10000))
    results = optimizer.grid_search(
        strategy_class=TrendFollowingStrategy,
        param_grid={
            "ema_fast": [5, 9, 12, 15],
            "ema_slow": [21, 26, 30, 50],
            "adx_threshold": [0, 20, 25, 30],
        },
        candles=candles,
        symbol="BTC/USDT",
        warmup=50,
    )
    optimizer.print_results(results)
    best = results[0]
"""
import itertools
from collections.abc import Callable
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass

from src.backtesting.backtester import Backtester, BacktestResult
from src.observability.logging import get_logger

logger = get_logger("ai_signal_bot.optimizer")


@dataclass
class OptimizationResult:
    """Result of a single parameter combination."""
    params: dict
    result: BacktestResult
    fitness: float


class StrategyOptimizer:
    """Grid search optimizer for strategy parameters.

    Runs backtests across all combinations of parameters from a grid,
    evaluates each with a fitness function, and ranks results.
    """

    def __init__(
        self,
        backtester: Backtester,
        fitness_fn: Callable[[BacktestResult], float] | None = None,
    ):
        self.backtester = backtester
        self.fitness_fn = fitness_fn or self.default_fitness

    @staticmethod
    def default_fitness(result: BacktestResult) -> float:
        """Default fitness: risk-adjusted return.

        Combines total return, Sharpe ratio, and penalizes drawdown.
        """
        if result.total_trades == 0:
            return -999.0

        return_score = result.total_return_pct
        sharpe_score = result.sharpe_ratio * 5
        dd_penalty = -result.max_drawdown_pct * 0.5
        pf_bonus = min(5.0, result.profit_factor) * 2 if result.profit_factor > 0 else -5.0

        return return_score + sharpe_score + dd_penalty + pf_bonus

    @staticmethod
    def sharpe_fitness(result: BacktestResult) -> float:
        """Fitness focused on Sharpe ratio."""
        if result.total_trades < 3:
            return -999.0
        return result.sharpe_ratio

    @staticmethod
    def calmar_fitness(result: BacktestResult) -> float:
        """Fitness focused on Calmar ratio (return / drawdown)."""
        if result.total_trades == 0 or result.max_drawdown_pct == 0:
            return -999.0
        return result.calmar_ratio

    @staticmethod
    def profit_factor_fitness(result: BacktestResult) -> float:
        """Fitness focused on profit factor."""
        if result.total_trades < 3:
            return -999.0
        return result.profit_factor

    def grid_search(
        self,
        strategy_class,
        param_grid: dict[str, list],
        candles: list[dict],
        symbol: str = "BTC/USDT",
        warmup: int = 50,
        max_combinations: int = 1000,
        parallel: bool = False,
        n_workers: int | None = None,
    ) -> list[OptimizationResult]:
        """Run grid search over all parameter combinations.

        If parallel=True, uses ProcessPoolExecutor for multi-core speedup.
        """
        keys = list(param_grid.keys())
        value_lists = [param_grid[k] for k in keys]
        combinations = list(itertools.product(*value_lists))

        total = len(combinations)
        if total > max_combinations:
            logger.warning(
                "Grid has %s combinations, truncating to %s. "
                "Consider narrowing the search space.", total, max_combinations
            )
            combinations = combinations[:max_combinations]
            total = max_combinations

        logger.info("Starting grid search: %s combinations%s", total, ' (parallel)' if parallel else '')

        if parallel and total > 10:
            results = self._parallel_grid_search(
                strategy_class, keys, combinations, candles, symbol, warmup, n_workers,
            )
        else:
            results = self._sequential_grid_search(
                strategy_class, keys, combinations, candles, symbol, warmup,
            )

        results.sort(key=lambda x: x.fitness, reverse=True)
        logger.info("Grid search complete: %s results", len(results))
        return results

    def _sequential_grid_search(
        self, strategy_class, keys, combinations, candles, symbol, warmup,
    ) -> list[OptimizationResult]:
        """Sequential grid search (default)."""
        results = []
        for i, combo in enumerate(combinations):
            params = dict(zip(keys, combo, strict=False))
            try:
                strategy = strategy_class(**params)
                result = self.backtester.run(candles, strategy, symbol, warmup)
                fitness = self.fitness_fn(result)
                results.append(OptimizationResult(params, result, fitness))
            except (RuntimeError, ValueError, KeyError, OSError) as e:
                logger.debug("Failed for %s: %s", params, e)
            if (i + 1) % 50 == 0:
                logger.info("  Progress: %s/%s", i + 1, len(combinations))
        return results

    def _parallel_grid_search(
        self, strategy_class, keys, combinations, candles, symbol, warmup, n_workers,
    ) -> list[OptimizationResult]:
        """Parallel grid search via ProcessPoolExecutor."""
        # Note: strategy_class and backtester must be picklable for parallel mode
        results = []
        try:
            with ProcessPoolExecutor(max_workers=n_workers) as pool:
                futures = []
                for combo in combinations:
                    params = dict(zip(keys, combo, strict=False))
                    futures.append((
                        params,
                        pool.submit(
                            _run_single_backtest,
                            strategy_class, params, candles, symbol, warmup,
                            self.backtester.initial_balance,
                            self.backtester.fee_pct,
                        ),
                    ))
                for i, (params, future) in enumerate(futures):
                    try:
                        result = future.result()
                        fitness = self.fitness_fn(result)
                        results.append(OptimizationResult(params, result, fitness))
                    except (RuntimeError, ValueError, KeyError, OSError) as e:
                        logger.debug("Failed for %s: %s", params, e)
                    if (i + 1) % 50 == 0:
                        logger.info("  Progress: %s/%s", i + 1, len(combinations))
        except (OSError, RuntimeError) as e:
            logger.warning("Parallel search failed (%s), falling back to sequential", e)
            return self._sequential_grid_search(
                strategy_class, keys, combinations, candles, symbol, warmup,
            )
        return results

    def walk_forward(
        self,
        strategy_class,
        params: dict,
        candles: list[dict],
        symbol: str = "BTC/USDT",
        train_size: int = 200,
        test_size: int = 50,
        warmup: int = 50,
    ) -> list[OptimizationResult]:
        """Walk-forward optimization: train on window, test on next window."""
        results = []
        total_len = len(candles)
        start = warmup

        while start + train_size + test_size <= total_len:
            test_candles = candles[start + train_size:start + train_size + test_size]

            try:
                strategy = strategy_class(**params)
                result = self.backtester.run(test_candles, strategy, symbol, warmup=min(20, len(test_candles) // 3))
                fitness = self.fitness_fn(result)
                results.append(OptimizationResult(params, result, fitness))
            except (RuntimeError, ValueError, KeyError, OSError) as e:
                logger.debug("Walk-forward window failed: %s", e)

            start += test_size

        logger.info("Walk-forward: %s windows tested", len(results))
        return results

    def print_results(
        self,
        results: list[OptimizationResult],
        top_n: int = 10,
    ) -> None:
        """Log top N optimization results."""
        lines = ["=" * 100, f"  OPTIMIZATION RESULTS (Top {top_n})", "=" * 100]
        lines.append(
            f"  {'Rank':<5} {'Params':<40} {'Return%':>9} {'Trades':>7} "
            f"{'Win%':>7} {'PF':>7} {'MaxDD%':>8} {'Sharpe':>7} {'Fitness':>8}"
        )
        lines.append("-" * 100)

        for i, opt in enumerate(results[:top_n]):
            r = opt.result
            params_str = ", ".join(f"{k}={v}" for k, v in opt.params.items())
            if len(params_str) > 38:
                params_str = params_str[:35] + "..."
            lines.append(
                f"  {i + 1:<5} {params_str:<40} {r.total_return_pct:>+8.2f}% "
                f"{r.total_trades:>7d} {r.win_rate:>6.1f}% {r.profit_factor:>7.2f} "
                f"{r.max_drawdown_pct:>7.2f}% {r.sharpe_ratio:>7.2f} {opt.fitness:>8.2f}"
            )

        lines.append("=" * 100)
        logger.info("\n".join(lines))

    def best_params(self, results: list[OptimizationResult]) -> dict | None:
        """Get the best parameter combination."""
        if not results:
            return None
        return results[0].params


def _run_single_backtest(
    strategy_class, params: dict, candles: list[dict],
    symbol: str, warmup: int, initial_balance: float, fee_pct: float,
) -> BacktestResult:
    """Module-level function for parallel grid search (must be picklable)."""
    bt = Backtester(initial_balance=initial_balance, fee_pct=fee_pct)
    strategy = strategy_class(**params)
    return bt.run(candles, strategy, symbol, warmup)
