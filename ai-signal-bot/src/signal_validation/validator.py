"""Signal validation — quality filters and risk checks.

Validates signals before they are sent to the execution bot.
Checks confidence, R:R ratio, drawdown limits, and position limits.
"""
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

from src.strategies.strategies import Signal, SignalDirection

logger = logging.getLogger("ai_signal_bot.validation")


@dataclass
class ValidationResult:
    """Result of signal validation."""
    passed: bool
    reason: str
    signal: Signal


class SignalValidator:
    """Validates trading signals against risk rules.

    Checks:
    - Minimum confidence threshold
    - Minimum R:R ratio
    - Maximum daily drawdown
    - Maximum open positions
    - Duplicate signal prevention
    """

    def __init__(
        self,
        min_confidence: float = 65,
        min_rr_ratio: float = 1.5,
        max_drawdown_pct: float = 8.0,
        max_open_positions: int = 3,
    ):
        self.min_confidence = min_confidence
        self.min_rr_ratio = min_rr_ratio
        self.max_drawdown_pct = max_drawdown_pct
        self.max_open_positions = max_open_positions
        self._daily_pnl: float = 0.0
        self._daily_reset: datetime = datetime.now()
        self._open_positions: int = 0
        self._recent_signals: dict[str, datetime] = {}

    def reset_daily(self) -> None:
        """Reset daily PnL tracking."""
        self._daily_pnl = 0.0
        self._daily_reset = datetime.now()
        logger.info("Daily PnL reset")

    def update_pnl(self, pnl: float) -> None:
        """Track realized PnL for drawdown calculation."""
        now = datetime.now()
        if now - self._daily_reset > timedelta(hours=24):
            self.reset_daily()
        self._daily_pnl += pnl

    def update_position_count(self, count: int) -> None:
        self._open_positions = count

    def validate(self, signal: Signal, account_balance: float = 10000.0) -> ValidationResult:
        """Validate a signal against all risk rules."""
        if not signal.is_actionable:
            return ValidationResult(False, "Signal is neutral", signal)

        # Check confidence
        if signal.confidence < self.min_confidence:
            return ValidationResult(
                False,
                f"Confidence {signal.confidence:.1f} < min {self.min_confidence}",
                signal,
            )

        # Check R:R ratio
        rr = signal.rr_ratio
        if rr < self.min_rr_ratio:
            return ValidationResult(
                False,
                f"R:R ratio {rr:.2f} < min {self.min_rr_ratio}",
                signal,
            )

        # Check daily drawdown
        drawdown_pct = abs(self._daily_pnl) / account_balance * 100 if account_balance > 0 else 0
        if self._daily_pnl < 0 and drawdown_pct >= self.max_drawdown_pct:
            return ValidationResult(
                False,
                f"Daily drawdown {drawdown_pct:.1f}% >= max {self.max_drawdown_pct}%",
                signal,
            )

        # Check max open positions
        if self._open_positions >= self.max_open_positions:
            return ValidationResult(
                False,
                f"Max positions reached ({self._open_positions}/{self.max_open_positions})",
                signal,
            )

        # Check duplicate signal (same symbol within last 5 minutes)
        now = datetime.now()
        if signal.symbol in self._recent_signals:
            last_time = self._recent_signals[signal.symbol]
            if now - last_time < timedelta(minutes=5):
                return ValidationResult(
                    False,
                    f"Duplicate signal for {signal.symbol} (cooldown)",
                    signal,
                )

        self._recent_signals[signal.symbol] = now
        return ValidationResult(True, "Signal validated", signal)
