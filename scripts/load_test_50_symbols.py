"""Load testing script for 50+ symbols.

Tests system performance with expanded symbol set.
"""
import time
import statistics
from pathlib import Path
import sys

# Add exchange_simulator to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from exchange_simulator.exchange import SimulatedExchange
from exchange_simulator.market_simulator import MarketSimulator
from exchange_simulator.models import Side, OrderType

# 50+ symbols for testing
SYMBOLS = [
    'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT',
    'ADA/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT', 'SHIB/USDT',
    'AVAX/USDT', 'LINK/USDT', 'UNI/USDT', 'ATOM/USDT', 'LTC/USDT',
    'NEAR/USDT', 'XLM/USDT', 'ALGO/USDT', 'VET/USDT', 'FIL/USDT',
    'APT/USDT', 'INJ/USDT', 'OP/USDT', 'ARB/USDT', 'QNT/USDT',
    'ETC/USDT', 'HBAR/USDT', 'ICP/USDT', 'LDO/USDT', 'GRT/USDT',
    'STX/USDT', 'AAVE/USDT', 'MKR/USDT', 'COMP/USDT', 'SUSHI/USDT',
    'CRV/USDT', '1INCH/USDT', 'SNX/USDT', 'MANA/USDT', 'SAND/USDT',
    'AXS/USDT', 'ENJ/USDT', 'FTM/USDT', 'CRO/USDT', 'GLM/USDT',
    'KAVA/USDT', 'ROSE/USDT', 'CELO/USDT', 'MINA/USDT'
]

EXCHANGES = ['binance', 'bybit', 'okx']


def test_order_submission_latency():
    """Test order submission latency with 50+ symbols."""
    print("=" * 60)
    print("Order Submission Latency Test (50+ Symbols)")
    print("=" * 60)
    
    # Create market simulator with 50+ symbols
    market = MarketSimulator(
        symbols=SYMBOLS,
        exchanges=EXCHANGES,
        initial_prices={s: 100.0 for s in SYMBOLS},
        volatility={s: 0.8 for s in SYMBOLS},
    )
    
    # Create exchange
    exchange = SimulatedExchange(
        exchange_id="binance",
        name="Binance",
        fee_pct=0.04,
        slippage_bps=2.0,
        market=market,
        initial_balance=10000.0,
        leverage=10,
    )
    
    print(f"Testing with {len(SYMBOLS)} symbols")
    
    latencies = []
    
    # Submit orders for each symbol
    for symbol in SYMBOLS[:50]:  # Test first 50 symbols
        start = time.perf_counter()
        
        order = exchange.submit_order(
            symbol=symbol,
            side=Side.BUY,
            quantity=0.1,
            order_type=OrderType.MARKET,
        )
        
        end = time.perf_counter()
        latency_ms = (end - start) * 1000
        latencies.append(latency_ms)
    
    # Calculate statistics
    avg_latency = statistics.mean(latencies)
    median_latency = statistics.median(latencies)
    max_latency = max(latencies)
    min_latency = min(latencies)
    p95_latency = statistics.quantiles(latencies, n=20)[18] if len(latencies) >= 20 else max(latencies)
    
    print("\nResults:")
    print(f"  Average latency: {avg_latency:.3f} ms")
    print(f"  Median latency: {median_latency:.3f} ms")
    print(f"  Min latency: {min_latency:.3f} ms")
    print(f"  Max latency: {max_latency:.3f} ms")
    print(f"  95th percentile: {p95_latency:.3f} ms")
    
    # Check if latency is acceptable (< 50ms target)
    if avg_latency < 50:
        print(f"✓ PASS: Average latency {avg_latency:.3f} ms < 50 ms")
        return True
    else:
        print(f"✗ FAIL: Average latency {avg_latency:.3f} ms >= 50 ms")
        return False


def test_price_update_latency():
    """Test price update latency with 50+ symbols."""
    print("\n" + "=" * 60)
    print("Price Update Latency Test (50+ Symbols)")
    print("=" * 60)
    
    market = MarketSimulator(
        symbols=SYMBOLS,
        exchanges=EXCHANGES,
        initial_prices={s: 100.0 for s in SYMBOLS},
        volatility={s: 0.8 for s in SYMBOLS},
    )
    
    exchange = SimulatedExchange(
        exchange_id="binance",
        name="Binance",
        fee_pct=0.04,
        slippage_bps=2.0,
        market=market,
        initial_balance=10000.0,
        leverage=10,
    )
    
    print(f"Testing with {len(SYMBOLS)} symbols")
    
    latencies = []
    
    # Get prices for each symbol
    for symbol in SYMBOLS[:50]:
        start = time.perf_counter()
        
        price = exchange.get_price(symbol)
        
        end = time.perf_counter()
        latency_ms = (end - start) * 1000
        latencies.append(latency_ms)
    
    # Calculate statistics
    avg_latency = statistics.mean(latencies)
    median_latency = statistics.median(latencies)
    max_latency = max(latencies)
    min_latency = min(latencies)
    
    print("\nResults:")
    print(f"  Average latency: {avg_latency:.3f} ms")
    print(f"  Median latency: {median_latency:.3f} ms")
    print(f"  Min latency: {min_latency:.3f} ms")
    print(f"  Max latency: {max_latency:.3f} ms")
    
    # Check if latency is acceptable (< 10ms target)
    if avg_latency < 10:
        print(f"✓ PASS: Average latency {avg_latency:.3f} ms < 10 ms")
        return True
    else:
        print(f"✗ FAIL: Average latency {avg_latency:.3f} ms >= 10 ms")
        return False


def test_order_book_latency():
    """Test order book retrieval latency with 50+ symbols."""
    print("\n" + "=" * 60)
    print("Order Book Latency Test (50+ Symbols)")
    print("=" * 60)
    
    market = MarketSimulator(
        symbols=SYMBOLS,
        exchanges=EXCHANGES,
        initial_prices={s: 100.0 for s in SYMBOLS},
        volatility={s: 0.8 for s in SYMBOLS},
    )
    
    exchange = SimulatedExchange(
        exchange_id="binance",
        name="Binance",
        fee_pct=0.04,
        slippage_bps=2.0,
        market=market,
        initial_balance=10000.0,
        leverage=10,
    )
    
    print(f"Testing with {len(SYMBOLS)} symbols")
    
    latencies = []
    
    # Get order books for each symbol
    for symbol in SYMBOLS[:50]:
        start = time.perf_counter()
        
        order_book = exchange.get_order_book(symbol)
        
        end = time.perf_counter()
        latency_ms = (end - start) * 1000
        latencies.append(latency_ms)
    
    # Calculate statistics
    avg_latency = statistics.mean(latencies)
    median_latency = statistics.median(latencies)
    max_latency = max(latencies)
    min_latency = min(latencies)
    
    print("\nResults:")
    print(f"  Average latency: {avg_latency:.3f} ms")
    print(f"  Median latency: {median_latency:.3f} ms")
    print(f"  Min latency: {min_latency:.3f} ms")
    print(f"  Max latency: {max_latency:.3f} ms")
    
    # Check if latency is acceptable (< 20ms target)
    if avg_latency < 20:
        print(f"✓ PASS: Average latency {avg_latency:.3f} ms < 20 ms")
        return True
    else:
        print(f"✗ FAIL: Average latency {avg_latency:.3f} ms >= 20 ms")
        return False


def test_concurrent_operations():
    """Test concurrent operations with 50+ symbols."""
    print("\n" + "=" * 60)
    print("Concurrent Operations Test (50+ Symbols)")
    print("=" * 60)
    
    market = MarketSimulator(
        symbols=SYMBOLS,
        exchanges=EXCHANGES,
        initial_prices={s: 100.0 for s in SYMBOLS},
        volatility={s: 0.8 for s in SYMBOLS},
    )
    
    exchange = SimulatedExchange(
        exchange_id="binance",
        name="Binance",
        fee_pct=0.04,
        slippage_bps=2.0,
        market=market,
        initial_balance=10000.0,
        leverage=10,
    )
    
    print(f"Testing with {len(SYMBOLS)} symbols")
    
    # Simulate concurrent operations
    start = time.perf_counter()
    
    # Submit orders for multiple symbols
    for i, symbol in enumerate(SYMBOLS[:50]):
        side = Side.BUY if i % 2 == 0 else Side.SELL
        exchange.submit_order(
            symbol=symbol,
            side=side,
            quantity=0.1,
            order_type=OrderType.MARKET,
        )
    
    # Get prices for all symbols
    for symbol in SYMBOLS[:50]:
        exchange.get_price(symbol)
    
    # Get order books for all symbols
    for symbol in SYMBOLS[:50]:
        exchange.get_order_book(symbol)
    
    end = time.perf_counter()
    total_time = end - start
    
    print("\nResults:")
    print("  Total operations: 150 (50 orders + 50 prices + 50 order books)")
    print(f"  Total time: {total_time:.3f} s")
    print(f"  Average per operation: {(total_time / 150) * 1000:.3f} ms")
    
    # Check if throughput is acceptable
    ops_per_second = 150 / total_time
    if ops_per_second > 100:
        print(f"✓ PASS: {ops_per_second:.1f} ops/sec > 100 ops/sec")
        return True
    else:
        print(f"✗ FAIL: {ops_per_second:.1f} ops/sec <= 100 ops/sec")
        return False


def test_memory_usage():
    """Test memory usage with 50+ symbols."""
    print("\n" + "=" * 60)
    print("Memory Usage Test (50+ Symbols)")
    print("=" * 60)
    
    import psutil
    import os
    
    process = psutil.Process(os.getpid())
    
    # Get initial memory
    initial_mem = process.memory_info().rss / 1024 / 1024  # MB
    
    market = MarketSimulator(
        symbols=SYMBOLS,
        exchanges=EXCHANGES,
        initial_prices={s: 100.0 for s in SYMBOLS},
        volatility={s: 0.8 for s in SYMBOLS},
    )
    
    exchange = SimulatedExchange(
        exchange_id="binance",
        name="Binance",
        fee_pct=0.04,
        slippage_bps=2.0,
        market=market,
        initial_balance=10000.0,
        leverage=10,
    )
    
    print(f"Testing with {len(SYMBOLS)} symbols")
    
    # Perform operations
    for symbol in SYMBOLS[:50]:
        exchange.submit_order(
            symbol=symbol,
            side=Side.BUY,
            quantity=0.1,
            order_type=OrderType.MARKET,
        )
        exchange.get_price(symbol)
        exchange.get_order_book(symbol)
    
    # Get final memory
    final_mem = process.memory_info().rss / 1024 / 1024  # MB
    mem_increase = final_mem - initial_mem
    
    print("\nResults:")
    print(f"  Initial memory: {initial_mem:.2f} MB")
    print(f"  Final memory: {final_mem:.2f} MB")
    print(f"  Memory increase: {mem_increase:.2f} MB")
    print(f"  Memory per symbol: {mem_increase / 50:.2f} MB")
    
    # Check if memory usage is acceptable (< 100 MB increase)
    if mem_increase < 100:
        print(f"✓ PASS: Memory increase {mem_increase:.2f} MB < 100 MB")
        return True
    else:
        print(f"✗ FAIL: Memory increase {mem_increase:.2f} MB >= 100 MB")
        return False


def main():
    """Run all load tests."""
    print("\n" + "=" * 60)
    print("Load Testing with 50+ Symbols")
    print("=" * 60)
    print()
    
    tests = [
        ("Order Submission Latency", test_order_submission_latency),
        ("Price Update Latency", test_price_update_latency),
        ("Order Book Latency", test_order_book_latency),
        ("Concurrent Operations", test_concurrent_operations),
        ("Memory Usage", test_memory_usage),
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except (OSError, RuntimeError, ValueError, TypeError, KeyError) as e:
            print(f"ERROR: {e}")
            results.append((test_name, False))
    
    print("\n" + "=" * 60)
    print("Load Test Summary")
    print("=" * 60)
    
    for test_name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {test_name}")
    
    all_passed = all(result for _, result in results)
    
    print()
    if all_passed:
        print("All load tests passed!")
        return 0
    else:
        print("Some load tests failed!")
        return 1


if __name__ == "__main__":
    exit(main())
