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
    FFTCycleStrategy,
    MarketMakingConfig,
    MarketMakingStrategy,
    MeanReversionStrategy,
    MLConfig,
    MLEnsembleStrategy,
    SentimentConfig,
    SentimentStrategy,
    Signal,
    SignalDirection,
    StatArbConfig,
    StatisticalArbitrage,
    TrendFollowingStrategy,
)
from src.technical_analysis import adx, ema, rsi  # noqa: E402


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
        self.strategies = []
        if config.trend_enabled:
            self.strategies.append(TrendFollowingStrategy(
                ema_fast=config.trend_ema_fast,
                ema_slow=config.trend_ema_slow,
                adx_threshold=config.trend_adx_threshold,
            ))
        if config.meanrev_enabled:
            self.strategies.append(MeanReversionStrategy(
                rsi_oversold=config.meanrev_rsi_oversold,
                rsi_overbought=config.meanrev_rsi_overbought,
                bb_period=config.meanrev_bb_period,
                bb_std=config.meanrev_bb_std,
            ))
        if config.fft_enabled:
            self.strategies.append(FFTCycleStrategy(
                min_data=config.fft_min_data,
            ))
        if config.sentiment_enabled:
            self.strategies.append(SentimentStrategy(
                config=SentimentConfig(),
            ))
        if config.market_making_enabled:
            self.strategies.append(MarketMakingStrategy(
                config=MarketMakingConfig(),
            ))
        if config.ml_ensemble_enabled:
            self.strategies.append(MLEnsembleStrategy(
                config=MLConfig(),
            ))
        self.ensemble = EnsembleVoter(
            mode=config.ensemble_mode,
            min_votes=config.ensemble_min_votes,
        )

        # Statistical arbitrage (pairs trading — separate interface)
        self.stat_arb = None
        if config.statarb_enabled and len(config.symbols) >= 2:
            self.stat_arb = StatisticalArbitrage(
                config=StatArbConfig(
                    entry_z=config.statarb_zscore_entry,
                    exit_z=config.statarb_zscore_exit,
                    recompute_interval=config.statarb_recompute_interval,
                ),
            )
            self.logger.info(f"  Statistical arbitrage: pairs={[f'{config.symbols[i]}/{config.symbols[j]}' for i in range(len(config.symbols)) for j in range(i+1, len(config.symbols))]}")

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
            except Exception as e:
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
            except Exception as e:
                self.logger.error(f"Listen error: {e}")
                if self._running:
                    await asyncio.sleep(2)
                    await self.exchange.reconnect()

    async def _generate_signals(self) -> None:
        """Generate and validate trading signals for all symbols."""
        now_ts = int(time.time())  # Cache once per tick — avoid repeated syscalls

        # ─── Statistical arbitrage (pairs) ───
        if self.stat_arb:
            symbols = self.config.symbols
            for i in range(len(symbols)):
                for j in range(i + 1, len(symbols)):
                    sym_a, sym_b = symbols[i], symbols[j]
                    candles_a = self.exchange.candle_history.get(sym_a, [])
                    candles_b = self.exchange.candle_history.get(sym_b, [])
                    if len(candles_a) < self.config.statarb_min_data or len(candles_b) < self.config.statarb_min_data:
                        continue
                    try:
                        arb_sig = self.stat_arb.analyze(sym_a, sym_b, candles_a, candles_b)
                        if arb_sig and arb_sig.is_actionable:
                            arb_dict = arb_sig.to_dict()
                            arb_dict["timestamp"] = now_ts
                            self.signal_logger.log(arb_dict)
                            self.logger.info(
                                f"StatArb Signal: {arb_sig.direction.value} {sym_a}/{sym_b} "
                                f"conf={arb_sig.confidence:.1f} ({arb_sig.reason})"
                            )
                            await self.signal_publisher.broadcast_signal({
                                "symbol": arb_sig.symbol,
                                "direction": arb_sig.direction.value,
                                "confidence": arb_sig.confidence,
                                "strategy": arb_sig.strategy,
                                "entry_price": arb_sig.entry_price,
                                "stop_loss": arb_sig.stop_loss,
                                "take_profit": arb_sig.take_profit,
                                "rr_ratio": arb_sig.rr_ratio,
                                "reason": arb_sig.reason,
                                "signal_id": 0,
                            })
                    except Exception as e:
                        self.logger.debug(f"StatArb {sym_a}/{sym_b}: {e}")

        # ─── Per-symbol strategies ───
        for symbol in self.config.symbols:
            # Get candle history from exchange client (accumulated in _process_message)
            candles = self.exchange.candle_history.get(symbol, [])
            if not candles or len(candles) < 30:
                continue

            # Run all strategies
            signals = []
            for strategy in self.strategies:
                sig = strategy.analyze(symbol, candles)
                signals.append(sig)

            # Ensemble vote
            ensemble_signal = self.ensemble.vote(signals)
            self.tracker.record_signal(ensemble_signal.is_actionable)

            if not ensemble_signal.is_actionable:
                continue

            # Log signal
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
                f"({ensemble_signal.reason})"
            )

            # Validate signal
            account = self.exchange.accounts.get(self.config.default_exchange, {})
            balance = account.get("balance", 10000.0)
            positions = account.get("positions", [])
            self.validator.update_position_count(len(positions))

            result = self.validator.validate(ensemble_signal, balance)
            if not result.passed:
                self.logger.info(f"  Rejected: {result.reason}")
                continue

            # Save to DB
            signal_id = self.db.save_signal(sig_dict, validated=True)

            # Generate LLM explanation for the signal
            try:
                closes = [c["close"] for c in candles]
                rsi_val = rsi(closes)[-1] if len(closes) >= 14 else 50.0
                adx_val = adx(candles)[-1] if len(candles) >= 14 else 25.0
                ema_fast_val = ema(closes, 9)[-1] if len(closes) >= 9 else 0.0
                ema_slow_val = ema(closes, 21)[-1] if len(closes) >= 21 else 0.0
                ema_trend = "bullish" if ema_fast_val > ema_slow_val else "bearish"

                explanation = await self.llm_engine.explain_signal(
                    symbol=symbol,
                    direction=ensemble_signal.direction.value,
                    price=ensemble_signal.entry_price,
                    rsi=rsi_val,
                    adx=adx_val,
                    ema_trend=ema_trend,
                )
            except Exception:
                explanation = ensemble_signal.reason

            # Broadcast signal — reuse sig_dict, add explanation + signal_id
            sig_dict["explanation"] = explanation
            sig_dict["signal_id"] = signal_id
            await self.signal_publisher.broadcast_signal(sig_dict)

            # Execute order
            if self.config.paper_trading:
                if self.exchange.is_trading_active:
                    await self._execute_paper_order(ensemble_signal, signal_id, balance)
                else:
                    self.logger.info("Trading stopped — skipping paper order execution")
            else:
                await self._execute_live_order(ensemble_signal, signal_id)

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


def run_backtest(config: SignalBotConfig, logger: logging.Logger) -> None:
    """Run backtest on historical data from CSV exports or database."""
    import csv as csv_mod
    import glob as glob_mod

    def load_candles_from_csv(symbol: str) -> list[dict]:
        """Load candles from CSV files in data/exports/."""
        candles = []
        # Try multiple patterns: data/exports/candles_*.csv, data/exports/*candle*.csv
        patterns = [
            f"data/exports/*candle*{symbol.replace('/', '_')}*.csv",
            f"data/exports/candles_*{symbol.replace('/', '_')}*.csv",
            f"data/exports/*{symbol.replace('/', '_')}*.csv",
        ]
        files = []
        for p in patterns:
            files = glob_mod.glob(p)
            if files:
                break
        if not files:
            # Try all candle files and filter by symbol column
            files = glob_mod.glob("data/exports/*candle*.csv")
        for f in sorted(files):
            try:
                with open(f, newline="", encoding="utf-8") as fh:
                    reader = csv_mod.DictReader(fh)
                    for row in reader:
                        # Filter by symbol if column exists
                        if "symbol" in row and row["symbol"] and symbol.replace("/", "_") not in row["symbol"] and row["symbol"] != symbol:
                            continue
                        candles.append({
                            "timestamp": int(float(row.get("timestamp", 0))),
                            "open": float(row.get("open", row.get("o", 0))),
                            "high": float(row.get("high", row.get("h", 0))),
                            "low": float(row.get("low", row.get("l", 0))),
                            "close": float(row.get("close", row.get("c", 0))),
                            "volume": float(row.get("volume", row.get("v", 0))),
                        })
            except Exception as e:
                logger.warning(f"  Failed to load {f}: {e}")
        return candles

    # Initialize strategies (same as live bot)
    strategies = []
    if config.trend_enabled:
        strategies.append(TrendFollowingStrategy(
            ema_fast=config.trend_ema_fast,
            ema_slow=config.trend_ema_slow,
            adx_threshold=config.trend_adx_threshold,
        ))
    if config.meanrev_enabled:
        strategies.append(MeanReversionStrategy(
            rsi_oversold=config.meanrev_rsi_oversold,
            rsi_overbought=config.meanrev_rsi_overbought,
            bb_period=config.meanrev_bb_period,
            bb_std=config.meanrev_bb_std,
        ))
    if config.fft_enabled:
        strategies.append(FFTCycleStrategy(min_data=config.fft_min_data))

    if not strategies:
        logger.error("No strategies enabled for backtesting")
        return

    # Initialize backtester
    bt = Backtester(
        initial_balance=10000.0,
        fee_pct=0.075,
        slippage_bps=2.0,
        leverage=10,
        max_position_pct=config.max_position_size_pct,
        risk_per_trade_pct=config.max_risk_pct,
    )

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
            except Exception as e:
                logger.error(f"  Backtest failed: {e}")

    # Save charts if any results
    if all_results:
        import os
        chart_dir = "backtest_charts"
        os.makedirs(chart_dir, exist_ok=True)
        for name, result in all_results.items():
            try:
                plotter.plot_equity_curve(result, name)
                plotter.save_all({name: result}, chart_dir)
                logger.info(f"  Charts saved to {chart_dir}/{name}")
            except Exception as e:
                logger.warning(f"  Chart generation failed for {name}: {e}")

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
    try:
        asyncio.run(bot.run(show_dashboard=args.dashboard, enable_metrics=args.metrics))
    finally:
        logger.info(f"Run complete. Log file: {log_path}")


if __name__ == "__main__":
    main()
