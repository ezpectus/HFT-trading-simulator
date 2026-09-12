"""FFT cycle strategy — spectral cycle detection for ranging markets."""
import math

from src.strategies.signal import Signal, SignalDirection
from src.technical_analysis.fft_analysis import fft_cycle_indicator
from src.technical_analysis.indicators import atr


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

        closes = [c["close"] if isinstance(c, dict) else getattr(c, "close", 0) for c in candles]
        current_price = closes[-1]

        fft_data = fft_cycle_indicator(closes)
        regime = fft_data["regime"]
        cycle_strength = fft_data["cycle_strength"]
        trend_score = fft_data["trend_score"]
        smoothed = fft_data["smoothed_price"]
        top_cycle = fft_data["top_cycle_period"]

        atr_vals = atr(candles, 14)
        current_atr = atr_vals[-1] if atr_vals and not math.isnan(atr_vals[-1]) else current_price * 0.01

        if len(smoothed) >= 3:
            smoothed_slope = smoothed[-1] - smoothed[-3]
        else:
            smoothed_slope = 0

        if regime == "TRENDING":
            direction, confidence, sl, tp, reason = self._trending_signal(
                smoothed_slope, trend_score, top_cycle, current_price, current_atr,
            )
        elif regime == "RANGING":
            direction, confidence, sl, tp, reason = self._ranging_signal(
                smoothed, current_price, current_atr, cycle_strength,
            )
        else:
            direction, confidence, sl, tp, reason = self._mixed_signal(
                trend_score, smoothed_slope, current_price, current_atr,
            )

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

    @staticmethod
    def _trending_signal(smoothed_slope, trend_score, top_cycle, price, current_atr):
        """Generate signal in TRENDING regime — follow smoothed direction."""
        if smoothed_slope > 0:
            return (
                SignalDirection.LONG,
                min(85, 50 + abs(trend_score) * 50),
                price - 2.5 * current_atr,
                price + 4 * current_atr,
                f"FFT TRENDING up (trend={trend_score:.2f}, cycle={top_cycle:.0f}bars)",
            )
        elif smoothed_slope < 0:
            return (
                SignalDirection.SHORT,
                min(85, 50 + abs(trend_score) * 50),
                price + 2.5 * current_atr,
                price - 4 * current_atr,
                f"FFT TRENDING down (trend={trend_score:.2f}, cycle={top_cycle:.0f}bars)",
            )
        return (SignalDirection.NEUTRAL, 0, 0, 0, "FFT TRENDING but no clear slope")

    @staticmethod
    def _ranging_signal(smoothed, current_price, current_atr, cycle_strength):
        """Generate signal in RANGING regime — mean revert at cycle extremes."""
        smoothed_mid = smoothed[-1] if smoothed else current_price
        deviation = (current_price - smoothed_mid) / current_atr if current_atr > 0 else 0

        if deviation < -1.5:
            return (
                SignalDirection.LONG,
                min(80, 45 + cycle_strength * 40),
                current_price - 1.5 * current_atr,
                smoothed_mid,
                f"FFT RANGING: price {deviation:.1f}σ below cycle mid (strength={cycle_strength:.2f})",
            )
        elif deviation > 1.5:
            return (
                SignalDirection.SHORT,
                min(80, 45 + cycle_strength * 40),
                current_price + 1.5 * current_atr,
                smoothed_mid,
                f"FFT RANGING: price {deviation:.1f}σ above cycle mid (strength={cycle_strength:.2f})",
            )
        return (SignalDirection.NEUTRAL, 0, 0, 0, f"FFT RANGING: price near cycle mid (dev={deviation:.1f}σ)")

    @staticmethod
    def _mixed_signal(trend_score, smoothed_slope, current_price, current_atr):
        """Generate signal in MIXED regime — use trend score as directional bias."""
        if trend_score > 0.15 and smoothed_slope > 0:
            return (
                SignalDirection.LONG,
                min(60, 35 + abs(trend_score) * 30),
                current_price - 2 * current_atr,
                current_price + 3 * current_atr,
                f"FFT MIXED: slight uptrend bias (trend={trend_score:.2f})",
            )
        elif trend_score < -0.15 and smoothed_slope < 0:
            return (
                SignalDirection.SHORT,
                min(60, 35 + abs(trend_score) * 30),
                current_price + 2 * current_atr,
                current_price - 3 * current_atr,
                f"FFT MIXED: slight downtrend bias (trend={trend_score:.2f})",
            )
        return (SignalDirection.NEUTRAL, 0, 0, 0, f"FFT MIXED: no clear direction (trend={trend_score:.2f})")
