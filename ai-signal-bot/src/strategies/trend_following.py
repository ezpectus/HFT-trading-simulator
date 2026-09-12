"""Trend-following strategy — EMA crossover + ADX/continuation entries."""
import math

from src.strategies.signal import Signal, SignalDirection
from src.technical_analysis.indicators import adx, atr, ema


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
        self._cache: dict[tuple, dict] = {}

    def analyze(self, symbol: str, candles: list[dict]) -> Signal:
        if len(candles) < self.ema_slow + 2:
            return Signal(
                symbol=symbol, direction=SignalDirection.NEUTRAL,
                confidence=0, strategy=self.name, entry_price=0,
                stop_loss=0, take_profit=0, reason="Insufficient data",
            )

        closes = [c["close"] if isinstance(c, dict) else getattr(c, "close", 0) for c in candles]
        cache_key = (symbol, len(candles), closes[-1])
        cached = self._cache.get(cache_key)
        if cached:
            ema_f = cached["ema_f"]
            ema_s = cached["ema_s"]
            adx_vals = cached["adx_vals"]
            atr_vals = cached["atr_vals"]
        else:
            ema_f = ema(closes, self.ema_fast)
            ema_s = ema(closes, self.ema_slow)
            adx_vals = adx(candles, 14)
            atr_vals = atr(candles, 14)
            self._cache[cache_key] = {"ema_f": ema_f, "ema_s": ema_s, "adx_vals": adx_vals, "atr_vals": atr_vals}
            if len(self._cache) > 200:
                self._cache.pop(next(iter(self._cache)))

        current_price = closes[-1]
        current_adx = adx_vals[-1] if adx_vals and not math.isnan(adx_vals[-1]) else 0
        current_atr = atr_vals[-1] if atr_vals and not math.isnan(atr_vals[-1]) else current_price * 0.01

        if math.isnan(ema_f[-1]) or math.isnan(ema_s[-1]) or math.isnan(ema_f[-2]) or math.isnan(ema_s[-2]):
            return Signal(
                symbol=symbol, direction=SignalDirection.NEUTRAL,
                confidence=0, strategy=self.name, entry_price=current_price,
                stop_loss=0, take_profit=0, reason="EMA not ready",
            )

        bullish_cross = ema_f[-1] > ema_s[-1] and ema_f[-2] <= ema_s[-2]
        bearish_cross = ema_f[-1] < ema_s[-1] and ema_f[-2] >= ema_s[-2]
        trending = current_adx >= self.adx_threshold

        signal = self._crossover_signal(symbol, current_price, current_adx, current_atr, bullish_cross, bearish_cross, trending)
        if signal:
            return signal

        return self._trend_continuation_signal(symbol, current_price, current_adx, current_atr, ema_f[-1], ema_s[-1], trending)

    def _crossover_signal(
        self, symbol: str, price: float, adx_val: float, atr_val: float,
        bullish: bool, bearish: bool, trending: bool,
    ) -> Signal | None:
        """Generate signal on fresh EMA crossover with ADX filter."""
        if bullish and trending:
            return Signal(symbol, SignalDirection.LONG, min(95, 50 + adx_val),
                          self.name, price, price - 2 * atr_val, price + 3 * atr_val,
                          f"EMA{self.ema_fast}>EMA{self.ema_slow} cross, ADX={adx_val:.1f}")
        if bearish and trending:
            return Signal(symbol, SignalDirection.SHORT, min(95, 50 + adx_val),
                          self.name, price, price + 2 * atr_val, price - 3 * atr_val,
                          f"EMA{self.ema_fast}<EMA{self.ema_slow} cross, ADX={adx_val:.1f}")
        return None

    def _trend_continuation_signal(
        self, symbol: str, price: float, adx_val: float, atr_val: float,
        ema_f: float, ema_s: float, trending: bool,
    ) -> Signal:
        """Generate signal for ongoing trend without fresh crossover."""
        bullish_trend = ema_f > ema_s
        bearish_trend = ema_f < ema_s

        if bullish_trend and trending and adx_val > 30:
            return Signal(symbol, SignalDirection.LONG, 65, self.name,
                          price, price - 2 * atr_val, price + 3 * atr_val,
                          f"Uptrend (ADX={adx_val:.1f}), no fresh cross")
        if bearish_trend and trending and adx_val > 30:
            return Signal(symbol, SignalDirection.SHORT, 65, self.name,
                          price, price + 2 * atr_val, price - 3 * atr_val,
                          f"Downtrend (ADX={adx_val:.1f}), no fresh cross")
        return Signal(symbol, SignalDirection.NEUTRAL, 0, self.name, price, 0, 0,
                      f"ADX={adx_val:.1f} below threshold {self.adx_threshold}")

