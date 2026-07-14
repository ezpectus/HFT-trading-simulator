#!/usr/bin/env python3
"""Run backtests for all strategies.

Usage: python scripts/run_backtest.py --strategy trend --symbol BTCUSDT --period 30d
"""

import asyncio
import argparse
import sys
import os
import json

_bot_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _bot_root not in sys.path:
    sys.path.insert(0, _bot_root)

from src.utils.helpers import setup_logging
from src.backtesting.backtest_engine import BacktestEngine, BacktestConfig
from src.backtesting.backtest_comparison import BacktestComparison


def generate_mock_candles(n: int = 500, start_price: float = 50000.0) -> list[dict]:
    """Generate mock candle data for backtesting."""
    import random
    candles = []
    price = start_price
    rng = random.Random(42)
    for i in range(n):
        ret = rng.gauss(0, 0.002)
        open_p = price
        close_p = price * (1 + ret)
        high_p = max(open_p, close_p) * (1 + abs(rng.gauss(0, 0.001)))
        low_p = min(open_p, close_p) * (1 - abs(rng.gauss(0, 0.001)))
        vol = rng.uniform(50, 200)
        candles.append({
            "timestamp": i * 60,
            "open": open_p, "high": high_p, "low": low_p,
            "close": close_p, "volume": vol,
        })
        price = close_p
    return candles


def run_backtest(args):
    logger = setup_logging(level="INFO")
    logger.info(f"Running backtest: strategy={args.strategy}, symbol={args.symbol}")

    candles = generate_mock_candles(args.candles)
    config = BacktestConfig(initial_capital=args.capital, fee_rate=0.0004)
    engine = BacktestEngine(config)

    from src.strategies.strategies import TrendFollowingStrategy, MeanReversionStrategy

    strategies = {
        "trend": TrendFollowingStrategy(),
        "mean_reversion": MeanReversionStrategy(),
    }

    if args.strategy == "all":
        comparison = BacktestComparison()
        for name, strat in strategies.items():
            def make_fn(s):
                def analyze(symbol, candles_slice):
                    return s.analyze(symbol, candles_slice).to_dict()
                return analyze
            result = engine.run(candles, make_fn(strat), args.symbol)
            comparison.add(name, result)
            logger.info(f"  {name}: return={result.total_return_pct:.2f}%, sharpe={result.sharpe_ratio:.2f}")

        print(comparison.print_table())

        if args.output:
            result = comparison.compare()
            with open(args.output, "w") as f:
                f.write(result.to_json())
            logger.info(f"Results saved to {args.output}")
    else:
        strat = strategies.get(args.strategy)
        if not strat:
            logger.error(f"Unknown strategy: {args.strategy}")
            return

        def analyze(symbol, candles_slice):
            return strat.analyze(symbol, candles_slice).to_dict()

        result = engine.run(candles, analyze, args.symbol)
        print(f"\nBacktest Results ({args.strategy}):")
        print(f"  Total Return: {result.total_return_pct:.2f}%")
        print(f"  Sharpe Ratio: {result.sharpe_ratio:.4f}")
        print(f"  Max Drawdown: {result.max_drawdown_pct:.2f}%")
        print(f"  Win Rate: {result.win_rate:.1f}%")
        print(f"  Profit Factor: {result.profit_factor:.4f}")
        print(f"  Total Trades: {result.total_trades}")
        print(f"  Final Equity: ${result.final_equity:,.2f}")


def main():
    parser = argparse.ArgumentParser(description="Backtest runner")
    parser.add_argument("--strategy", default="all", help="Strategy name or 'all'")
    parser.add_argument("--symbol", default="BTCUSDT", help="Trading symbol")
    parser.add_argument("--capital", type=float, default=100000.0, help="Initial capital")
    parser.add_argument("--candles", type=int, default=500, help="Number of candles")
    parser.add_argument("--output", default=None, help="Output JSON file for results")
    args = parser.parse_args()

    run_backtest(args)


if __name__ == "__main__":
    main()
