"""
Network latency simulation — per-exchange base latency, jitter, spikes,
and reconnection delay with exponential backoff.

Models:
- Base latency per exchange (Binance 50ms, OKX 80ms, Bybit 120ms)
- Gaussian jitter (σ = 20% of base)
- Poisson spikes (1 per ~1000 messages)
- Reconnection delay with exponential backoff
"""

from __future__ import annotations

import numpy as np
import time
from dataclasses import dataclass
from typing import Optional

import logging
logger = logging.getLogger(__name__)


@dataclass
class LatencyConfig:
    base_latency_ms: float = 50.0
    jitter_sigma_pct: float = 0.2      # 20% of base
    spike_probability: float = 0.001   # 1 in 1000
    spike_multiplier: float = 10.0     # 10x base on spike
    reconnect_base_delay_ms: float = 100.0
    reconnect_max_delay_ms: float = 30000.0
    reconnect_backoff_factor: float = 2.0


EXCHANGE_LATENCY_PROFILES = {
    "binance": LatencyConfig(base_latency_ms=50.0),
    "okx": LatencyConfig(base_latency_ms=80.0),
    "bybit": LatencyConfig(base_latency_ms=120.0),
    "simulator": LatencyConfig(base_latency_ms=5.0, spike_probability=0.0001),
}


class LatencySimulator:
    """Simulate network latency for exchange messages."""

    def __init__(self, exchange: str = "binance", config: Optional[LatencyConfig] = None):
        self.exchange = exchange
        self.config = config or EXCHANGE_LATENCY_PROFILES.get(exchange, LatencyConfig())
        self._rng = np.random.default_rng()
        self._reconnect_attempts = 0
        self._is_connected = True
        self._total_messages = 0
        self._total_spikes = 0
        self._total_latency_ms = 0.0

    def get_latency(self) -> float:
        """Get simulated latency in milliseconds for a single message."""
        if not self._is_connected:
            return self._get_reconnect_delay()

        self._total_messages += 1
        base = self.config.base_latency_ms

        # Gaussian jitter
        jitter = self._rng.normal(0, base * self.config.jitter_sigma_pct)
        latency = base + jitter

        # Poisson spike
        if self._rng.random() < self.config.spike_probability:
            latency *= self.config.spike_multiplier
            self._total_spikes += 1

        latency = max(latency, 1.0)
        self._total_latency_ms += latency
        return latency

    async def delay(self) -> None:
        """Async sleep for simulated latency."""
        import asyncio
        latency_ms = self.get_latency()
        await asyncio.sleep(latency_ms / 1000.0)

    def disconnect(self) -> None:
        """Simulate disconnection."""
        self._is_connected = False
        self._reconnect_attempts = 0
        logger.warning(f"[LatencySim] {self.exchange} disconnected")

    def _get_reconnect_delay(self) -> float:
        """Exponential backoff for reconnection."""
        delay = min(
            self.config.reconnect_base_delay_ms * (self.config.reconnect_backoff_factor ** self._reconnect_attempts),
            self.config.reconnect_max_delay_ms
        )
        return delay

    def attempt_reconnect(self) -> bool:
        """Attempt to reconnect. Returns True if successful."""
        self._reconnect_attempts += 1
        delay = self._get_reconnect_delay()
        # 80% success rate after first attempt, increasing
        success_prob = min(0.8 + 0.05 * self._reconnect_attempts, 0.99)
        if self._rng.random() < success_prob:
            attempts = self._reconnect_attempts
            self._is_connected = True
            self._reconnect_attempts = 0
            logger.info(f"[LatencySim] {self.exchange} reconnected after {attempts} attempts")
            return True
        return False

    @property
    def is_connected(self) -> bool:
        return self._is_connected

    def get_stats(self) -> dict:
        avg_latency = self._total_latency_ms / max(self._total_messages, 1)
        return {
            "exchange": self.exchange,
            "connected": self._is_connected,
            "total_messages": self._total_messages,
            "total_spikes": self._total_spikes,
            "avg_latency_ms": avg_latency,
            "reconnect_attempts": self._reconnect_attempts,
        }

    def reset(self) -> None:
        self._reconnect_attempts = 0
        self._is_connected = True
        self._total_messages = 0
        self._total_spikes = 0
        self._total_latency_ms = 0.0
