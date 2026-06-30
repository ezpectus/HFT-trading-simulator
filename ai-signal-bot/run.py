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
import json
import logging
import os
import sys
import time

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run_logger import setup_run_logging

from config import SignalBotConfig
from src.communication import ExchangeClient, SignalPublisher
from src.database import Database
from src.monitoring import PerformanceTracker, SignalLogger, TradeLogger, print_dashboard
from src.signal_validation import SignalValidator
from src.strategies import (
    EnsembleVoter, FFTCycleStrategy, MeanReversionStrategy,
    SignalDirection, TrendFollowingStrategy,
)
from src.technical_analysis import adx, atr, bollinger_bands, ema, macd, rsi


def setup_logging(level: str, log_file: str) -> tuple[logging.Logger, str]:
    """Setup logging with timestamped file output."""
    return setup_run_logging("ai_signal_bot", level=level)


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
        self.signal_publisher = SignalPublisher(host="0.0.0.0", port=8766)
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
        self.ensemble = EnsembleVoter(
            mode=config.ensemble_mode,
            min_votes=config.ensemble_min_votes,
        )

        # State
        self._running = False
        self._candle_cache: dict[str, list[dict]] = {}  # {symbol: [candle_dicts]}
        self._last_signal_time: float = 0

    async def run(self, show_dashboard: bool = False) -> None:
        """Main bot loop."""
        self.logger.info("=" * 60)
        self.logger.info("  AI SIGNAL BOT v1.0.0")
        self.logger.info(f"  Symbols: {self.config.symbols}")
        self.logger.info(f"  Strategies: {[s.name for s in self.strategies]}")
        self.logger.info(f"  Paper trading: {self.config.paper_trading}")
        self.logger.info("=" * 60)

        # Connect to exchange simulator
        connected = await self.exchange.connect()
        if not connected:
            self.logger.error("Failed to connect to exchange simulator. Retrying...")
            for attempt in range(5):
                await asyncio.sleep(3)
                if await self.exchange.connect():
                    connected = True
                    break
            if not connected:
                self.logger.error("Could not connect. Exiting.")
                return

        self._running = True

        # Start WebSocket listener in background
        listen_task = asyncio.create_task(self._listen_loop())

        # Start signal publisher for HFT bot
        await self.signal_publisher.start()
        self.logger.info("Signal publisher running on port 8766")

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
        for symbol in self.config.symbols:
            # Get candle history from exchange
            candle = self.exchange.latest_candles.get(symbol)
            if not candle:
                continue

            # Build candle cache from exchange data
            # In a real system, we'd fetch historical candles
            # Here we accumulate from the stream
            if symbol not in self._candle_cache:
                self._candle_cache[symbol] = []
            self._candle_cache[symbol].append(candle)
            # Keep last 200 candles
            if len(self._candle_cache[symbol]) > 200:
                self._candle_cache[symbol] = self._candle_cache[symbol][-200:]

            candles = self._candle_cache[symbol]
            if len(candles) < 30:
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
            sig_dict["timestamp"] = int(time.time())
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

            # Broadcast signal to HFT Trade Bot via signal publisher
            await self.signal_publisher.broadcast_signal({
                "symbol": ensemble_signal.symbol,
                "direction": ensemble_signal.direction.value,
                "confidence": ensemble_signal.confidence,
                "strategy": ensemble_signal.strategy,
                "entry_price": ensemble_signal.entry_price,
                "stop_loss": ensemble_signal.stop_loss,
                "take_profit": ensemble_signal.take_profit,
                "rr_ratio": ensemble_signal.rr_ratio,
                "reason": ensemble_signal.reason,
                "signal_id": signal_id,
            })

            # Execute order
            if self.config.paper_trading:
                await self._execute_paper_order(ensemble_signal, signal_id, balance)
            else:
                await self._execute_live_order(ensemble_signal, signal_id)

    async def _execute_paper_order(
        self, signal: SignalDirection, signal_id: int, balance: float
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
        max_qty = max_notional / signal.entry_price
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

    async def _execute_live_order(self, signal: SignalDirection, signal_id: int) -> None:
        """Execute a live order (would connect to real exchange in production)."""
        self.logger.warning("Live trading not implemented in simulation mode")

    def _print_dashboard(self) -> None:
        """Print performance dashboard."""
        account = self.exchange.accounts.get(self.config.default_exchange, {})
        positions = account.get("positions", [])
        prices = self.exchange.latest_prices.get(self.config.default_exchange, {})
        print_dashboard(self.tracker, positions, prices)


def main():
    parser = argparse.ArgumentParser(description="AI Signal Bot")
    parser.add_argument("--config", default=None, help="Path to settings.yaml")
    parser.add_argument("--dashboard", action="store_true", help="Show periodic dashboard")
    args = parser.parse_args()

    config = SignalBotConfig.load(args.config)
    logger, log_path = setup_logging(config.log_level, config.log_file)

    bot = AISignalBot(config)
    try:
        asyncio.run(bot.run(show_dashboard=args.dashboard))
    finally:
        logger.info(f"Run complete. Log file: {log_path}")


if __name__ == "__main__":
    main()
