#!/usr/bin/env python3
"""Run AI signal bot with all strategies.

Usage: python scripts/run_bot.py [--strategy STRATEGY] [--paper] [--backtest]
"""

import argparse
import asyncio
import os
import sys

_bot_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _bot_root not in sys.path:
    sys.path.insert(0, _bot_root)

from src.utils.helpers import get_env, load_config, setup_logging  # noqa: E402


async def run_bot(args):
    """Main bot runner."""
    logger = setup_logging(
        level=get_env("LOG_LEVEL", "INFO"),
        format_type=get_env("LOG_FORMAT", "json"),
    )
    config = load_config(args.config)
    logger.info(f"Starting AI Signal Bot (strategy={args.strategy}, paper={args.paper})")

    # Import and run the main bot
    from src.communication.signal_publisher import SignalPublisher

    publisher = SignalPublisher(ws_port=config.get("websocket_port", 8766))
    await publisher.start()

    logger.info("Bot running. Press Ctrl+C to stop.")
    try:
        while True:
            await asyncio.sleep(1)
    except asyncio.CancelledError:
        logger.info("Shutting down...")
        await publisher.stop()


def main():
    parser = argparse.ArgumentParser(description="AI Signal Bot Runner")
    parser.add_argument("--strategy", default="all", choices=["all", "trend", "mean_reversion", "fft", "ensemble", "stat_arb", "market_making", "ml", "sentiment"])
    parser.add_argument("--paper", action="store_true", help="Paper trading mode")
    parser.add_argument("--backtest", action="store_true", help="Run in backtest mode")
    parser.add_argument("--config", default="config/settings.yaml", help="Config file path")
    args = parser.parse_args()

    try:
        asyncio.run(run_bot(args))
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
