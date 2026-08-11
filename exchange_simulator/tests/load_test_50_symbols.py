"""
Load test for 50+ cryptocurrency symbols.

Tests the system's ability to handle price updates and order book updates
for 50+ symbols simultaneously.
"""

import asyncio
import time
import statistics
from typing import List, Dict
import aiohttp

# Symbols from shared_config.yaml
SYMBOLS = [
    "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "ADA/USDT",
    "AVAX/USDT", "DOT/USDT", "LINK/USDT", "MATIC/USDT", "UNI/USDT",
    "XRP/USDT", "LTC/USDT", "ATOM/USDT", "NEAR/USDT", "FTM/USDT",
    "APE/USDT", "SAND/USDT", "MANA/USDT", "AXS/USDT", "ENJ/USDT",
    "GALA/USDT", "IMX/USDT", "GMT/USDT", "BCH/USDT", "ETC/USDT",
    "XLM/USDT", "ALGO/USDT", "VET/USDT", "THETA/USDT", "ICP/USDT",
    "HBAR/USDT", "EOS/USDT", "TRX/USDT", "XMR/USDT", "DASH/USDT",
    "ZEC/USDT", "KSM/USDT", "ACA/USDT", "GLM/USDT", "MASK/USDT",
    "LDO/USDT", "STG/USDT", "RPL/USDT", "FXS/USDT", "CRV/USDT",
    "AAVE/USDT", "COMP/USDT", "MKR/USDT", "SNX/USDT", "YFI/USDT"
]

EXCHANGE_URL = "http://localhost:8765/api/v1"
WS_URL = "ws://localhost:8765"


class LoadTester:
    def __init__(self):
        self.latencies: List[float] = []
        self.errors: int = 0
        self.success_count: int = 0

    async def test_rest_api_latency(self, session: aiohttp.ClientSession):
        """Test REST API latency for all symbols."""
        start = time.time()
        try:
            async with session.get(f"{EXCHANGE_URL}/symbols") as resp:
                await resp.json()
            latency = (time.time() - start) * 1000  # Convert to ms
            self.latencies.append(latency)
            self.success_count += 1
        except Exception as e:
            self.errors += 1
            print(f"REST API error: {e}")

    async def test_orderbook_latency(self, session: aiohttp.ClientSession, symbol: str):
        """Test orderbook endpoint latency."""
        start = time.time()
        try:
            async with session.get(f"{EXCHANGE_URL}/orderbook/{symbol}") as resp:
                await resp.json()
            latency = (time.time() - start) * 1000
            self.latencies.append(latency)
            self.success_count += 1
        except Exception as e:
            self.errors += 1

    async def run_rest_load_test(self, iterations: int = 100):
        """Run REST API load test."""
        print(f"Running REST API load test with {iterations} iterations...")
        
        async with aiohttp.ClientSession() as session:
            tasks = []
            for _ in range(iterations):
                tasks.append(self.test_rest_api_latency(session))
            
            await asyncio.gather(*tasks)
        
        self.print_results("REST API")

    async def run_orderbook_load_test(self, iterations: int = 200):
        """Run orderbook load test for all symbols."""
        print(f"Running orderbook load test for {len(SYMBOLS)} symbols...")
        
        async with aiohttp.ClientSession() as session:
            tasks = []
            for _ in range(iterations):
                for symbol in SYMBOLS:
                    tasks.append(self.test_orderbook_latency(session, symbol))
            
            await asyncio.gather(*tasks)
        
        self.print_results("Orderbook")

    async def test_websocket_throughput(self, duration: int = 30):
        """Test WebSocket message throughput."""
        print(f"Running WebSocket throughput test for {duration} seconds...")
        
        message_count = 0
        start_time = time.time()
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.ws_connect(WS_URL) as ws:
                    # Subscribe
                    await ws.send_json({
                        "type": "subscribe",
                        "protocol_version": 2,
                        "encoding": "json"
                    })
                    
                    # Wait for welcome
                    msg = await ws.receive_json()
                    if msg.get("type") == "welcome":
                        print("WebSocket connected")
                    
                    # Count messages
                    while time.time() - start_time < duration:
                        msg = await ws.receive()
                        if msg.type == aiohttp.WSMsgType.TEXT:
                            message_count += 1
                        elif msg.type == aiohttp.WSMsgType.ERROR:
                            break
                    
                    throughput = message_count / duration
                    print(f"WebSocket throughput: {throughput:.2f} messages/second")
                    
        except Exception as e:
            print(f"WebSocket error: {e}")

    def print_results(self, test_name: str):
        """Print test results."""
        if not self.latencies:
            print(f"{test_name}: No successful requests")
            return
        
        avg_latency = statistics.mean(self.latencies)
        median_latency = statistics.median(self.latencies)
        p95_latency = statistics.quantiles(self.latencies, n=100)[94] if len(self.latencies) >= 100 else max(self.latencies)
        p99_latency = statistics.quantiles(self.latencies, n=100)[98] if len(self.latencies) >= 100 else max(self.latencies)
        
        print(f"\n{test_name} Results:")
        print(f"  Total requests: {self.success_count}")
        print(f"  Errors: {self.errors}")
        print(f"  Success rate: {(self.success_count / (self.success_count + self.errors) * 100):.2f}%")
        print(f"  Average latency: {avg_latency:.2f}ms")
        print(f"  Median latency: {median_latency:.2f}ms")
        print(f"  P95 latency: {p95_latency:.2f}ms")
        print(f"  P99 latency: {p99_latency:.2f}ms")
        
        # Reset for next test
        self.latencies = []
        self.errors = 0
        self.success_count = 0


async def main():
    tester = LoadTester()
    
    print("=" * 60)
    print("Load Test for 50+ Cryptocurrency Symbols")
    print("=" * 60)
    
    # Test 1: REST API latency
    await tester.run_rest_load_test(iterations=100)
    
    # Test 2: Orderbook latency for all symbols
    await tester.run_orderbook_load_test(iterations=50)
    
    # Test 3: WebSocket throughput
    await tester.test_websocket_throughput(duration=30)
    
    print("\n" + "=" * 60)
    print("Load test completed")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
