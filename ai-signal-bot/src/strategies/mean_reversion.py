"""Mean-reversion strategy — Bollinger/RSI fade entries."""
import math

from src.strategies.signal import Signal, SignalDirection
from src.technical_analysis.indicators import atr, bollinger_bands, rsi


class MeanReversionStrategy:
    """RSI + Bollinger Bands mean reversion.

    Entry: RSI oversold/overbought AND price touches BB lower/upper band
    Exit: Price returns to BB middle band
    """

    def __init__(
        self,
        rsi_period: int = 14,
        rsi_oversold: float = 30,
        rsi_overbought: float = 70,
        bb_period: int = 20,
        bb_std: float = 2.0,
        atr_period: int = 14,
    ):
        self.rsi_period = rsi_period
        self.atr_period = atr_period
        self.rsi_oversold = rsi_oversold
        self.rsi_overbought = rsi_overbought
        self.bb_period = bb_period
        self.bb_std = bb_std
        self.name = "mean_reversion"
        self._cache: dict[tuple, dict] = {}

    def analyze(self, symbol: str, candles: list[dict]) -> Signal:
        if len(candles) < self.bb_period + 5:
            return Signal(
                symbol=symbol, direction=SignalDirection.NEUTRAL,
                confidence=0, strategy=self.name, entry_price=0,
                stop_loss=0, take_profit=0, reason="Insufficient data",
            )

        closes = [c["close"] if isinstance(c, dict) else getattr(c, "close", 0) for c in candles]
        cache_key = (symbol, len(candles), closes[-1])
        cached = self._cache.get(cache_key)
        if cached:
            rsi_vals = cached["rsi_vals"]
            mid = cached["mid"]
            upper = cached["upper"]
            lower = cached["lower"]
            atr_vals = cached["atr_vals"]
        else:
            rsi_vals = rsi(candles, self.rsi_period)
            mid, upper, lower = bollinger_bands(candles, self.bb_period, self.bb_std)
            atr_vals = atr(candles, self.atr_period)
            self._cache[cache_key] = {"rsi_vals": rsi_vals, "mid": mid, "upper": upper, "lower": lower, "atr_vals": atr_vals}
            if len(self._cache) > 200:
                self._cache.pop(next(iter(self._cache)))

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

