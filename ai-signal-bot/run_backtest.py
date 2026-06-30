#!/usr/bin/env python3
"""Backtest runner — replay historical data through all strategies.

Usage:
    python run_backtest.py                    # Generate synthetic data and backtest
    python run_backtest.py --db data/trading.db  # Use SQLite historical data
"""
import argparse
import logging
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.backtesting import Backtester, BacktestPlotter, StrategyOptimizer
from src.strategies import (
    EnsembleVoter, FFTCycleStrategy, MeanReversionStrategy,
    TrendFollowingStrategy,
)


def generate_synthetic_candles(
    n: int = 500,
    initial_price: float = 65000,
    volatility: float = 0.75,
    drift: float = 0.0001,
    seed: int = 42,
) -> list[dict]:
    """Generate synthetic OHLCV candles for backtesting."""
    rng = random.Random(seed)
    candles = []
    price = initial_price
    tf = 300  # 5 minutes
    base_ts = 1704067200  # 2024-01-01

    candles_per_year = 365 * 24 * 3600 / tf
    sigma = volatility / math.sqrt(candles_per_year)

    for i in range(n):
        z = rng.gauss(0, 1)
        ret = drift + sigma * z
        new_price = price * math.exp(ret)

        open_p = price
        close_p = new_price
        wick = abs(close_p - open_p) * (0.5 + rng.random() * 0.5)
        high_p = max(open_p, close_p) + wick * rng.random()
        low_p = min(open_p, close_p) - wick * rng.random()
        volume = rng.uniform(50, 2000) * (1 + abs(ret) * 100)

        candles.append({
            "timestamp": base_ts + i * tf,
            "open": round(open_p, 2),
            "high": round(high_p, 2),
            "low": round(low_p, 2),
            "close": round(close_p, 2),
            "volume": round(volume, 2),
        })
        price = new_price

    return candles


def main():
    parser = argparse.ArgumentParser(description="Backtest Runner")
    parser.add_argument("--db", default=None, help="SQLite database path")
    parser.add_argument("--symbol", default="BTC/USDT", help="Trading symbol")
    parser.add_argument("--candles", type=int, default=500, help="Number of synthetic candles")
    parser.add_argument("--balance", type=float, default=10000, help="Initial balance")
    parser.add_argument("--plot", action="store_true", help="Generate equity curve charts")
    parser.add_argument("--optimize", action="store_true", help="Run strategy parameter optimization")
    parser.add_argument("--output-dir", default="backtest_charts", help="Output directory for charts")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(message)s")

    # Get candle data
    if args.db and os.path.exists(args.db):
        import sqlite3
        conn = sqlite3.connect(args.db)
        rows = conn.execute(
            "SELECT timestamp, open, high, low, close, volume FROM candles "
            "WHERE symbol=? ORDER BY timestamp", (args.symbol,)
        ).fetchall()
        candles = [
            {"timestamp": r[0], "open": r[1], "high": r[2], "low": r[3], "close": r[4], "volume": r[5]}
            for r in rows
        ]
        conn.close()
        print(f"Loaded {len(candles)} candles from {args.db}")
    else:
        candles = generate_synthetic_candles(n=args.candles)
        print(f"Generated {len(candles)} synthetic candles")

    # Create strategies
    strategies = [
        TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=25),
        MeanReversionStrategy(rsi_oversold=30, rsi_overbought=70, bb_period=20, bb_std=2.0),
        FFTCycleStrategy(min_data=64),
    ]

    # Run backtests
    bt = Backtester(initial_balance=args.balance, fee_pct=0.075, slippage_bps=2.0)
    results = bt.run_multi_strategy(candles, strategies, symbol=args.symbol, warmup=50)

    # Print individual reports
    for name, result in results.items():
        bt.print_report(result)

    # Print comparison
    bt.print_comparison(results)

    # Generate charts
    if args.plot:
        print("\nGenerating charts...")
        plotter = BacktestPlotter()
        plotter.save_all(results, args.output_dir)
        print(f"Charts saved to {args.output_dir}/")

    # Run optimization
    if args.optimize:
        print("\n" + "=" * 60)
        print("  STRATEGY OPTIMIZATION")
        print("=" * 60)

        optimizer = StrategyOptimizer(bt)

        # Optimize Trend Following
        print("\nOptimizing Trend Following strategy...")
        tf_results = optimizer.grid_search(
            strategy_class=TrendFollowingStrategy,
            param_grid={
                "ema_fast": [5, 9, 12, 15],
                "ema_slow": [21, 26, 30],
                "adx_threshold": [0, 20, 25],
            },
            candles=candles,
            symbol=args.symbol,
            warmup=50,
        )
        optimizer.print_results(tf_results, top_n=5)

        # Optimize Mean Reversion
        print("\nOptimizing Mean Reversion strategy...")
        mr_results = optimizer.grid_search(
            strategy_class=MeanReversionStrategy,
            param_grid={
                "rsi_oversold": [20, 25, 30],
                "rsi_overbought": [70, 75, 80],
                "bb_period": [15, 20, 25],
                "bb_std": [1.5, 2.0, 2.5],
            },
            candles=candles,
            symbol=args.symbol,
            warmup=50,
        )
        optimizer.print_results(mr_results, top_n=5)

        # Walk-forward validation for best Trend Following params
        if tf_results:
            best_tf = optimizer.best_params(tf_results)
            print(f"\nWalk-forward validation for best TF params: {best_tf}")
            wf_results = optimizer.walk_forward(
                strategy_class=TrendFollowingStrategy,
                params=best_tf,
                candles=candles,
                symbol=args.symbol,
                train_size=200,
                test_size=50,
            )
            if wf_results:
                avg_fitness = sum(r.fitness for r in wf_results) / len(wf_results)
                avg_return = sum(r.result.total_return_pct for r in wf_results) / len(wf_results)
                print(f"  Windows: {len(wf_results)}, Avg Return: {avg_return:+.2f}%, Avg Fitness: {avg_fitness:.2f}")


if __name__ == "__main__":
    main()
