"""Exchange Simulator — Main entry point.

Runs the simulated exchange with WebSocket server and optional terminal visualizer.

Usage:
    python -m exchange_simulator                    # Visualizer + WebSocket
    python -m exchange_simulator --no-visualizer    # WebSocket only
    python -m exchange_simulator --headless         # No visualizer, no WebSocket (test mode)
"""
import argparse
import asyncio
import csv
import logging
import os
import sys
import threading
import time
from datetime import datetime

import yaml

# Add project root for run_logger
_proj_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _proj_root not in sys.path:
    sys.path.insert(0, _proj_root)
from run_logger import setup_run_logging

from exchange_simulator.exchange import SimulatedExchange
from exchange_simulator.market_simulator import MarketSimulator
from exchange_simulator.models import Side, OrderType
from exchange_simulator.arbitrage import ArbitrageDetector
from exchange_simulator.config_validator import validate_or_exit
from exchange_simulator.data_export import DataExporter
from exchange_simulator.visualizer import TabbedVisualizer
from exchange_simulator.websocket_server import ExchangeWebSocketServer


def load_config(path: str = None) -> dict:
    """Load configuration from YAML file."""
    if path is None:
        path = os.path.join(os.path.dirname(__file__), "config.yaml")
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def setup_logging(level: str = "INFO") -> tuple[logging.Logger, str]:
    """Setup logging with timestamped file output."""
    fmt = os.environ.get("LOG_FORMAT", "text")
    return setup_run_logging("exchange_simulator", level=level, format_type=fmt)


def build_exchanges(config: dict) -> tuple[dict[str, SimulatedExchange], MarketSimulator]:
    """Build all simulated exchanges from config."""
    symbols = list(config["initial_prices"].keys())
    exchange_ids = list(config["exchanges"].keys())

    market = MarketSimulator(
        symbols=symbols,
        exchanges=exchange_ids,
        initial_prices=config["initial_prices"],
        volatility=config["volatility"],
        timeframe_seconds=config["market"]["timeframe_seconds"],
        drift=config["market"]["drift"],
        seed=config["market"].get("seed"),
        warmup_candles=config["market"]["warmup_candles"],
        order_book_depth=config["market"]["order_book_depth"],
    )

    exchanges = {}
    for ex_id, ex_cfg in config["exchanges"].items():
        exchanges[ex_id] = SimulatedExchange(
            exchange_id=ex_id,
            name=ex_cfg["name"],
            fee_pct=ex_cfg["fee_pct"],
            slippage_bps=ex_cfg["slippage_bps"],
            market=market,
            initial_balance=config["account"]["initial_balance"],
            leverage=config["account"]["leverage"],
        )

    return exchanges, market


def run_visualizer_thread(
    exchanges: dict[str, SimulatedExchange],
    config: dict,
    logger: logging.Logger,
) -> threading.Thread:
    """Run the terminal visualizer in a separate thread."""
    viz_cfg = config.get("visualizer", {})

    def _viz_loop():
        try:
            viz = TabbedVisualizer(
                exchanges=exchanges,
                refresh_interval=viz_cfg.get("refresh_interval", 0.5),
                chart_width=viz_cfg.get("chart_width", 60),
                chart_height=viz_cfg.get("chart_height", 15),
            )
            viz.start()
        except Exception as e:
            logger.error(f"Visualizer error: {e}")

    thread = threading.Thread(target=_viz_loop, daemon=True)
    thread.start()
    return thread


async def run_websocket_server(
    exchanges: dict[str, SimulatedExchange],
    market: MarketSimulator,
    config: dict,
    logger: logging.Logger,
) -> None:
    """Run the WebSocket server."""
    ws_cfg = config.get("websocket", {})
    arb_cfg = config.get("arbitrage", {})

    arb_detector = ArbitrageDetector(
        exchanges=exchanges,
        fee_pct=arb_cfg.get("fee_pct", 0.075),
        slippage_bps=arb_cfg.get("slippage_bps", 2.0),
        min_spread_bps=arb_cfg.get("min_spread_bps", 5.0),
        opportunity_ttl=arb_cfg.get("opportunity_ttl", 30.0),
    )

    server = ExchangeWebSocketServer(
        exchanges=exchanges,
        market=market,
        host=ws_cfg.get("host", "localhost"),
        port=ws_cfg.get("port", 8765),
        arb_detector=arb_detector,
    )
    await server.start()


def run_headless(
    exchanges: dict[str, SimulatedExchange],
    market: MarketSimulator,
    config: dict,
    logger: logging.Logger,
) -> None:
    """Run without visualizer or WebSocket — just generate market data."""
    logger.info("Running in headless mode (no visualizer, no WebSocket)")
    logger.info(f"Symbols: {list(config['initial_prices'].keys())}")
    logger.info(f"Exchanges: {list(config['exchanges'].keys())}")

    tick = 0
    try:
        while True:
            candles = market.next_candle()
            for ex_id, exchange in exchanges.items():
                exchange.check_stop_loss_take_profit()
                exchange.update_positions_pnl()

            if tick % 10 == 0:
                for c in candles[:3]:
                    logger.info(
                        f"  {c.exchange:>6}  {c.symbol:<10} "
                        f"O:{c.open:>10.2f}  H:{c.high:>10.2f}  "
                        f"L:{c.low:>10.2f}  C:{c.close:>10.2f}  V:{c.volume:>8.1f}"
                    )
            tick += 1
            time.sleep(0.5)
    except KeyboardInterrupt:
        logger.info("Stopped.")


def main():
    parser = argparse.ArgumentParser(description="Crypto Exchange Simulator")
    parser.add_argument("--config", default=None, help="Path to config.yaml")
    parser.add_argument("--no-visualizer", action="store_true", help="Disable terminal visualizer")
    parser.add_argument("--headless", action="store_true", help="No visualizer, no WebSocket")
    parser.add_argument("--export", action="store_true", help="Export data and exit")
    parser.add_argument("--export-dir", default="data/exports", help="Export output directory")
    parser.add_argument("--export-format", default="csv", choices=["csv", "parquet"], help="Export format")
    parser.add_argument("--log-level", default="INFO", help="Logging level")
    args = parser.parse_args()

    config = load_config(args.config)
    config = validate_or_exit(config)
    logger, log_path = setup_logging(args.log_level)

    exchanges, market = build_exchanges(config)

    logger.info("=" * 60)
    logger.info("  HFT TRADING SIMULATOR v2.2.0")
    logger.info("  3 Exchanges | 3 Symbols | Paper Trading")
    logger.info("=" * 60)
    logger.info(f"  Log file: {log_path}")

    if args.export:
        # Run a short simulation to generate data, then export
        logger.info("Generating data for export...")
        warmup = config["market"]["warmup_candles"]
        for _ in range(warmup + 100):
            market.next_candle()
            for ex in exchanges.values():
                ex.check_stop_loss_take_profit()
                ex.update_positions_pnl()

        exporter = DataExporter(
            exchanges, market,
            output_dir=args.export_dir,
            format=args.export_format,
        )
        files = exporter.export_all()
        exporter.export_summary()
        logger.info(f"Export complete: {len(files)} files in {args.export_dir}/")
        return

    if args.headless:
        run_headless(exchanges, market, config, logger)
        return

    if not args.no_visualizer:
        viz_thread = run_visualizer_thread(exchanges, config, logger)
        logger.info("Terminal visualizer started")

    # Run WebSocket server in main async loop
    try:
        asyncio.run(run_websocket_server(exchanges, market, config, logger))
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        logger.info(f"Run complete. Log file: {log_path}")


if __name__ == "__main__":
    main()
