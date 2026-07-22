"""Circuit breaker for signal broadcasting — stops sending signals after consecutive failures.

Tracks signal outcomes (win/loss) from trade history. After N consecutive losing
signals, the breaker opens and blocks new signals for a cooldown period. This
prevents the bot from continuously sending bad signals during adverse conditions.

States:
  CLOSED  — normal operation, signals pass through
  OPEN    — breaker tripped, signals blocked, cooldown active
  HALF_OPEN — cooldown expired, allowing a single probe signal
"""
import logging
import time
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger("ai_signal_bot.circuit_breaker")


class BreakerState(Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


@dataclass
class CircuitBreakerConfig:
    failure_threshold: int = 5        # consecutive losses to trip
    cooldown_seconds: float = 60.0    # cooldown before half-open probe
    half_open_max_probes: int = 1     # probes allowed in half-open
    success_threshold: int = 2        # consecutive successes to close from half-open


class CircuitBreaker:
    """Circuit breaker that tracks signal outcomes and blocks on consecutive failures."""

    def __init__(self, config: CircuitBreakerConfig | None = None):
        self.config = config or CircuitBreakerConfig()
        self._state = BreakerState.CLOSED
        self._consecutive_failures = 0
        self._consecutive_successes = 0
        self._opened_at: float = 0.0
        self._half_open_probes = 0
        self._total_trips = 0
        self._total_blocks = 0

    @property
    def state(self) -> BreakerState:
        if self._state == BreakerState.OPEN:
            if time.time() - self._opened_at >= self.config.cooldown_seconds:
                self._state = BreakerState.HALF_OPEN
                self._half_open_probes = 0
                logger.info("Circuit breaker: OPEN → HALF_OPEN (cooldown expired)")
        return self._state

    @property
    def is_closed(self) -> bool:
        return self.state == BreakerState.CLOSED

    @property
    def is_open(self) -> bool:
        return self.state == BreakerState.OPEN

    @property
    def total_trips(self) -> int:
        return self._total_trips

    @property
    def total_blocks(self) -> int:
        return self._total_blocks

    def allow_signal(self) -> bool:
        """Check if a signal should be allowed through."""
        current = self.state
        if current == BreakerState.CLOSED:
            return True
        if current == BreakerState.OPEN:
            self._total_blocks += 1
            return False
        # HALF_OPEN: allow limited probes
        if self._half_open_probes < self.config.half_open_max_probes:
            self._half_open_probes += 1
            return True
        self._total_blocks += 1
        return False

    def record_success(self) -> None:
        """Record a successful signal outcome."""
        if self._state == BreakerState.HALF_OPEN:
            self._consecutive_successes += 1
            if self._consecutive_successes >= self.config.success_threshold:
                self._state = BreakerState.CLOSED
                self._consecutive_failures = 0
                self._consecutive_successes = 0
                logger.info("Circuit breaker: HALF_OPEN → CLOSED (success threshold reached)")
        elif self._state == BreakerState.CLOSED:
            self._consecutive_failures = 0

    def record_failure(self) -> None:
        """Record a failed signal outcome (e.g., losing trade)."""
        self._consecutive_successes = 0
        if self._state == BreakerState.HALF_OPEN:
            self._trip()
            return
        self._consecutive_failures += 1
        if self._consecutive_failures >= self.config.failure_threshold:
            self._trip()

    def _trip(self) -> None:
        failure_count = self._consecutive_failures
        self._state = BreakerState.OPEN
        self._opened_at = time.time()
        self._total_trips += 1
        self._consecutive_failures = 0
        logger.warning(
            f"Circuit breaker tripped: {failure_count} consecutive failures, "
            f"cooldown={self.config.cooldown_seconds}s (total trips: {self._total_trips})"
        )

    def reset(self) -> None:
        """Force reset to CLOSED state."""
        self._state = BreakerState.CLOSED
        self._consecutive_failures = 0
        self._consecutive_successes = 0
        self._half_open_probes = 0

    def get_status(self) -> dict:
        """Return status dict for monitoring/UI."""
        return {
            "state": self.state.value,
            "consecutive_failures": self._consecutive_failures,
            "consecutive_successes": self._consecutive_successes,
            "total_trips": self._total_trips,
            "total_blocks": self._total_blocks,
            "failure_threshold": self.config.failure_threshold,
            "cooldown_seconds": self.config.cooldown_seconds,
        }
