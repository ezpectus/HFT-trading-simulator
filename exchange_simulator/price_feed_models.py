"""Data models and utilities for price feed management.

Extracted from price_feed_manager.py for file-size compliance.
Contains APIStatus, PriceTick, APIHealth, PerformanceMetrics, and time_operation decorator.
"""
import asyncio
import functools
import logging
import statistics
import time
from collections import defaultdict, deque
from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger("exchange_simulator.price_feed")


class APIStatus(Enum):
    """Status of an API connection."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"
    RATE_LIMITED = "rate_limited"


@dataclass
class PriceTick:
    """Normalized price tick from any exchange."""
    symbol: str
    price: float
    timestamp: float
    exchange: str
    volume: float = 0.0
    bid: float = 0.0
    ask: float = 0.0


@dataclass
class APIHealth:
    """Health status of an API endpoint."""
    status: APIStatus
    last_success: float
    last_error: str | None = None
    error_count: int = 0
    consecutive_failures: int = 0


class PerformanceMetrics:
    """Tracks performance metrics for price feed operations."""

    def __init__(self):
        self.fetch_latencies: deque[float] = deque(maxlen=10000)
        self.parse_latencies: deque[float] = deque(maxlen=10000)
        self.cache_hits: int = 0
        self.cache_misses: int = 0
        self.failover_count: int = 0
        self.api_errors: dict[str, int] = defaultdict(int)
        self._max_samples: int = 10000

    def record_fetch_latency(self, latency_ms: float) -> None:
        """Record a fetch operation latency."""
        self.fetch_latencies.append(latency_ms)

    def record_parse_latency(self, latency_ms: float) -> None:
        """Record a parse operation latency."""
        self.parse_latencies.append(latency_ms)

    def record_cache_hit(self) -> None:
        """Record a cache hit."""
        self.cache_hits += 1

    def record_cache_miss(self) -> None:
        """Record a cache miss."""
        self.cache_misses += 1

    def record_failover(self) -> None:
        """Record a failover event."""
        self.failover_count += 1

    def record_api_error(self, api_name: str) -> None:
        """Record an API error."""
        self.api_errors[api_name] += 1

    def get_fetch_p50(self) -> float:
        """Get p50 fetch latency in milliseconds."""
        if not self.fetch_latencies:
            return 0.0
        return statistics.median(self.fetch_latencies)

    def get_fetch_p95(self) -> float:
        """Get p95 fetch latency in milliseconds."""
        if not self.fetch_latencies:
            return 0.0
        sorted_latencies = sorted(self.fetch_latencies)
        idx = int(len(sorted_latencies) * 0.95)
        return sorted_latencies[min(idx, len(sorted_latencies) - 1)]

    def get_fetch_p99(self) -> float:
        """Get p99 fetch latency in milliseconds."""
        if not self.fetch_latencies:
            return 0.0
        sorted_latencies = sorted(self.fetch_latencies)
        idx = int(len(sorted_latencies) * 0.99)
        return sorted_latencies[min(idx, len(sorted_latencies) - 1)]

    def get_parse_p50(self) -> float:
        """Get p50 parse latency in milliseconds."""
        if not self.parse_latencies:
            return 0.0
        return statistics.median(self.parse_latencies)

    def get_parse_p95(self) -> float:
        """Get p95 parse latency in milliseconds."""
        if not self.parse_latencies:
            return 0.0
        sorted_latencies = sorted(self.parse_latencies)
        idx = int(len(sorted_latencies) * 0.95)
        return sorted_latencies[min(idx, len(sorted_latencies) - 1)]

    def get_parse_p99(self) -> float:
        """Get p99 parse latency in milliseconds."""
        if not self.parse_latencies:
            return 0.0
        sorted_latencies = sorted(self.parse_latencies)
        idx = int(len(sorted_latencies) * 0.99)
        return sorted_latencies[min(idx, len(sorted_latencies) - 1)]

    def get_cache_hit_rate(self) -> float:
        """Get cache hit rate as a percentage."""
        total = self.cache_hits + self.cache_misses
        if total == 0:
            return 0.0
        return (self.cache_hits / total) * 100.0

    def get_metrics(self) -> dict:
        """Get all performance metrics as a dictionary."""
        return {
            "fetch_latencies": {
                "p50_ms": self.get_fetch_p50(),
                "p95_ms": self.get_fetch_p95(),
                "p99_ms": self.get_fetch_p99(),
                "count": len(self.fetch_latencies),
            },
            "parse_latencies": {
                "p50_ms": self.get_parse_p50(),
                "p95_ms": self.get_parse_p95(),
                "p99_ms": self.get_parse_p99(),
                "count": len(self.parse_latencies),
            },
            "cache": {
                "hit_rate_pct": self.get_cache_hit_rate(),
                "hits": self.cache_hits,
                "misses": self.cache_misses,
            },
            "failover_count": self.failover_count,
            "api_errors": dict(self.api_errors),
        }

    def reset(self) -> None:
        """Reset all metrics."""
        self.fetch_latencies.clear()
        self.parse_latencies.clear()
        self.cache_hits = 0
        self.cache_misses = 0
        self.failover_count = 0
        self.api_errors.clear()


def time_operation(operation_name: str, metrics: PerformanceMetrics) -> Callable:
    """Decorator to time operations and record latency."""

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            start_time = time.perf_counter()
            try:
                result = await func(*args, **kwargs)
                latency_ms = (time.perf_counter() - start_time) * 1000
                if "fetch" in operation_name.lower():
                    metrics.record_fetch_latency(latency_ms)
                elif "parse" in operation_name.lower():
                    metrics.record_parse_latency(latency_ms)
                return result
            except (OSError, RuntimeError, KeyError, ValueError, TypeError) as e:
                latency_ms = (time.perf_counter() - start_time) * 1000
                logger.error(f"{operation_name} failed after {latency_ms:.2f}ms: {e}")
                raise

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            start_time = time.perf_counter()
            try:
                result = func(*args, **kwargs)
                latency_ms = (time.perf_counter() - start_time) * 1000
                if "fetch" in operation_name.lower():
                    metrics.record_fetch_latency(latency_ms)
                elif "parse" in operation_name.lower():
                    metrics.record_parse_latency(latency_ms)
                return result
            except (OSError, RuntimeError, KeyError, ValueError, TypeError) as e:
                latency_ms = (time.perf_counter() - start_time) * 1000
                logger.error(f"{operation_name} failed after {latency_ms:.2f}ms: {e}")
                raise

        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper

    return decorator
