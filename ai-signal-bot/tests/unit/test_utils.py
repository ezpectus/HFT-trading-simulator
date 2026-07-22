"""Unit tests for utility functions."""

import time

import pytest

from src.utils.helpers import (
    CircuitBreaker,
    RateLimiter,
    clamp,
    format_percentage,
    format_price,
    format_qty,
    now_ms,
    now_us,
    safe_divide,
    truncate_dict,
)


class TestFormatFunctions:
    def test_format_price_high(self):
        assert format_price(50000.0) == "50,000.00"

    def test_format_price_low(self):
        assert "0.5000" in format_price(0.5)

    def test_format_qty(self):
        assert format_qty(1500.0) == "1,500.00"

    def test_format_percentage(self):
        assert format_percentage(5.123) == "5.12%"


class TestMathUtils:
    def test_safe_divide_normal(self):
        assert safe_divide(10, 2) == 5.0

    def test_safe_divide_zero(self):
        assert safe_divide(10, 0) == 0.0

    def test_clamp(self):
        assert clamp(5, 0, 10) == 5
        assert clamp(-1, 0, 10) == 0
        assert clamp(15, 0, 10) == 10


class TestTimeUtils:
    def test_now_ms(self):
        t = now_ms()
        assert t > 1_000_000_000_000

    def test_now_us(self):
        t = now_us()
        assert t > 1_000_000_000_000_000


class TestCircuitBreaker:
    def test_starts_closed(self):
        cb = CircuitBreaker()
        assert cb.state == "closed"
        assert not cb.is_open

    def test_opens_after_failures(self):
        cb = CircuitBreaker(failure_threshold=3)
        cb.record_failure()
        cb.record_failure()
        assert not cb.is_open
        cb.record_failure()
        assert cb.is_open
        assert cb.state == "open"

    def test_recovers(self):
        cb = CircuitBreaker(failure_threshold=1, recovery_timeout=0.1)
        cb.record_failure()
        assert cb.is_open
        time.sleep(0.15)
        assert not cb.is_open
        cb.record_success()
        assert cb.state == "closed"


class TestTruncateDict:
    def test_small_dict(self):
        d = {"a": 1, "b": 2}
        assert truncate_dict(d, 10) == d

    def test_large_dict(self):
        d = {f"key_{i}": i for i in range(150)}
        result = truncate_dict(d, 100)
        assert len(result) == 101  # 100 + truncated marker
        assert "..._truncated" in result


@pytest.mark.asyncio
class TestRateLimiter:
    async def test_acquire(self):
        limiter = RateLimiter(rate=10, burst=2)
        assert await limiter.acquire()
        assert await limiter.acquire()
