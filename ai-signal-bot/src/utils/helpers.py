"""Utility functions — logging, config loading, time helpers, formatting."""

from __future__ import annotations

import os
import time
from typing import Any  # Any: env var defaults may be str|int|float|bool

from src.observability.logging import get_logger

logger = get_logger(__name__)


def load_config(config_path: str = "config/settings.yaml") -> dict:
    """Load YAML configuration file."""
    try:
        import yaml
        with open(config_path) as f:
            return yaml.safe_load(f) or {}
    except FileNotFoundError:
        logger.warning("Config file not found: %s — returning empty dict", config_path)
        return {}
    except (OSError, ValueError, TypeError) as e:
        logger.error("Failed to load config %s: %s", config_path, e)
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


async def retry_with_backoff(
    coro_fn,
    *args,
    max_retries: int = 3,
    initial_delay: float = 1.0,
    max_delay: float = 30.0,
    exceptions: tuple = (OSError, RuntimeError, ConnectionError, TimeoutError),
    **kwargs,
):
    """Retry an async callable with exponential backoff.

    Args:
        coro_fn: Async callable to retry.
        max_retries: Maximum number of retry attempts.
        initial_delay: Initial delay in seconds.
        max_delay: Maximum delay cap in seconds.
        exceptions: Tuple of exception types to catch and retry on.

    Returns:
        The result of coro_fn(*args, **kwargs).

    Raises:
        The last exception if all retries are exhausted.
    """
    import asyncio

    delay = initial_delay
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            return await coro_fn(*args, **kwargs)
        except exceptions as e:
            last_exc = e
            if attempt >= max_retries:
                break
            await asyncio.sleep(delay)
            delay = min(delay * 2, max_delay)
    raise last_exc  # type: ignore[misc]
