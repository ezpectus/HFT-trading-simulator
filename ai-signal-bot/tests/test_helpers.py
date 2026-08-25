"""Tests for utility helpers."""
import pytest
import asyncio
from src.utils.helpers import (
    get_env, now_ms, now_us, format_price, format_qty,
    format_percentage, safe_divide, clamp, truncate_dict, retry_with_backoff,
)


class TestHelpers:
    def test_get_env_default(self):
        assert get_env("NONEXISTENT_VAR", default="fallback") == "fallback"

    def test_get_env_cast_int(self, monkeypatch):
        monkeypatch.setenv("TEST_INT", "42")
        assert get_env("TEST_INT", cast=int) == 42

    def test_get_env_cast_bool(self, monkeypatch):
        monkeypatch.setenv("TEST_BOOL", "true")
        assert get_env("TEST_BOOL", cast=bool) is True
        monkeypatch.setenv("TEST_BOOL", "0")
        assert get_env("TEST_BOOL", cast=bool) is False

    def test_get_env_invalid_cast(self, monkeypatch):
        monkeypatch.setenv("TEST_INVALID", "abc")
        assert get_env("TEST_INVALID", default=0, cast=int) == 0

    def test_now_ms(self):
        ms = now_ms()
        assert isinstance(ms, int)
        assert ms > 0

    def test_now_us(self):
        us = now_us()
        assert isinstance(us, int)
        assert us > 0

    def test_format_price_high(self):
        assert format_price(65000) == "65,000.00"

    def test_format_price_medium(self):
        assert format_price(3.5) == "3.5000"

    def test_format_price_low(self):
        assert format_price(0.00001234) == "0.00001234"

    def test_format_qty_high(self):
        assert format_qty(1500) == "1,500.00"

    def test_format_qty_low(self):
        assert format_qty(0.001) == "0.00100000"

    def test_format_percentage(self):
        assert format_percentage(12.3456) == "12.35%"

    def test_safe_divide_normal(self):
        assert safe_divide(10, 2) == 5.0

    def test_safe_divide_zero(self):
        assert safe_divide(10, 0) == 0.0

    def test_safe_divide_custom_default(self):
        assert safe_divide(10, 0, default=-1) == -1

    def test_clamp_middle(self):
        assert clamp(5, 0, 10) == 5

    def test_clamp_below(self):
        assert clamp(-1, 0, 10) == 0

    def test_clamp_above(self):
        assert clamp(11, 0, 10) == 10

    def test_truncate_dict_small(self):
        d = {"a": 1, "b": 2}
        assert truncate_dict(d, max_items=10) == d

    def test_truncate_dict_large(self):
        d = {f"key_{i}": i for i in range(150)}
        result = truncate_dict(d, max_items=100)
        assert len(result) == 101  # 100 items + truncated marker
        assert "..._truncated" in result

    @pytest.mark.asyncio
    async def test_retry_with_backoff_success(self):
        call_count = 0
        async def succeed_on_third():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ConnectionError("fail")
            return "ok"

        result = await retry_with_backoff(
            succeed_on_third, max_retries=5, initial_delay=0.01,
            exceptions=(ConnectionError,),
        )
        assert result == "ok"
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_retry_with_backoff_exhausted(self):
        async def always_fail():
            raise ConnectionError("always fails")

        with pytest.raises(ConnectionError):
            await retry_with_backoff(
                always_fail, max_retries=2, initial_delay=0.01,
                exceptions=(ConnectionError,),
            )
