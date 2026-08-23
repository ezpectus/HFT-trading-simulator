"""AI Signal Bot — Main entry point.

Connects to the exchange simulator, collects market data, runs technical
analysis, generates trading signals via ensemble voting, validates them
against risk rules, and sends orders to the exchange simulator.

Architecture:
    Exchange Simulator (WebSocket) → Data Collection → Technical Analysis
    → Strategies (Trend + MeanRev) → Ensemble Voter → Signal Validation
    → Order Execution → Database + Logging

Usage:
    python run.py                           # Run with default config
    python run.py --config path/to/cfg.yaml # Custom config
    python run.py --dashboard               # Show periodic dashboard
"""
import argparse
import asyncio
import logging
import os
import signal
import sys
import time

# Add project root to path for shared modules (run_logger, trade_csv_logger)
# Note: bot root (this file's dir) is already on sys.path[0] when running `python run.py`
_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)
from run_logger import setup_run_logging  # noqa: E402

from config import SignalBotConfig  # noqa: E402
from src.backtesting import Backtester, BacktestPlotter  # noqa: E402
from src.communication import ExchangeClient, SignalPublisher  # noqa: E402
from src.database import Database  # noqa: E402
from src.llm_engine import LLMConfig, LLMEngine  # noqa: E402
from src.monitoring import PerformanceTracker, SignalLogger, TradeLogger, print_dashboard  # noqa: E402
from src.signal_validation import SignalValidator  # noqa: E402
from src.strategies import (  # noqa: E402
    EnsembleVoter,
    Signal,
    SignalDirection,
)
from src.utils.bot_helpers import (  # noqa: E402
    build_stat_arb,
    build_strategies,
    generate_llm_explanation,
    generate_stat_arb_signals,
    load_candles_from_csv,
)


def setup_logging(level: str, log_file: str) -> tuple[logging.Logger, str]:
    """Setup logging with timestamped file output."""
    fmt = os.environ.get("LOG_FORMAT", "text")
    return setup_run_logging("ai_signal_bot", level=level, format_type=fmt)


class AISignalBot:
    """Main AI Signal Bot orchestrator.

    Pipeline:
    1. Receive market data from exchange simulator
    2. Run technical indicators
    3. Run strategies (trend following + mean reversion)
    4. Ensemble vote
    5. Validate signal
    6. Execute order (paper trading via simulator)
    7. Log to DB + CSV
    """

    def __init__(self, config: SignalBotConfig):
        self.config = config
        self.logger = logging.getLogger("ai_signal_bot.core")

        # Components
        self.exchange = ExchangeClient(config.ws_url)
        self.signal_publisher = SignalPublisher(host="0.0.0.0", port=8766)  # nosec: B104
        self.db = Database(config.db_path)
        self.validator = SignalValidator(
            min_confidence=config.min_confidence,
            min_rr_ratio=config.min_rr_ratio,
            max_drawdown_pct=config.max_drawdown_pct,
            max_open_positions=config.max_open_positions,
        )
        self.tracker = PerformanceTracker()
        self.signal_logger = SignalLogger(config.signals_csv)
        self.trade_logger = TradeLogger(config.trades_csv)

        # Strategies
        self.strategies = build_strategies(config)
        self.ensemble = EnsembleVoter(
            mode=config.ensemble_mode,
            min_votes=config.ensemble_min_votes,
        )

        # Statistical arbitrage (pairs trading — separate interface)
        self.stat_arb = build_stat_arb(config, self.logger)

        # State
        self._running = False
        self._last_signal_time: float = 0

        # LLM Engine (signal explanations + market analysis)
        self.llm_engine = LLMEngine(LLMConfig())
        self.logger.info(f"  LLM Engine: provider={self.llm_engine.config.provider}")

    async def run(self, show_dashboard: bool = False, enable_metrics: bool = False) -> None:
        """Main bot loop."""
        self.logger.info("=" * 60)
        self.logger.info("  AI SIGNAL BOT v1.0.0")
        self.logger.info(f"  Symbols: {self.config.symbols}")
        self.logger.info(f"  Strategies: {[s.name for s in self.strategies]}")
        self.logger.info(f"  Ensemble: mode={self.config.ensemble_mode}, min_votes={self.config.ensemble_min_votes}")
        self.logger.info(f"  Validation: min_conf={self.config.min_confidence}%, min_rr={self.config.min_rr_ratio}")
        self.logger.info(f"  Signal interval: {self.config.signal_interval}s")
        self.logger.info(f"  Paper trading: {self.config.paper_trading}")
        self.logger.info(f"  Exchange: {self.config.ws_url}")
        self.logger.info("=" * 60)

        # Connect to exchange simulator
        connected = await self.exchange.connect()
        if not connected:
            self.logger.error("Failed to connect to exchange simulator. Retrying...")
            for _attempt in range(5):
                await asyncio.sleep(3)
                if await self.exchange.connect():
                    connected = True
                    break
            if not connected:
                self.logger.error("Could not connect. Exiting.")
                return

        self._running = True

        # Initialize LLM engine
        await self.llm_engine.initialize()

        # Start WebSocket listener in background
        listen_task = asyncio.create_task(self._listen_loop())

        # Start signal publisher for HFT bot
        await self.signal_publisher.start()
        self.logger.info("Signal publisher running on port 8766")

        # Start metrics server if enabled
        metrics_server = None
        prom_server = None
        if enable_metrics:
            from src.monitoring.health_server import HealthServer
            metrics_server = HealthServer(port=8080)
            await metrics_server.start()
            self.logger.info("Health server running on port 8080")
            try:
                from src.monitoring.metrics import MetricsExporter
                prom_server = MetricsExporter()
                await prom_server.start_server(port=9090)
                self.logger.info("Prometheus metrics server running on port 9090")
            except (OSError, RuntimeError, ConnectionError) as e:
                self.logger.warning(f"Prometheus metrics server failed to start: {e}")

        # Main signal generation loop
        try:
            while self._running:
                await asyncio.sleep(self.config.signal_interval)
                await self._generate_signals()

                if show_dashboard:
                    self._print_dashboard()

        except KeyboardInterrupt:
            self.logger.info("Stopping...")
        finally:
            self._running = False
            listen_task.cancel()
            await self.signal_publisher.stop()
            if prom_server:
                await prom_server.stop_server()
            if metrics_server:
                await metrics_server.stop()
            await self.llm_engine.close()
            await self.exchange.disconnect()
            self.logger.info("AI Signal Bot stopped")

    async def _listen_loop(self) -> None:
        """Background task to listen for exchange messages."""
        while self._running:
            try:
                await self.exchange.listen()
            except (OSError, RuntimeError, ConnectionError, asyncio.TimeoutError) as e:
                self.logger.error(f"Listen error: {e}")
                if self._running:
                    await asyncio.sleep(2)
                    await self.exchange.reconnect()

    async def _generate_signals(self) -> None:
        """Generate and validate trading signals for all symbols."""
        now_ts = int(time.time())
        await generate_stat_arb_signals(self, now_ts)
        tasks = []
        for symbol in self.config.symbols:
            candles = self.exchange.candle_history.get(symbol, [])
            if not candles or len(candles) < 30:
                continue
            tasks.append(self._process_symbol(symbol, candles, now_ts))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _process_symbol(self, symbol: str, candles: list, now_ts: int) -> None:
        """Run strategies, ensemble vote, validate and execute for a single symbol."""
        signals = [s.analyze(symbol, candles) for s in self.strategies]
        ensemble_signal = self.ensemble.vote(signals)
        self.tracker.record_signal(ensemble_signal.is_actionable)
        if not ensemble_signal.is_actionable:
            return

        sig_dict = ensemble_signal.to_dict()
        sig_dict["timestamp"] = now_ts
        self.signal_logger.log(sig_dict)
        self.logger.info(
            f"Signal: {ensemble_signal.direction.value} {symbol} "
            f"conf={ensemble_signal.confidence:.1f} "
            f"entry={ensemble_signal.entry_price:.2f} "
            f"SL={ensemble_signal.stop_loss:.2f} "
            f"TP={ensemble_signal.take_profit:.2f} "
            f"R:R={ensemble_signal.rr_ratio:.2f} "
            f"({ensemble_signal.reason})")

        balance = self._get_account_balance()
        if not self._validate_signal(ensemble_signal, balance):
            return
        await self._finalize_and_execute(symbol, ensemble_signal, sig_dict, candles, balance)

    def _get_account_balance(self) -> float:
        """Get current account balance from exchange."""
        account = self.exchange.accounts.get(self.config.default_exchange, {})
        return account.get("balance", 10000.0)

    def _validate_signal(self, signal: Signal, balance: float) -> bool:
        """Validate signal against risk rules. Returns True if passed."""
        account = self.exchange.accounts.get(self.config.default_exchange, {})
        positions = account.get("positions", [])
        self.validator.update_position_count(len(positions))
        result = self.validator.validate(signal, balance)
        if not result.passed:
            self.logger.info(f"  Rejected: {result.reason}")
            return False
        return True

    async def _finalize_and_execute(self, symbol: str, signal: Signal,
                                    sig_dict: dict, candles: list, balance: float) -> None:
        """Save signal, generate explanation, broadcast, and execute order."""
        signal_id = self.db.save_signal(sig_dict, validated=True)
        explanation = await generate_llm_explanation(self, symbol, signal, candles)
        sig_dict["explanation"] = explanation
        sig_dict["signal_id"] = signal_id
        await self.signal_publisher.broadcast_signal(sig_dict)

        if self.config.paper_trading:
            if self.exchange.is_trading_active:
                await self._execute_paper_order(signal, signal_id, balance)
            else:
                self.logger.info("Trading stopped — skipping paper order execution")
        else:
            await self._execute_live_order(signal, signal_id)

    async def _execute_paper_order(
        self, signal: Signal, signal_id: int, balance: float
    ) -> None:
        """Execute a paper trading order via the exchange simulator."""
        # Calculate position size
        risk_amount = balance * self.config.max_risk_pct / 100
        risk_per_unit = abs(signal.entry_price - signal.stop_loss)
        if risk_per_unit <= 0:
            return
        quantity = risk_amount / risk_per_unit

        # Cap at max position size
        max_notional = balance * self.config.max_position_size_pct / 100
        max_qty = max_notional / signal.entry_price if signal.entry_price > 0 else 0
        quantity = min(quantity, max_qty)

        if quantity <= 0:
            return

        side = "BUY" if signal.direction == SignalDirection.LONG else "SELL"
        await self.exchange.submit_order(
            symbol=signal.symbol,
            side=side,
            quantity=round(quantity, 4),
            exchange=self.config.default_exchange,
            stop_loss=signal.stop_loss,
            take_profit=signal.take_profit,
        )
        self.tracker.orders_sent += 1

        # Save trade to DB
        self.db.save_trade({
            "symbol": signal.symbol,
            "exchange": self.config.default_exchange,
            "side": side,
            "quantity": quantity,
            "entry_price": signal.entry_price,
            "status": "OPEN",
            "signal_id": signal_id,
        })

        self.logger.info(
            f"  Order: {side} {quantity:.4f} {signal.symbol} @ {signal.entry_price:.2f}"
        )

    async def _execute_live_order(self, signal: Signal, signal_id: int) -> None:
        """Execute a live order (would connect to real exchange in production)."""
        self.logger.warning("Live trading not implemented in simulation mode")

    def _print_dashboard(self) -> None:
        """Print performance dashboard."""
        account = self.exchange.accounts.get(self.config.default_exchange, {})
        positions = account.get("positions", [])
        prices = self.exchange.latest_prices.get(self.config.default_exchange, {})
        print_dashboard(self.tracker, positions, prices)


def _save_backtest_charts(all_results: dict, plotter, logger: logging.Logger) -> None:
    """Save equity curve charts for backtest results."""
    if not all_results:
        return
    import os
    chart_dir = "backtest_charts"
    os.makedirs(chart_dir, exist_ok=True)
    for name, result in all_results.items():
        try:
            plotter.plot_equity_curve(result, name)
            plotter.save_all({name: result}, chart_dir)
            logger.info(f"  Charts saved to {chart_dir}/{name}")
        except (OSError, ValueError, RuntimeError) as e:
            logger.warning(f"  Chart generation failed for {name}: {e}")


def run_backtest(config: SignalBotConfig, logger: logging.Logger) -> None:
    """Run backtest on historical data from CSV exports or database.

    Deprecated: prefer `python run_backtest.py` for standalone backtesting.
    This function is kept for the `--backtest` CLI flag convenience.
    """
    import warnings
    warnings.warn(
        "run.py --backtest is deprecated. Use `python run_backtest.py` instead.",
        DeprecationWarning, stacklevel=2,
    )
    strategies = build_strategies(config)
    strategies = [s for s in strategies if s.name in ("trend_following", "mean_reversion", "fft_cycle")]
    if not strategies:
        logger.error("No strategies enabled for backtesting")
        return

    bt = Backtester(
        initial_balance=10000.0, fee_pct=0.075, slippage_bps=2.0,
        leverage=10, max_position_pct=config.max_position_size_pct,
        risk_per_trade_pct=config.max_risk_pct)
    plotter = BacktestPlotter()
    all_results = {}

    for symbol in config.symbols:
        logger.info(f"Loading historical data for {symbol}...")
        candles = load_candles_from_csv(symbol)
        if len(candles) < 100:
            logger.warning(f"  Only {len(candles)} candles for {symbol} — need at least 100. "
                          f"Export data first: run exchange simulator with --export flag")
            continue
        for strategy in strategies:
            logger.info(f"  Backtesting {strategy.name} on {symbol} ({len(candles)} candles)...")
            try:
                result = bt.run(candles, strategy, symbol=symbol)
                bt.print_report(result)
                all_results[f"{strategy.name}_{symbol}"] = result
            except (ValueError, KeyError, TypeError, RuntimeError, ZeroDivisionError) as e:
                logger.error(f"  Backtest failed: {e}")

    _save_backtest_charts(all_results, plotter, logger)
    logger.info(f"Backtest complete: {len(all_results)} strategy/symbol combinations tested")


def main():
    parser = argparse.ArgumentParser(description="AI Signal Bot")
    parser.add_argument("--config", default=None, help="Path to settings.yaml")
    parser.add_argument("--dashboard", action="store_true", help="Show periodic dashboard")
    parser.add_argument("--metrics", action="store_true", help="Enable Prometheus metrics endpoint")
    parser.add_argument("--backtest", action="store_true", help="Run backtest on historical data from DB instead of live trading")
    args = parser.parse_args()

    config = SignalBotConfig.load(args.config)
    logger, log_path = setup_logging(config.log_level, config.log_file)

    if args.backtest:
        logger.info("Running in backtest mode")
        run_backtest(config, logger)
        logger.info(f"Backtest complete. Log file: {log_path}")
        return

    bot = AISignalBot(config)

    def _signal_handler(signum, frame):
        logger.info(f"Received signal {signum}, initiating graceful shutdown...")
        bot._running = False

    signal.signal(signal.SIGTERM, _signal_handler)
    signal.signal(signal.SIGINT, _signal_handler)

    try:
        asyncio.run(bot.run(show_dashboard=args.dashboard, enable_metrics=args.metrics))
    finally:
        logger.info(f"Run complete. Log file: {log_path}")


if __name__ == "__main__":
    main()
