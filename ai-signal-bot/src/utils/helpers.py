"""Utility functions — logging, config loading, time helpers, formatting."""

from __future__ import annotations

import logging
import os
import time
from typing import Any  # Any: env var defaults may be str|int|float|bool


def load_config(config_path: str = "config/settings.yaml") -> dict:
    """Load YAML configuration file."""
    try:
        import yaml
        with open(config_path) as f:
            return yaml.safe_load(f) or {}
    except FileNotFoundError:
        return {}
    except (OSError, ValueError, TypeError) as e:
        logging.error(f"Failed to load config {config_path}: {e}")
        return {}


def get_env(key: str, default: Any = None, cast: type = str) -> Any:
    """Get environment variable with type casting. Any: default may be str|int|float|bool."""
    val = os.getenv(key)
    if val is None:
        return default
    try:
        if cast is bool:
            return val.lower() in ("true", "1", "yes", "on")
        return cast(val)
    except (ValueError, TypeError):
        return default


def now_ms() -> int:
    """Current time in milliseconds."""
    return int(time.time() * 1000)


def now_us() -> int:
    """Current time in microseconds."""
    return int(time.time() * 1_000_000)


def format_price(price: float, decimals: int = 2) -> str:
    """Format price with appropriate decimal places."""
    if price >= 1000:
        return f"{price:,.2f}"
    elif price >= 1:
        return f"{price:.4f}"
    else:
        return f"{price:.8f}"


def format_qty(qty: float) -> str:
    """Format quantity with appropriate precision."""
    if qty >= 1000:
        return f"{qty:,.2f}"
    elif qty >= 1:
        return f"{qty:.4f}"
    else:
        return f"{qty:.8f}"


def format_percentage(value: float, decimals: int = 2) -> str:
    """Format a value as percentage string."""
    return f"{value:.{decimals}f}%"


def safe_divide(a: float, b: float, default: float = 0.0) -> float:
    """Safe division with default value."""
    return a / b if abs(b) > 1e-10 else default


def clamp(value: float, min_val: float, max_val: float) -> float:
    """Clamp value to range."""
    return max(min_val, min(max_val, value))


def truncate_dict(d: dict, max_items: int = 100) -> dict:
    """Truncate dict to max items (for logging)."""
    if len(d) <= max_items:
        return d
    items = list(d.items())[:max_items]
    result = dict(items)
    result["..._truncated"] = len(d) - max_items
    return result


class CircuitBreaker:
    """Simple circuit breaker for external API calls."""

    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 30.0):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self._failure_count = 0
        self._last_failure_time: float = 0
        self._state = "closed"  # closed, open, half_open

    @property
    def is_open(self) -> bool:
        if self._state == "open":
            if time.time() - self._last_failure_time > self.recovery_timeout:
                self._state = "half_open"
                return False
            return True
        return False

    def record_success(self) -> None:
        self._failure_count = 0
        self._state = "closed"

    def record_failure(self) -> None:
        self._failure_count += 1
        self._last_failure_time = time.time()
        if self._failure_count >= self.failure_threshold:
            self._state = "open"

    @property
    def state(self) -> str:
        return self._state


class RateLimiter:
    """Token bucket rate limiter for async contexts."""

    def __init__(self, rate: float, burst: int = 1):
        self.rate = rate
        self.burst = burst
        self._tokens = float(burst)
        self._last_refill = time.monotonic()

    def _refill(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_refill
        self._tokens = min(self.burst, self._tokens + elapsed * self.rate)
        self._last_refill = now

    async def acquire(self) -> bool:
        import asyncio
        if self.rate <= 0:
            return False
        while True:
            self._refill()
            if self._tokens >= 1.0:
                self._tokens -= 1.0
                return True
            wait = (1.0 - self._tokens) / self.rate
            await asyncio.sleep(wait)
