"""Performance tests for price feed manager.

Tests validate that the optimizations achieve the target metrics:
- p95 latency < 50ms
- Batch fetch 2-3x faster than individual fetches
- Cache hit rate > 95%
"""

import asyncio
import statistics
import time
from typing import List

import pytest

from exchange_simulator.price_feed_manager import (
    PerformanceMetrics,
    PriceFeedManager,
    PriceTick,
)


@pytest.mark.asyncio
async def test_price_feed_latency():
    """Test that price feed latency meets target (p95 < 50ms)."""
    symbols = ["BTC/USDT", "ETH/USDT", "SOL/USDT"]
    config = {
        "cache_ttl": 5.0,
        "connection_pool_size": 100,
        "connection_timeout": 30,
        "cache_max_size": 1000,
        "cache_warm_on_startup": False,
        "use_msgpack_cache": False,
    }

    manager = PriceFeedManager(
        symbols=symbols,
        enable_websocket=False,
        enable_profiling=True,
        config=config,
    )

    latencies = []
    iterations = 20

    try:
        for _ in range(iterations):
            start = time.perf_counter()
            tick = await manager.get_price("BTC/USDT")
            end = time.perf_counter()

            if tick:
                latencies.append((end - start) * 1000)  # Convert to ms

        # Calculate p95 latency
        sorted_latencies = sorted(latencies)
        p95_idx = int(len(sorted_latencies) * 0.95)
        p95_latency = sorted_latencies[min(p95_idx, len(sorted_latencies) - 1)]

        print(f"p95 latency: {p95_latency:.2f}ms")
        print(f"Average latency: {statistics.mean(latencies):.2f}ms")

        # Target: p95 < 50ms
        assert p95_latency < 50.0, f"p95 latency {p95_latency:.2f}ms exceeds target of 50ms"

    finally:
        await manager.close()


@pytest.mark.asyncio
async def test_batch_fetch_performance():
    """Test that batch fetch is faster than individual fetches."""
    symbols = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT"]
    config = {
        "cache_ttl": 5.0,
        "connection_pool_size": 100,
        "connection_timeout": 30,
        "cache_max_size": 1000,
        "cache_warm_on_startup": False,
        "use_msgpack_cache": False,
    }

    manager = PriceFeedManager(
        symbols=symbols,
        enable_websocket=False,
        enable_profiling=False,
        config=config,
    )

    try:
        # Measure individual fetch time
        start_individual = time.perf_counter()
        for symbol in symbols:
            await manager.get_price(symbol)
        end_individual = time.perf_counter()
        individual_time = (end_individual - start_individual) * 1000

        # Measure batch fetch time
        start_batch = time.perf_counter()
        await manager.get_all_prices()
        end_batch = time.perf_counter()
        batch_time = (end_batch - start_batch) * 1000

        speedup = individual_time / batch_time if batch_time > 0 else 0

        print(f"Individual fetch time: {individual_time:.2f}ms")
        print(f"Batch fetch time: {batch_time:.2f}ms")
        print(f"Speedup: {speedup:.2f}x")

        # Target: batch fetch should be at least 2x faster
        assert speedup >= 2.0, f"Batch fetch speedup {speedup:.2f}x below target of 2x"

    finally:
        await manager.close()


@pytest.mark.asyncio
async def test_cache_hit_rate():
    """Test that cache hit rate exceeds 95%."""
    symbols = ["BTC/USDT", "ETH/USDT", "SOL/USDT"]
    config = {
        "cache_ttl": 5.0,
        "connection_pool_size": 100,
        "connection_timeout": 30,
        "cache_max_size": 1000,
        "cache_warm_on_startup": False,
        "use_msgpack_cache": False,
    }

    manager = PriceFeedManager(
        symbols=symbols,
        enable_websocket=False,
        enable_profiling=True,
        config=config,
    )

    try:
        # Initial fetch to populate cache
        await manager.get_price("BTC/USDT")

        # Subsequent fetches should hit cache
        iterations = 50
        for _ in range(iterations):
            await manager.get_price("BTC/USDT")

        metrics = manager.get_metrics()
        if metrics:
            hit_rate = metrics["cache"]["hit_rate_pct"]
            print(f"Cache hit rate: {hit_rate:.2f}%")

            # Target: hit rate > 95%
            assert hit_rate > 95.0, f"Cache hit rate {hit_rate:.2f}% below target of 95%"

    finally:
        await manager.close()


@pytest.mark.asyncio
async def test_connection_pool_stats():
    """Test that connection pool statistics are available."""
    symbols = ["BTC/USDT", "ETH/USDT"]
    config = {
        "cache_ttl": 5.0,
        "connection_pool_size": 100,
        "connection_timeout": 30,
        "cache_max_size": 1000,
        "cache_warm_on_startup": False,
        "use_msgpack_cache": False,
    }

    manager = PriceFeedManager(
        symbols=symbols,
        enable_websocket=False,
        enable_profiling=False,
        config=config,
    )

    try:
        # Make some requests to populate connection pool
        await manager.get_price("BTC/USDT")

        stats = manager.get_connection_pool_stats()
        print(f"Connection pool stats: {stats}")

        # Verify stats are available
        assert "binance" in stats or "coinbase" in stats

    finally:
        await manager.close()


@pytest.mark.asyncio
async def test_cache_stats():
    """Test that cache statistics are available."""
    symbols = ["BTC/USDT", "ETH/USDT"]
    config = {
        "cache_ttl": 5.0,
        "connection_pool_size": 100,
        "connection_timeout": 30,
        "cache_max_size": 1000,
        "cache_warm_on_startup": False,
        "use_msgpack_cache": False,
    }

    manager = PriceFeedManager(
        symbols=symbols,
        enable_websocket=False,
        enable_profiling=True,
        config=config,
    )

    try:
        # Populate cache
        await manager.get_price("BTC/USDT")

        stats = manager.get_cache_stats()
        print(f"Cache stats: {stats}")

        # Verify stats are available
        assert "size" in stats
        assert "max_size" in stats
        assert "ttl" in stats

    finally:
        await manager.close()


@pytest.mark.asyncio
async def test_msgpack_serialization():
    """Test that msgpack serialization works correctly."""
    symbols = ["BTC/USDT"]
    config = {
        "cache_ttl": 5.0,
        "connection_pool_size": 100,
        "connection_timeout": 30,
        "cache_max_size": 1000,
        "cache_warm_on_startup": False,
        "use_msgpack": True,
    }

    manager = PriceFeedManager(
        symbols=symbols,
        enable_websocket=False,
        enable_profiling=False,
        config=config,
    )

    try:
        # Create a test price tick
        tick = PriceTick(
            symbol="BTC/USDT",
            price=65000.0,
            timestamp=time.time(),
            exchange="binance",
            volume=100.0,
            bid=64999.0,
            ask=65001.0,
        )

        # Test serialization and deserialization
        serialized = manager._serialize_price_tick(tick)
        retrieved = manager._deserialize_price_tick(serialized)

        assert retrieved is not None
        assert retrieved.symbol == tick.symbol
        assert retrieved.price == tick.price
        assert retrieved.exchange == tick.exchange

        print("Msgpack serialization test passed")

    finally:
        await manager.close()


@pytest.mark.asyncio
async def test_cache_warming():
    """Test that cache warming works correctly."""
    symbols = ["BTC/USDT", "ETH/USDT", "SOL/USDT"]
    config = {
        "cache_ttl": 5.0,
        "connection_pool_size": 100,
        "connection_timeout": 30,
        "cache_max_size": 1000,
        "cache_warm_on_startup": False,
        "use_msgpack_cache": False,
    }

    manager = PriceFeedManager(
        symbols=symbols,
        enable_websocket=False,
        enable_profiling=True,
        config=config,
    )

    try:
        # Warm cache
        await manager.warm_cache(symbols)

        # Check that cache is populated
        stats = manager.get_cache_stats()
        print(f"Cache stats after warming: {stats}")

        # Verify cache has entries
        assert stats["size"] > 0, "Cache should be populated after warming"

    finally:
        await manager.close()


@pytest.mark.asyncio
async def test_performance_metrics():
    """Test that performance metrics are collected correctly."""
    symbols = ["BTC/USDT"]
    config = {
        "cache_ttl": 5.0,
        "connection_pool_size": 100,
        "connection_timeout": 30,
        "cache_max_size": 1000,
        "cache_warm_on_startup": False,
        "use_msgpack_cache": False,
    }

    manager = PriceFeedManager(
        symbols=symbols,
        enable_websocket=False,
        enable_profiling=True,
        config=config,
    )

    try:
        # Make some requests
        for _ in range(10):
            await manager.get_price("BTC/USDT")

        metrics = manager.get_metrics()
        print(f"Performance metrics: {metrics}")

        # Verify metrics are available
        assert metrics is not None
        assert "fetch_latencies" in metrics
        assert "cache" in metrics

    finally:
        await manager.close()


if __name__ == "__main__":
    # Run tests manually for debugging
    asyncio.run(test_price_feed_latency())
    asyncio.run(test_batch_fetch_performance())
    asyncio.run(test_cache_hit_rate())
    asyncio.run(test_connection_pool_stats())
    asyncio.run(test_cache_stats())
    asyncio.run(test_msgpack_serialization())
    asyncio.run(test_cache_warming())
    asyncio.run(test_performance_metrics())
    print("All performance tests passed!")
