"""Circuit breaker — stops trading after consecutive losses with auto-recovery.

Tracks closed trades and trips when consecutive losses reach a threshold.
While tripped, all signals are forced NEUTRAL. Auto-recovers after cooldown
period expires.
"""
import time

from src.observability.logging import get_logger
from src.strategies.signal import Signal, SignalDirection

logger = get_logger("ai_signal_bot.strategies")


class CircuitBreaker:
    """Stops trading after consecutive losses — auto-recovery after cooldown."""

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
        self.check_and_recover()
        return self._tripped

    def check_and_recover(self) -> bool:
        """Check if cooldown has elapsed and auto-recover. Returns True if recovered."""
        if self._tripped:
            if time.time() - self._trip_time >= self.cooldown_seconds:
                self._tripped = False
                self._consecutive_losses = 0
                logger.info(
                    "CircuitBreaker: auto-recovered after %ss cooldown",
                    self.cooldown_seconds,
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
                    "CircuitBreaker: tripped after %s "
                    "consecutive losses. Cooldown: %ss",
                    self._consecutive_losses,
                    self.cooldown_seconds,
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
