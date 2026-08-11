"""
Stress test for the HFT Trading System.

Tests system behavior under extreme load conditions:
- High order submission rate
- Concurrent WebSocket connections
- Memory leak detection
- Resource exhaustion handling
"""

import asyncio
import time
import psutil
import statistics
from typing import List
import aiohttp

EXCHANGE_URL = "http://localhost:8765/api/v1"
WS_URL = "ws://localhost:8765"
SYMBOL = "BTC/USDT"


class StressTester:
    def __init__(self):
        self.order_count = 0
        self.error_count = 0
        self.latencies: List[float] = []
        self.start_memory = psutil.Process().memory_info().rss

    async def submit_order(self, session: aiohttp.ClientSession, order_id: int):
        """Submit a single order."""
        start = time.time()
        try:
            payload = {
                "symbol": SYMBOL,
                "side": "BUY" if order_id % 2 == 0 else "SELL",
                "order_type": "LIMIT",
                "quantity": 0.001,
                "price": 65000.0 + (order_id % 100),
                "time_in_force": "GTC"
            }
            async with session.post(f"{EXCHANGE_URL}/orders", json=payload) as resp:
                if resp.status == 200:
                    self.order_count += 1
                else:
                    self.error_count += 1
            latency = (time.time() - start) * 1000
            self.latencies.append(latency)
        except Exception as e:
            self.error_count += 1

    async def high_order_rate_test(self, duration: int = 60, target_rps: int = 100):
        """Test high order submission rate."""
        print(f"Running high order rate test: {target_rps} orders/second for {duration}s")
        
        interval = 1.0 / target_rps
        async with aiohttp.ClientSession() as session:
            start_time = time.time()
            order_id = 0
            
            while time.time() - start_time < duration:
                tasks = []
                # Submit burst of orders
                for _ in range(target_rps):
                    tasks.append(self.submit_order(session, order_id))
                    order_id += 1
                
                await asyncio.gather(*tasks)
                await asyncio.sleep(interval)
        
        self.print_results(f"High Order Rate ({target_rps} RPS)")

    async def concurrent_websocket_test(self, num_connections: int = 50):
        """Test concurrent WebSocket connections."""
        print(f"Running concurrent WebSocket test: {num_connections} connections")
        
        async def ws_connection(conn_id: int):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.ws_connect(WS_URL) as ws:
                        await ws.send_json({
                            "type": "subscribe",
                            "protocol_version": 2,
                            "encoding": "json"
                        })
                        
                        # Keep connection alive for 30 seconds
                        for _ in range(30):
                            msg = await ws.receive()
                            if msg.type == aiohttp.WSMsgType.ERROR:
                                break
                            await asyncio.sleep(1)
                        
                        return True
            except Exception as e:
                print(f"Connection {conn_id} failed: {e}")
                return False
        
        start = time.time()
        tasks = [ws_connection(i) for i in range(num_connections)]
        results = await asyncio.gather(*tasks)
        duration = time.time() - start
        
        successful = sum(1 for r in results if r)
        print(f"  Successful connections: {successful}/{num_connections}")
        print(f"  Time to establish: {duration:.2f}s")

    async def memory_leak_test(self, duration: int = 120):
        """Test for memory leaks over time."""
        print(f"Running memory leak test for {duration}s")
        
        process = psutil.Process()
        memory_samples = []
        
        async with aiohttp.ClientSession() as session:
            start_time = time.time()
            sample_interval = 10
            order_id = 0
            
            while time.time() - start_time < duration:
                # Submit orders to generate activity
                for _ in range(10):
                    await self.submit_order(session, order_id)
                    order_id += 1
                
                # Sample memory
                memory_mb = process.memory_info().rss / 1024 / 1024
                memory_samples.append(memory_mb)
                
                print(f"  Memory: {memory_mb:.2f}MB")
                await asyncio.sleep(sample_interval)
        
        # Analyze memory trend
        if len(memory_samples) >= 2:
            initial = memory_samples[0]
            final = memory_samples[-1]
            growth = final - initial
            growth_rate = growth / duration * 60  # MB per minute
            
            print(f"\nMemory Leak Analysis:")
            print(f"  Initial memory: {initial:.2f}MB")
            print(f"  Final memory: {final:.2f}MB")
            print(f"  Total growth: {growth:.2f}MB")
            print(f"  Growth rate: {growth_rate:.2f}MB/min")
            
            if growth_rate > 1.0:
                print("  WARNING: Possible memory leak detected")
            else:
                print("  OK: Memory growth within acceptable limits")

    async def resource_exhaustion_test(self):
        """Test system behavior when resources are exhausted."""
        print("Running resource exhaustion test")
        
        # Try to overwhelm with requests
        async with aiohttp.ClientSession() as session:
            tasks = []
            for i in range(1000):
                tasks.append(self.submit_order(session, i))
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            exceptions = sum(1 for r in results if isinstance(r, Exception))
            print(f"  Requests: 1000")
            print(f"  Exceptions: {exceptions}")
            print(f"  Success rate: {(1000 - exceptions) / 10:.1f}%")

    def print_results(self, test_name: str):
        """Print test results."""
        if not self.latencies:
            print(f"{test_name}: No data")
            return
        
        avg_latency = statistics.mean(self.latencies)
        median_latency = statistics.median(self.latencies)
        p95 = statistics.quantiles(self.latencies, n=100)[94] if len(self.latencies) >= 100 else max(self.latencies)
        p99 = statistics.quantiles(self.latencies, n=100)[98] if len(self.latencies) >= 100 else max(self.latencies)
        
        print(f"\n{test_name} Results:")
        print(f"  Orders submitted: {self.order_count}")
        print(f"  Errors: {self.error_count}")
        print(f"  Success rate: {(self.order_count / (self.order_count + self.error_count) * 100):.2f}%")
        print(f"  Avg latency: {avg_latency:.2f}ms")
        print(f"  Median latency: {median_latency:.2f}ms")
        print(f"  P95 latency: {p95:.2f}ms")
        print(f"  P99 latency: {p99:.2f}ms")
        
        # Reset
        self.order_count = 0
        self.error_count = 0
        self.latencies = []


async def main():
    tester = StressTester()
    
    print("=" * 60)
    print("Stress Test Suite")
    print("=" * 60)
    
    # Test 1: High order rate (100 RPS)
    await tester.high_order_rate_test(duration=30, target_rps=100)
    
    # Test 2: Concurrent WebSocket connections
    await tester.concurrent_websocket_test(num_connections=50)
    
    # Test 3: Memory leak detection
    await tester.memory_leak_test(duration=60)
    
    # Test 4: Resource exhaustion
    await tester.resource_exhaustion_test()
    
    print("\n" + "=" * 60)
    print("Stress test completed")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
