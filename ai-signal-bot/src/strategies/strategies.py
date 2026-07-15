"""Trading strategies — trend following, mean reversion, and ensemble voter.

Each strategy analyzes candle data and produces a Signal with direction,
confidence, and suggested SL/TP levels.
"""
import logging
import math
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

logger = logging.getLogger("ai_signal_bot.strategies")

from src.technical_analysis.indicators import (
    adx, atr, bollinger_bands, ema, macd, rsi, sma, vwap,
)
from src.technical_analysis.fft_analysis import fft_cycle_indicator


class SignalDirection(Enum):
    LONG = "LONG"
    SHORT = "SHORT"
    NEUTRAL = "NEUTRAL"


@dataclass
class Signal:
    """Trading signal from a strategy."""
    symbol: str
    direction: SignalDirection
    confidence: float          # 0-100
    strategy: str              # strategy name
    entry_price: float
    stop_loss: float
    take_profit: float
    reason: str = ""
    timestamp: int = 0

    @property
    def is_actionable(self) -> bool:
        return self.direction != SignalDirection.NEUTRAL

    @property
    def rr_ratio(self) -> float:
        if self.direction == SignalDirection.LONG:
            risk = self.entry_price - self.stop_loss
            reward = self.take_profit - self.entry_price
        elif self.direction == SignalDirection.SHORT:
            risk = self.stop_loss - self.entry_price
            reward = self.entry_price - self.take_profit
        else:
            return 0.0
        return reward / risk if risk > 0 else 0.0

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "direction": self.direction.value,
            "confidence": self.confidence,
            "strategy": self.strategy,
            "entry_price": self.entry_price,
            "stop_loss": self.stop_loss,
            "take_profit": self.take_profit,
            "reason": self.reason,
            "timestamp": self.timestamp,
            "rr_ratio": self.rr_ratio,
        }


class TrendFollowingStrategy:
    """EMA crossover + ADX trend strength filter.

    Entry: EMA fast crosses above/below EMA slow
    Filter: ADX must be above threshold (trending market)
    Confidence: Scaled by ADX strength and EMA separation
    """

    def __init__(self, ema_fast: int = 9, ema_slow: int = 21, adx_threshold: float = 25.0):
        self.ema_fast = ema_fast
        self.ema_slow = ema_slow
        self.adx_threshold = adx_threshold
        self.name = "trend_following"

    def analyze(self, symbol: str, candles: list[dict]) -> Signal:
        if len(candles) < self.ema_slow + 2:
            return Signal(
                symbol=symbol, direction=SignalDirection.NEUTRAL,
                confidence=0, strategy=self.name, entry_price=0,
                stop_loss=0, take_profit=0, reason="Insufficient data",
            )

        closes = [c["close"] if isinstance(c, dict) else c.close for c in candles]
        ema_f = ema(closes, self.ema_fast)
        ema_s = ema(closes, self.ema_slow)
        adx_vals = adx(candles, 14)
        atr_vals = atr(candles, 14)

        current_price = closes[-1]
        current_adx = adx_vals[-1] if adx_vals and not math.isnan(adx_vals[-1]) else 0
        current_atr = atr_vals[-1] if atr_vals and not math.isnan(atr_vals[-1]) else current_price * 0.01

        # Check EMA crossover
        if math.isnan(ema_f[-1]) or math.isnan(ema_s[-1]) or math.isnan(ema_f[-2]) or math.isnan(ema_s[-2]):
            return Signal(
                symbol=symbol, direction=SignalDirection.NEUTRAL,
                confidence=0, strategy=self.name, entry_price=current_price,
                stop_loss=0, take_profit=0, reason="EMA not ready",
            )

        bullish_cross = ema_f[-1] > ema_s[-1] and ema_f[-2] <= ema_s[-2]
        bearish_cross = ema_f[-1] < ema_s[-1] and ema_f[-2] >= ema_s[-2]
        bullish_trend = ema_f[-1] > ema_s[-1]
        bearish_trend = ema_f[-1] < ema_s[-1]

        # ADX filter
        trending = current_adx >= self.adx_threshold

        if bullish_cross and trending:
            confidence = min(95, 50 + current_adx)
            sl = current_price - 2 * current_atr
            tp = current_price + 3 * current_atr
            return Signal(
                symbol=symbol, direction=SignalDirection.LONG,
                confidence=confidence, strategy=self.name,
                entry_price=current_price, stop_loss=sl, take_profit=tp,
                reason=f"EMA{self.ema_fast}>EMA{self.ema_slow} cross, ADX={current_adx:.1f}",
            )

        if bearish_cross and trending:
            confidence = min(95, 50 + current_adx)
            sl = current_price + 2 * current_atr
            tp = current_price - 3 * current_atr
            return Signal(
                symbol=symbol, direction=SignalDirection.SHORT,
                confidence=confidence, strategy=self.name,
                entry_price=current_price, stop_loss=sl, take_profit=tp,
                reason=f"EMA{self.ema_fast}<EMA{self.ema_slow} cross, ADX={current_adx:.1f}",
            )

        # No crossover but trending
        if bullish_trend and trending and current_adx > 30:
            return Signal(
                symbol=symbol, direction=SignalDirection.LONG,
                confidence=45, strategy=self.name,
                entry_price=current_price,
                stop_loss=current_price - 2 * current_atr,
                take_profit=current_price + 3 * current_atr,
                reason=f"Uptrend (ADX={current_adx:.1f}), no fresh cross",
            )

        if bearish_trend and trending and current_adx > 30:
            return Signal(
                symbol=symbol, direction=SignalDirection.SHORT,
                confidence=45, strategy=self.name,
                entry_price=current_price,
                stop_loss=current_price + 2 * current_atr,
                take_profit=current_price - 3 * current_atr,
                reason=f"Downtrend (ADX={current_adx:.1f}), no fresh cross",
            )

        return Signal(
            symbol=symbol, direction=SignalDirection.NEUTRAL,
            confidence=0, strategy=self.name, entry_price=current_price,
            stop_loss=0, take_profit=0,
            reason=f"ADX={current_adx:.1f} below threshold {self.adx_threshold}",
        )


class MeanReversionStrategy:
    """RSI + Bollinger Bands mean reversion.

    Entry: RSI oversold/overbought AND price touches BB lower/upper band
    Exit: Price returns to BB middle band
    """

    def __init__(
        self,
        rsi_oversold: float = 30,
        rsi_overbought: float = 70,
        bb_period: int = 20,
        bb_std: float = 2.0,
    ):
        self.rsi_oversold = rsi_oversold
        self.rsi_overbought = rsi_overbought
        self.bb_period = bb_period
        self.bb_std = bb_std
        self.name = "mean_reversion"

    def analyze(self, symbol: str, candles: list[dict]) -> Signal:
        if len(candles) < self.bb_period + 5:
            return Signal(
                symbol=symbol, direction=SignalDirection.NEUTRAL,
                confidence=0, strategy=self.name, entry_price=0,
                stop_loss=0, take_profit=0, reason="Insufficient data",
            )

        closes = [c["close"] if isinstance(c, dict) else c.close for c in candles]
        rsi_vals = rsi(candles, 14)
        mid, upper, lower = bollinger_bands(candles, self.bb_period, self.bb_std)
        atr_vals = atr(candles, 14)

        current_price = closes[-1]
        current_rsi = rsi_vals[-1] if rsi_vals and not math.isnan(rsi_vals[-1]) else 50
        current_mid = mid[-1] if mid and not math.isnan(mid[-1]) else current_price
        current_lower = lower[-1] if lower and not math.isnan(lower[-1]) else current_price * 0.98
        current_upper = upper[-1] if upper and not math.isnan(upper[-1]) else current_price * 1.02
        current_atr = atr_vals[-1] if atr_vals and not math.isnan(atr_vals[-1]) else current_price * 0.01

        # Long: RSI oversold + price at/below lower BB
        if current_rsi <= self.rsi_oversold and current_price <= current_lower:
            confidence = min(90, 50 + (self.rsi_oversold - current_rsi) * 2)
            sl = current_price - 1.5 * current_atr
            tp = current_mid  # Target: BB middle
            return Signal(
                symbol=symbol, direction=SignalDirection.LONG,
                confidence=confidence, strategy=self.name,
                entry_price=current_price, stop_loss=sl, take_profit=tp,
                reason=f"RSI={current_rsi:.1f} oversold, price at lower BB",
            )

        # Short: RSI overbought + price at/above upper BB
        if current_rsi >= self.rsi_overbought and current_price >= current_upper:
            confidence = min(90, 50 + (current_rsi - self.rsi_overbought) * 2)
            sl = current_price + 1.5 * current_atr
            tp = current_mid
            return Signal(
                symbol=symbol, direction=SignalDirection.SHORT,
                confidence=confidence, strategy=self.name,
                entry_price=current_price, stop_loss=sl, take_profit=tp,
                reason=f"RSI={current_rsi:.1f} overbought, price at upper BB",
            )

        return Signal(
            symbol=symbol, direction=SignalDirection.NEUTRAL,
            confidence=0, strategy=self.name, entry_price=current_price,
            stop_loss=0, take_profit=0,
            reason=f"RSI={current_rsi:.1f}, no extreme conditions",
        )


class CircuitBreaker:
    """Stops trading after consecutive losses — auto-recovery after cooldown.

    Tracks closed trades and trips when consecutive losses reach a threshold.
    While tripped, all signals are forced NEUTRAL. Auto-recovers after cooldown
    period expires. This prevents catastrophic drawdown from a failing strategy.

    Design follows Kleppmann's principle of graceful degradation: the system
    continues running but refuses to trade, rather than crashing or continuing
    to lose money.
    """

    def __init__(
        self,
        max_consecutive_losses: int = 5,
        cooldown_seconds: float = 300.0,
    ):
        self.max_consecutive_losses = max_consecutive_losses
        self.cooldown_seconds = cooldown_seconds
        self._consecutive_losses = 0
        self._tripped = False
        self._trip_time = 0.0

    @property
    def is_tripped(self) -> bool:
        return self._tripped

    def check_and_recover(self) -> bool:
        """Check if cooldown has elapsed and auto-recover. Returns True if recovered."""
        if self._tripped:
            if time.time() - self._trip_time >= self.cooldown_seconds:
                self._tripped = False
                self._consecutive_losses = 0
                logger.info(
                    f"CircuitBreaker: auto-recovered after {self.cooldown_seconds}s cooldown"
                )
                return True
        return False

    def on_trade_closed(self, pnl: float) -> None:
        """Record a closed trade result. Positive PnL = win, negative = loss."""
        if pnl > 0:
            self._consecutive_losses = 0
        else:
            self._consecutive_losses += 1
            if self._consecutive_losses >= self.max_consecutive_losses and not self._tripped:
                self._tripped = True
                self._trip_time = time.time()
                logger.warning(
                    f"CircuitBreaker: tripped after {self._consecutive_losses} "
                    f"consecutive losses. Cooldown: {self.cooldown_seconds}s"
                )

    def filter_signal(self, signal: Signal) -> Signal:
        """If tripped, force signal to NEUTRAL. Otherwise pass through."""
        self.check_and_recover()
        if self.is_tripped:
            return Signal(
                symbol=signal.symbol,
                direction=SignalDirection.NEUTRAL,
                confidence=0,
                strategy=signal.strategy,
                entry_price=signal.entry_price,
                stop_loss=0,
                take_profit=0,
                reason=f"Circuit breaker tripped ({self._consecutive_losses} losses)",
            )
        return signal

    def reset(self) -> None:
        """Manually reset the circuit breaker."""
        self._consecutive_losses = 0
        self._tripped = False
        logger.info("CircuitBreaker: manually reset")

    @property
    def consecutive_losses(self) -> int:
        return self._consecutive_losses


class EnsembleVoter:
    """Combines signals from multiple strategies using majority voting.

    Modes:
    - "majority":  Direction with most votes wins
    - "weighted":  Confidence-weighted direction
    Min votes required to produce a signal.
    """

    def __init__(self, mode: str = "majority", min_votes: int = 2,
                 circuit_breaker: CircuitBreaker | None = None):
        self.mode = mode
        self.min_votes = min_votes
        self.circuit_breaker = circuit_breaker
        self.name = "ensemble"

    def vote(self, signals: list[Signal]) -> Signal:
        """Combine multiple strategy signals into one ensemble signal."""
        # Circuit breaker: if tripped, force NEUTRAL regardless of signals
        if self.circuit_breaker:
            self.circuit_breaker.check_and_recover()
        if self.circuit_breaker and self.circuit_breaker.is_tripped:
            sym = signals[0].symbol if signals else ""
            entry = signals[0].entry_price if signals else 0
            return Signal(
                symbol=sym,
                direction=SignalDirection.NEUTRAL,
                confidence=0, strategy=self.name,
                entry_price=entry, stop_loss=0, take_profit=0,
                reason=f"Circuit breaker active ({self.circuit_breaker.consecutive_losses} losses)",
            )

        # Single-pass accumulation — avoids creating 3 intermediate lists
        long_count = 0
        short_count = 0
        long_score = 0.0
        short_score = 0.0
        long_agg = [0.0, 0.0, 0.0, 0.0]  # confidence, entry, sl, tp
        short_agg = [0.0, 0.0, 0.0, 0.0]
        long_strategies = []
        short_strategies = []
        first_actionable = None

        for s in signals:
            if not s.is_actionable:
                continue
            if first_actionable is None:
                first_actionable = s
            if s.direction == SignalDirection.LONG:
                long_count += 1
                long_score += s.confidence
                long_agg[0] += s.confidence
                long_agg[1] += s.entry_price
                long_agg[2] += s.stop_loss
                long_agg[3] += s.take_profit
                long_strategies.append(s.strategy)
            elif s.direction == SignalDirection.SHORT:
                short_count += 1
                short_score += s.confidence
                short_agg[0] += s.confidence
                short_agg[1] += s.entry_price
                short_agg[2] += s.stop_loss
                short_agg[3] += s.take_profit
                short_strategies.append(s.strategy)

        if first_actionable is None:
            return Signal(
                symbol=signals[0].symbol if signals else "",
                direction=SignalDirection.NEUTRAL,
                confidence=0, strategy=self.name,
                entry_price=0, stop_loss=0, take_profit=0,
                reason="No actionable signals",
            )

        if self.mode == "weighted":
            if long_score > short_score and long_count >= self.min_votes:
                winner_count = long_count
                winner_agg = long_agg
                winner_strategies = long_strategies
                direction = SignalDirection.LONG
            elif short_score > long_score and short_count >= self.min_votes:
                winner_count = short_count
                winner_agg = short_agg
                winner_strategies = short_strategies
                direction = SignalDirection.SHORT
            else:
                return Signal(
                    symbol=first_actionable.symbol,
                    direction=SignalDirection.NEUTRAL,
                    confidence=0, strategy=self.name,
                    entry_price=first_actionable.entry_price,
                    stop_loss=0, take_profit=0,
                    reason=f"Insufficient votes (L:{long_count}/S:{short_count})",
                )
        else:
            if long_count > short_count and long_count >= self.min_votes:
                winner_count = long_count
                winner_agg = long_agg
                winner_strategies = long_strategies
                direction = SignalDirection.LONG
            elif short_count > long_count and short_count >= self.min_votes:
                winner_count = short_count
                winner_agg = short_agg
                winner_strategies = short_strategies
                direction = SignalDirection.SHORT
            else:
                return Signal(
                    symbol=first_actionable.symbol,
                    direction=SignalDirection.NEUTRAL,
                    confidence=0, strategy=self.name,
                    entry_price=first_actionable.entry_price,
                    stop_loss=0, take_profit=0,
                    reason=f"Split vote (L:{long_count}/S:{short_count})",
                )

        # Aggregate winning signals — divide accumulated sums by count
        inv_count = 1.0 / winner_count
        return Signal(
            symbol=first_actionable.symbol,
            direction=direction,
            confidence=round(winner_agg[0] * inv_count, 1),
            strategy=self.name,
            entry_price=winner_agg[1] * inv_count,
            stop_loss=winner_agg[2] * inv_count,
            take_profit=winner_agg[3] * inv_count,
            reason=f"Ensemble ({', '.join(winner_strategies)}): {winner_count} votes",
        )


class FFTCycleStrategy:
    """FFT-based cycle detection strategy.

    Uses spectral analysis to:
    - Detect dominant market cycles
    - Classify regime (trending vs ranging)
    - Generate signals based on cycle phase

    In TRENDING regime: Follow the smoothed price direction
    In RANGING regime: Mean-revert at cycle extremes
    In MIXED regime: Use cycle strength as confidence modifier
    """

    def __init__(self, min_data: int = 64):
        self.min_data = min_data
        self.name = "fft_cycle"

    def analyze(self, symbol: str, candles: list[dict]) -> Signal:
        if len(candles) < self.min_data:
            return Signal(
                symbol=symbol, direction=SignalDirection.NEUTRAL,
                confidence=0, strategy=self.name, entry_price=0,
                stop_loss=0, take_profit=0,
                reason=f"Need {self.min_data} candles, got {len(candles)}",
            )

        closes = [c["close"] if isinstance(c, dict) else c.close for c in candles]
        current_price = closes[-1]

        # FFT analysis
        fft_data = fft_cycle_indicator(closes)
        regime = fft_data["regime"]
        cycle_strength = fft_data["cycle_strength"]
        trend_score = fft_data["trend_score"]
        smoothed = fft_data["smoothed_price"]
        top_cycle = fft_data["top_cycle_period"]

        # ATR for SL/TP
        atr_vals = atr(candles, 14)
        current_atr = atr_vals[-1] if atr_vals and not math.isnan(atr_vals[-1]) else current_price * 0.01

        # Smoothed price direction
        if len(smoothed) >= 3:
            smoothed_slope = smoothed[-1] - smoothed[-3]
        else:
            smoothed_slope = 0

        # Signal generation based on regime
        if regime == "TRENDING":
            # Follow smoothed trend direction
            if smoothed_slope > 0:
                direction = SignalDirection.LONG
                confidence = min(85, 50 + abs(trend_score) * 50)
                sl = current_price - 2.5 * current_atr
                tp = current_price + 4 * current_atr
                reason = f"FFT TRENDING up (trend={trend_score:.2f}, cycle={top_cycle:.0f}bars)"
            elif smoothed_slope < 0:
                direction = SignalDirection.SHORT
                confidence = min(85, 50 + abs(trend_score) * 50)
                sl = current_price + 2.5 * current_atr
                tp = current_price - 4 * current_atr
                reason = f"FFT TRENDING down (trend={trend_score:.2f}, cycle={top_cycle:.0f}bars)"
            else:
                direction = SignalDirection.NEUTRAL
                confidence = 0
                sl = tp = 0
                reason = "FFT TRENDING but no clear slope"
        elif regime == "RANGING":
            # Mean reversion — compare current price to smoothed (cycle midpoint)
            smoothed_mid = smoothed[-1] if smoothed else current_price
            deviation = (current_price - smoothed_mid) / current_atr if current_atr > 0 else 0

            if deviation < -1.5:
                # Price below cycle low — buy
                direction = SignalDirection.LONG
                confidence = min(80, 45 + cycle_strength * 40)
                sl = current_price - 1.5 * current_atr
                tp = smoothed_mid
                reason = f"FFT RANGING: price {deviation:.1f}σ below cycle mid (strength={cycle_strength:.2f})"
            elif deviation > 1.5:
                # Price above cycle high — sell
                direction = SignalDirection.SHORT
                confidence = min(80, 45 + cycle_strength * 40)
                sl = current_price + 1.5 * current_atr
                tp = smoothed_mid
                reason = f"FFT RANGING: price {deviation:.1f}σ above cycle mid (strength={cycle_strength:.2f})"
            else:
                direction = SignalDirection.NEUTRAL
                confidence = 0
                sl = tp = 0
                reason = f"FFT RANGING: price near cycle mid (dev={deviation:.1f}σ)"
        else:
            # MIXED — use trend score as directional bias
            if trend_score > 0.15 and smoothed_slope > 0:
                direction = SignalDirection.LONG
                confidence = min(60, 35 + abs(trend_score) * 30)
                sl = current_price - 2 * current_atr
                tp = current_price + 3 * current_atr
                reason = f"FFT MIXED: slight uptrend bias (trend={trend_score:.2f})"
            elif trend_score < -0.15 and smoothed_slope < 0:
                direction = SignalDirection.SHORT
                confidence = min(60, 35 + abs(trend_score) * 30)
                sl = current_price + 2 * current_atr
                tp = current_price - 3 * current_atr
                reason = f"FFT MIXED: slight downtrend bias (trend={trend_score:.2f})"
            else:
                direction = SignalDirection.NEUTRAL
                confidence = 0
                sl = tp = 0
                reason = f"FFT MIXED: no clear direction (trend={trend_score:.2f})"

        return Signal(
            symbol=symbol,
            direction=direction,
            confidence=confidence,
            strategy=self.name,
            entry_price=current_price,
            stop_loss=sl,
            take_profit=tp,
            reason=reason,
        )
