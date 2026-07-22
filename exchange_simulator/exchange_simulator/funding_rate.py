"""
Funding rate simulation — 8-hour funding intervals for perpetual futures.

Features:
- 8-hour funding intervals (00:00, 08:00, 16:00 UTC)
- Funding rate based on perpetual-spot basis
- Funding payment to/from positions
- Funding rate history tracking
"""

from __future__ import annotations

import logging
import time
from collections import deque
from dataclasses import dataclass

import numpy as np

logger = logging.getLogger(__name__)


FUNDING_INTERVAL_SECONDS = 8 * 3600  # 8 hours


@dataclass
class FundingRateEvent:
    timestamp: float
    symbol: str
    funding_rate: float       # Fractional (e.g., 0.0001 = 0.01%)
    funding_time: int         # 0, 8, or 16 (hour UTC)
    mark_price: float
    index_price: float


class FundingRateSimulator:
    """Simulate perpetual futures funding rates."""

    def __init__(self, symbol: str = "BTCUSDT",
                 base_rate: float = 0.0001,
                 max_rate: float = 0.005,
                 clamp_rate: float = 0.0075):
        self.symbol = symbol
        self.base_rate = base_rate        # 0.01% per 8h
        self.max_rate = max_rate          # 0.5% cap
        self.clamp_rate = clamp_rate      # 0.75% hard clamp
        self.history: deque[FundingRateEvent] = deque(maxlen=10000)
        self._rng = np.random.default_rng(seed=42)
        self._last_funding_time: int = -1

    def _compute_funding_rate(self, perp_price: float, index_price: float) -> float:
        """Compute funding rate from perpetual-spot basis."""
        if index_price <= 0:
            return 0.0
        premium = (perp_price - index_price) / index_price
        # Funding = premium_index + base_rate, clamped
        rate = premium * 0.1 + self.base_rate
        # Add noise
        rate += self._rng.normal(0, 0.00005)
        # Clamp
        rate = max(-self.clamp_rate, min(self.clamp_rate, rate))
        return rate

    def check_and_apply_funding(self, perp_price: float, index_price: float,
                                 current_time: float | None = None) -> FundingRateEvent | None:
        """Check if funding should be applied. Returns event if funding interval reached."""
        current_time = current_time if current_time is not None else time.time()
        hour_utc = int(time.gmtime(current_time).tm_hour)
        funding_hour = hour_utc // 8 * 8  # 0, 8, or 16

        if funding_hour == self._last_funding_time:
            return None

        self._last_funding_time = funding_hour
        rate = self._compute_funding_rate(perp_price, index_price)

        event = FundingRateEvent(
            timestamp=current_time,
            symbol=self.symbol,
            funding_rate=rate,
            funding_time=funding_hour,
            mark_price=perp_price,
            index_price=index_price,
        )
        self.history.append(event)
        logger.info(f"[FundingRate] {self.symbol} funding={rate:.6f} ({rate*100:.4f}%) at {funding_hour}:00 UTC")
        return event

    def compute_funding_payment(self, position_qty: float, funding_rate: float) -> float:
        """Compute funding payment for a position.
        Negative = position pays, Positive = position receives.
        Long positions pay positive funding, short positions receive.
        """
        return -position_qty * funding_rate

    def get_next_funding_time(self, current_time: float | None = None) -> float:
        """Get timestamp of next funding event."""
        current_time = current_time if current_time is not None else time.time()
        gm = time.gmtime(current_time)
        current_hour = gm.tm_hour
        next_funding_hour = ((current_hour // 8) + 1) * 8
        if next_funding_hour >= 24:
            # Next day
            next_funding_hour = 0
            seconds_to_midnight = (24 - current_hour) * 3600 - gm.tm_min * 60 - gm.tm_sec
            return current_time + seconds_to_midnight
        return current_time + (next_funding_hour - current_hour) * 3600 - gm.tm_min * 60 - gm.tm_sec

    def get_current_rate_estimate(self, perp_price: float, index_price: float) -> float:
        """Get estimated current funding rate (before next interval)."""
        return self._compute_funding_rate(perp_price, index_price)

    def get_history(self, limit: int = 100) -> list[FundingRateEvent]:
        """Get recent funding rate history."""
        return list(self.history)[-limit:]

    def get_stats(self) -> dict:
        if not self.history:
            return {"symbol": self.symbol, "count": 0}
        rates = [e.funding_rate for e in self.history]
        return {
            "symbol": self.symbol,
            "count": len(self.history),
            "avg_rate": sum(rates) / len(rates),
            "max_rate": max(rates),
            "min_rate": min(rates),
            "last_rate": rates[-1],
        }
