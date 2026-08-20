"""Unit tests for exchange_simulator/price_feed_models.py — PriceTick, APIHealth, PerformanceMetrics."""

import asyncio

import pytest

from exchange_simulator.price_feed_models import (
    APIHealth,
    APIStatus,
    PerformanceMetrics,
    PriceTick,
    time_operation,
)

# ─── PriceTick ───


def test_price_tick_creation() -> None:
    """PriceTick should be created with required fields."""
    tick = PriceTick(symbol="BTC/USDT", price=50000.0, timestamp=1234567890.0, exchange="binance")
    assert tick.symbol == "BTC/USDT"
    assert tick.price == 50000.0
    assert tick.exchange == "binance"
    assert tick.volume == 0.0
    assert tick.bid == 0.0
    assert tick.ask == 0.0


def test_price_tick_with_optional_fields() -> None:
    """PriceTick should accept optional fields."""
    tick = PriceTick(
        symbol="ETH/USDT", price=3000.0, timestamp=1234567890.0, exchange="coinbase",
        volume=100.5, bid=2999.0, ask=3001.0,
    )
    assert tick.volume == 100.5
    assert tick.bid == 2999.0
    assert tick.ask == 3001.0


# ─── APIStatus ───


def test_api_status_values() -> None:
    """APIStatus enum should have expected values."""
    assert APIStatus.HEALTHY.value == "healthy"
    assert APIStatus.DEGRADED.value == "degraded"
    assert APIStatus.DOWN.value == "down"
    assert APIStatus.RATE_LIMITED.value == "rate_limited"


# ─── APIHealth ───


def test_api_health_creation() -> None:
    """APIHealth should be created with status and last_success."""
    health = APIHealth(status=APIStatus.HEALTHY, last_success=1234567890.0)
    assert health.status == APIStatus.HEALTHY
    assert health.last_error is None
    assert health.error_count == 0
    assert health.consecutive_failures == 0


def test_api_health_with_error() -> None:
    """APIHealth should accept error fields."""
    health = APIHealth(
        status=APIStatus.DEGRADED, last_success=1234567890.0,
        last_error="timeout", error_count=3, consecutive_failures=2,
    )
    assert health.last_error == "timeout"
    assert health.error_count == 3
    assert health.consecutive_failures == 2


# ─── PerformanceMetrics ───


@pytest.fixture
def metrics() -> PerformanceMetrics:
    return PerformanceMetrics()


def test_metrics_empty_p50(metrics: PerformanceMetrics) -> None:
    """Empty metrics should return 0.0 for p50."""
    assert metrics.get_fetch_p50() == 0.0
    assert metrics.get_parse_p50() == 0.0


def test_metrics_empty_p95(metrics: PerformanceMetrics) -> None:
    """Empty metrics should return 0.0 for p95."""
    assert metrics.get_fetch_p95() == 0.0
    assert metrics.get_parse_p95() == 0.0


def test_metrics_empty_p99(metrics: PerformanceMetrics) -> None:
    """Empty metrics should return 0.0 for p99."""
    assert metrics.get_fetch_p99() == 0.0
    assert metrics.get_parse_p99() == 0.0


def test_record_fetch_latency(metrics: PerformanceMetrics) -> None:
    """record_fetch_latency should store values."""
    metrics.record_fetch_latency(10.0)
    metrics.record_fetch_latency(20.0)
    metrics.record_fetch_latency(30.0)
    assert len(metrics.fetch_latencies) == 3
    assert metrics.get_fetch_p50() == 20.0


def test_record_parse_latency(metrics: PerformanceMetrics) -> None:
    """record_parse_latency should store values."""
    metrics.record_parse_latency(5.0)
    metrics.record_parse_latency(15.0)
    assert len(metrics.parse_latencies) == 2
    assert metrics.get_parse_p50() == 10.0


def test_cache_hit_rate_empty(metrics: PerformanceMetrics) -> None:
    """Empty cache should return 0.0 hit rate."""
    assert metrics.get_cache_hit_rate() == 0.0


def test_cache_hit_rate_all_hits(metrics: PerformanceMetrics) -> None:
    """All hits should return 100.0."""
    for _ in range(10):
        metrics.record_cache_hit()
    assert metrics.get_cache_hit_rate() == 100.0


def test_cache_hit_rate_mixed(metrics: PerformanceMetrics) -> None:
    """Mixed hits/misses should return correct rate."""
    for _ in range(7):
        metrics.record_cache_hit()
    for _ in range(3):
        metrics.record_cache_miss()
    assert metrics.get_cache_hit_rate() == 70.0


def test_record_failover(metrics: PerformanceMetrics) -> None:
    """record_failover should increment count."""
    metrics.record_failover()
    metrics.record_failover()
    assert metrics.failover_count == 2


def test_record_api_error(metrics: PerformanceMetrics) -> None:
    """record_api_error should track per-API errors."""
    metrics.record_api_error("binance")
    metrics.record_api_error("binance")
    metrics.record_api_error("coinbase")
    assert metrics.api_errors["binance"] == 2
    assert metrics.api_errors["coinbase"] == 1


def test_get_metrics_dict(metrics: PerformanceMetrics) -> None:
    """get_metrics should return dict with all keys."""
    metrics.record_fetch_latency(10.0)
    metrics.record_parse_latency(5.0)
    metrics.record_cache_hit()
    result = metrics.get_metrics()
    assert "fetch_latencies" in result
    assert "parse_latencies" in result
    assert "cache" in result
    assert "failover_count" in result
    assert "api_errors" in result
    assert result["fetch_latencies"]["count"] == 1
    assert result["cache"]["hits"] == 1


def test_reset(metrics: PerformanceMetrics) -> None:
    """reset should clear all metrics."""
    metrics.record_fetch_latency(10.0)
    metrics.record_parse_latency(5.0)
    metrics.record_cache_hit()
    metrics.record_failover()
    metrics.record_api_error("binance")
    metrics.reset()
    assert len(metrics.fetch_latencies) == 0
    assert len(metrics.parse_latencies) == 0
    assert metrics.cache_hits == 0
    assert metrics.cache_misses == 0
    assert metrics.failover_count == 0
    assert len(metrics.api_errors) == 0


def test_fetch_p95_with_data(metrics: PerformanceMetrics) -> None:
    """p95 should return correct percentile."""
    for i in range(1, 101):
        metrics.record_fetch_latency(float(i))
    p95 = metrics.get_fetch_p95()
    assert 90.0 <= p95 <= 100.0


def test_fetch_p99_with_data(metrics: PerformanceMetrics) -> None:
    """p99 should return correct percentile."""
    for i in range(1, 101):
        metrics.record_fetch_latency(float(i))
    p99 = metrics.get_fetch_p99()
    assert 95.0 <= p99 <= 100.0


# ─── time_operation decorator ───


def test_time_operation_sync(metrics: PerformanceMetrics) -> None:
    """time_operation should time synchronous functions."""

    @time_operation("fetch_price", metrics)
    def fetch_price(symbol: str) -> float:
        return 50000.0

    result = fetch_price("BTC/USDT")
    assert result == 50000.0
    assert len(metrics.fetch_latencies) == 1
    assert metrics.fetch_latencies[0] >= 0.0


def test_time_operation_parse(metrics: PerformanceMetrics) -> None:
    """time_operation should route parse operations to parse_latencies."""

    @time_operation("parse_response", metrics)
    def parse_response(data: str) -> dict:
        return {"price": 50000.0}

    result = parse_response('{"price": 50000.0}')
    assert result == {"price": 50000.0}
    assert len(metrics.parse_latencies) == 1


@pytest.mark.asyncio
async def test_time_operation_async(metrics: PerformanceMetrics) -> None:
    """time_operation should time async functions."""

    @time_operation("fetch_async", metrics)
    async def fetch_async(symbol: str) -> float:
        await asyncio.sleep(0.001)
        return 50000.0

    result = await fetch_async("BTC/USDT")
    assert result == 50000.0
    assert len(metrics.fetch_latencies) == 1
