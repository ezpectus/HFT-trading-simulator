"""Utility functions — logging, config loading, time helpers, formatting."""

from __future__ import annotations

import json
import os
import sys
import time
import logging
from typing import Any, Optional
from datetime import datetime, timezone


def setup_logging(level: str = "INFO", format_type: str = "json",
                  log_file: Optional[str] = None) -> logging.Logger:
    """Configure structured logging.

    Args:
        level: LOG_LEVEL env var (DEBUG, INFO, WARNING, ERROR)
        format_type: 'json' for structured JSON logs, 'text' for human-readable
        log_file: Optional file path for log output
    """
    log_level = getattr(logging, level.upper(), logging.INFO)
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    if format_type == "json":
        formatter = JsonFormatter()
    else:
        formatter = logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    root_logger.addHandler(handler)

    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

    return logging.getLogger("ai-signal-bot")


class JsonFormatter(logging.Formatter):
    """JSON log formatter for structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "line": record.lineno,
        }
        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = str(record.exc_info[1])
        if hasattr(record, "extra_data"):
            log_entry["data"] = record.extra_data
        return json.dumps(log_entry, default=str)


def load_config(config_path: str = "config/settings.yaml") -> dict:
    """Load YAML configuration file."""
    try:
        import yaml
        with open(config_path, "r") as f:
            return yaml.safe_load(f) or {}
    except FileNotFoundError:
        return {}
    except Exception as e:
        logging.error(f"Failed to load config {config_path}: {e}")
        return {}


def get_env(key: str, default: Any = None, cast: type = str) -> Any:
    """Get environment variable with type casting."""
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
        while True:
            self._refill()
            if self._tokens >= 1.0:
                self._tokens -= 1.0
                return True
            wait = (1.0 - self._tokens) / self.rate
            await asyncio.sleep(wait)
