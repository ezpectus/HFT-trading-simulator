"""Unit tests for utility functions."""

import time

import pytest

from src.utils.helpers import (
    clamp,
    format_percentage,
    format_price,
    format_qty,
    now_ms,
    now_us,
    retry_with_backoff,
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
class TestRetryWithBackoff:
    async def test_succeeds_first_try(self):
        async def ok():
            return 42
        result = await retry_with_backoff(ok, max_retries=2)
        assert result == 42

    async def test_retries_on_failure(self):
        calls = 0
        async def flaky():
            nonlocal calls
            calls += 1
            if calls < 3:
                raise OSError("transient")
            return "ok"
        result = await retry_with_backoff(flaky, max_retries=3, initial_delay=0.01)
        assert result == "ok"
        assert calls == 3

    async def test_exhausts_retries(self):
        async def always_fail():
            raise RuntimeError("permanent")
        with pytest.raises(RuntimeError):
            await retry_with_backoff(always_fail, max_retries=1, initial_delay=0.01)
