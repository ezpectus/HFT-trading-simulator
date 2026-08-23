"""Helper functions for AISignalBot — extracted from run.py for file-size compliance.

Contains:
- build_strategies: construct strategy list from config
- generate_stat_arb_signals: statistical arbitrage signal generation
- generate_llm_explanation: LLM signal explanation with fallback
- load_candles_from_csv: CSV loading for backtest mode
"""

from __future__ import annotations

import asyncio
import csv
import glob
import logging
from typing import TYPE_CHECKING

from src.strategies import (
    FFTCycleStrategy,
    MarketMakingConfig,
    MarketMakingStrategy,
    MeanReversionStrategy,
    MLConfig,
    MLEnsembleStrategy,
    SentimentConfig,
    SentimentStrategy,
    StatArbConfig,
    StatisticalArbitrage,
    TrendFollowingStrategy,
)
from src.technical_analysis.indicators import adx, ema, rsi

if TYPE_CHECKING:
    from config import SignalBotConfig
    from src.strategies import Signal


def build_strategies(config: SignalBotConfig) -> list:
    """Build strategy list from config flags."""
    strategies = []
    if config.trend_enabled:
        strategies.append(TrendFollowingStrategy(
            ema_fast=config.trend_ema_fast, ema_slow=config.trend_ema_slow,
            adx_threshold=config.trend_adx_threshold))
    if config.meanrev_enabled:
        strategies.append(MeanReversionStrategy(
            rsi_oversold=config.meanrev_rsi_oversold, rsi_overbought=config.meanrev_rsi_overbought,
            bb_period=config.meanrev_bb_period, bb_std=config.meanrev_bb_std))
    if config.fft_enabled:
        strategies.append(FFTCycleStrategy(min_data=config.fft_min_data))
    if config.sentiment_enabled:
        strategies.append(SentimentStrategy(config=SentimentConfig()))
    if config.market_making_enabled:
        strategies.append(MarketMakingStrategy(config=MarketMakingConfig()))
    if config.ml_ensemble_enabled:
        strategies.append(MLEnsembleStrategy(config=MLConfig()))
    return strategies


def build_stat_arb(config: SignalBotConfig, logger: logging.Logger):
    """Build StatisticalArbitrage instance if enabled."""
    if not config.statarb_enabled or len(config.symbols) < 2:
        return None
    sa = StatisticalArbitrage(config=StatArbConfig(
        entry_z=config.statarb_zscore_entry, exit_z=config.statarb_zscore_exit,
        recompute_interval=config.statarb_recompute_interval))
    pairs = [f"{config.symbols[i]}/{config.symbols[j]}"
             for i in range(len(config.symbols))
             for j in range(i + 1, len(config.symbols))]
    logger.info("  Statistical arbitrage: pairs=%s", pairs)
    return sa


async def generate_stat_arb_signals(bot, now_ts: int) -> None:
    """Generate statistical arbitrage signals for all symbol pairs."""
    if not bot.stat_arb:
        return
    symbols = bot.config.symbols
    for i in range(len(symbols)):
        for j in range(i + 1, len(symbols)):
            sym_a, sym_b = symbols[i], symbols[j]
            candles_a = bot.exchange.candle_history.get(sym_a, [])
            candles_b = bot.exchange.candle_history.get(sym_b, [])
            if len(candles_a) < bot.config.statarb_min_data or len(candles_b) < bot.config.statarb_min_data:
                continue
            try:
                arb_sig = bot.stat_arb.analyze(sym_a, sym_b, candles_a, candles_b)
                if arb_sig and arb_sig.is_actionable:
                    arb_dict = arb_sig.to_dict()
                    arb_dict["timestamp"] = now_ts
                    bot.signal_logger.log(arb_dict)
                    bot.logger.info(
                        "StatArb Signal: %s %s/%s conf=%.1f (%s)",
                        arb_sig.direction.value, sym_a, sym_b, arb_sig.confidence, arb_sig.reason)
                    await bot.signal_publisher.broadcast_signal({
                        "symbol": arb_sig.symbol, "direction": arb_sig.direction.value,
                        "confidence": arb_sig.confidence, "strategy": arb_sig.strategy,
                        "entry_price": arb_sig.entry_price, "stop_loss": arb_sig.stop_loss,
                        "take_profit": arb_sig.take_profit, "rr_ratio": arb_sig.rr_ratio,
                        "reason": arb_sig.reason, "signal_id": 0})
            except (ValueError, KeyError, TypeError, ZeroDivisionError) as e:
                bot.logger.debug("StatArb %s/%s: %s", sym_a, sym_b, e)


async def generate_llm_explanation(bot, symbol: str, signal: Signal, candles: list) -> str:
    """Generate LLM explanation for a signal, with fallback to signal reason."""
    try:
        closes = [c["close"] for c in candles]
        rsi_val = rsi(closes)[-1] if len(closes) >= 14 else 50.0
        adx_val = adx(candles)[-1] if len(candles) >= 14 else 25.0
        ema_fast_val = ema(closes, 9)[-1] if len(closes) >= 9 else 0.0
        ema_slow_val = ema(closes, 21)[-1] if len(closes) >= 21 else 0.0
        ema_trend = "bullish" if ema_fast_val > ema_slow_val else "bearish"
        return await bot.llm_engine.explain_signal(
            symbol=symbol, direction=signal.direction.value,
            price=signal.entry_price, rsi=rsi_val, adx=adx_val, ema_trend=ema_trend)
    except (ValueError, KeyError, TypeError, RuntimeError, asyncio.TimeoutError, OSError):
        return signal.reason


def load_candles_from_csv(symbol: str) -> list[dict]:
    """Load candles from CSV files in data/exports/."""
    candles = []
    patterns = [
        f"data/exports/*candle*{symbol.replace('/', '_')}*.csv",
        f"data/exports/candles_*{symbol.replace('/', '_')}*.csv",
        f"data/exports/*{symbol.replace('/', '_')}*.csv",
    ]
    files = []
    for p in patterns:
        files = glob.glob(p)
        if files:
            break
    if not files:
        files = glob.glob("data/exports/*candle*.csv")
    for f in sorted(files):
        try:
            with open(f, newline="", encoding="utf-8") as fh:
                reader = csv.DictReader(fh)
                for row in reader:
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
        except (OSError, ValueError, KeyError, TypeError) as e:
            logging.getLogger("ai_signal_bot.core").warning(f"  Failed to load {f}: {e}")
    return candles
