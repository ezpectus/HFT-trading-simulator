"""
Stress harness for the exchange simulator — requires a live server.

Measures real behavior under load over the actual WS protocol:
- High order submission rate (orders as {"type":"order"} messages,
  fill/error replies correlated by client_order_id)
- Concurrent WebSocket connections
- Memory growth of the *client* process while driving orders
- Order-burst resilience

Usage:
    python tools/stress_load.py            # all scenarios
"""

import asyncio
import json
import statistics
import time

import aiohttp
import psutil

WS_URL = "ws://localhost:8765"
SYMBOL = "BTC/USDT"
EXCHANGE = "binance"


class StressTester:
    def __init__(self):
        self.sent_count = 0
        self.fill_count = 0
        self.error_count = 0
        self.latencies: list[float] = []
        # client_order_id -> send timestamp; the sim echoes it in the fill's
        # order dict, and error replies are direct-addressed (never broadcast)
        self._pending: dict[str, float] = {}
        self.start_memory = psutil.Process().memory_info().rss

    async def _reader(self, ws) -> None:
        async for msg in ws:
            if msg.type != aiohttp.WSMsgType.TEXT:
                if msg.type == aiohttp.WSMsgType.ERROR:
                    break
                continue
            try:
                data = json.loads(msg.data)
            except (ValueError, TypeError):
                continue
            if data.get("type") == "fill":
                sent = self._pending.pop((data.get("order") or {}).get("client_order_id"), None)
                if sent is not None:
                    self.fill_count += 1
                    self.latencies.append((time.time() - sent) * 1000)
            elif data.get("type") == "error":
                self.error_count += 1

    async def submit_order(self, ws, order_id: int) -> None:
        cid = f"stress-{order_id}"
        self._pending[cid] = time.time()
        try:
            await ws.send_json({
                "type": "order",
                "exchange": EXCHANGE,
                "symbol": SYMBOL,
                "side": "BUY" if order_id % 2 == 0 else "SELL",
                "order_type": "LIMIT",
                "quantity": 0.001,
                "price": 65000.0 + (order_id % 100),
                "client_order_id": cid,
            })
            self.sent_count += 1
        except (OSError, aiohttp.ClientError):
            self._pending.pop(cid, None)
            self.error_count += 1

    async def _drive_orders(self, session, seconds: float, per_burst: int,
                            burst_interval: float = 1.0) -> None:
        async with session.ws_connect(WS_URL) as ws:
            reader = asyncio.create_task(self._reader(ws))
            try:
                deadline = time.time() + seconds
                order_id = 0
                while time.time() < deadline:
                    for _ in range(per_burst):
                        await self.submit_order(ws, order_id)
                        order_id += 1
                    await asyncio.sleep(burst_interval)
                await asyncio.sleep(0.5)  # drain in-flight replies
            finally:
                reader.cancel()

    async def high_order_rate_test(self, duration: int = 60, target_rps: int = 100):
        print(f"Running high order rate test: {target_rps} orders/second for {duration}s")
        async with aiohttp.ClientSession() as session:
            await self._drive_orders(session, duration, target_rps)
        self.print_results(f"High Order Rate ({target_rps} RPS)")

    async def concurrent_websocket_test(self, num_connections: int = 50):
        print(f"Running concurrent WebSocket test: {num_connections} connections")

        async def ws_connection(conn_id: int):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.ws_connect(WS_URL) as ws:
                        await ws.send_json({
                            "type": "subscribe",
                            "protocol_version": 2,
                            "encoding": "json",
                        })
                        for _ in range(30):
                            msg = await ws.receive()
                            if msg.type == aiohttp.WSMsgType.ERROR:
                                break
                            await asyncio.sleep(1)
                        return True
            except (OSError, aiohttp.ClientError, RuntimeError) as e:
                print(f"Connection {conn_id} failed: {e}")
                return False

        start = time.time()
        results = await asyncio.gather(*[ws_connection(i) for i in range(num_connections)])
        duration = time.time() - start

        successful = sum(1 for r in results if r)
        print(f"  Successful connections: {successful}/{num_connections}")
        print(f"  Time to establish: {duration:.2f}s")

    async def memory_leak_test(self, duration: int = 120):
        print(f"Running memory growth test for {duration}s (client process)")
        process = psutil.Process()
        memory_samples = []

        async with aiohttp.ClientSession() as session:
            async with session.ws_connect(WS_URL) as ws:
                reader = asyncio.create_task(self._reader(ws))
                try:
                    start_time = time.time()
                    order_id = 0
                    while time.time() - start_time < duration:
                        for _ in range(10):
                            await self.submit_order(ws, order_id)
                            order_id += 1
                        memory_mb = process.memory_info().rss / 1024 / 1024
                        memory_samples.append(memory_mb)
                        print(f"  Memory: {memory_mb:.2f}MB")
                        await asyncio.sleep(10)
                finally:
                    reader.cancel()

        if len(memory_samples) >= 2:
            initial = memory_samples[0]
            final = memory_samples[-1]
            growth = final - initial
            growth_rate = growth / duration * 60  # MB per minute

            print("\nMemory Growth Analysis:")
            print(f"  Initial memory: {initial:.2f}MB")
            print(f"  Final memory: {final:.2f}MB")
            print(f"  Total growth: {growth:.2f}MB")
            print(f"  Growth rate: {growth_rate:.2f}MB/min")
            print("  WARNING: memory growing >1MB/min" if growth_rate > 1.0
                  else "  OK: memory growth within acceptable limits")

    async def resource_exhaustion_test(self):
        print("Running order-burst test (1000 orders, one socket)")
        async with aiohttp.ClientSession() as session:
            await self._drive_orders(session, 0.001, 1000, burst_interval=0)
        print(f"  Sent: {self.sent_count}, fills: {self.fill_count}, "
              f"errors: {self.error_count}")
        self.print_results("Order burst")

    def print_results(self, test_name: str):
        if not self.latencies:
            print(f"{test_name}: no replies received")
            self.sent_count = self.fill_count = self.error_count = 0
            return

        avg_latency = statistics.mean(self.latencies)
        median_latency = statistics.median(self.latencies)
        p95 = statistics.quantiles(self.latencies, n=100)[94] if len(self.latencies) >= 100 else max(self.latencies)
        p99 = statistics.quantiles(self.latencies, n=100)[98] if len(self.latencies) >= 100 else max(self.latencies)

        total = self.fill_count + self.error_count
        print(f"\n{test_name} Results:")
        print(f"  Orders sent: {self.sent_count}")
        print(f"  Fills: {self.fill_count}")
        print(f"  Errors: {self.error_count}")
        print(f"  Reply rate: {(total / self.sent_count * 100) if self.sent_count else 0:.2f}%")
        print(f"  Avg latency: {avg_latency:.2f}ms")
        print(f"  Median latency: {median_latency:.2f}ms")
        print(f"  P95 latency: {p95:.2f}ms")
        print(f"  P99 latency: {p99:.2f}ms")

        self.sent_count = self.fill_count = self.error_count = 0
        self.latencies = []


async def main():
    tester = StressTester()

    print("=" * 60)
    print("Stress Harness — requires live sim on", WS_URL)
    print("=" * 60)

    await tester.high_order_rate_test(duration=30, target_rps=100)
    await tester.concurrent_websocket_test(num_connections=50)
    await tester.memory_leak_test(duration=60)
    await tester.resource_exhaustion_test()

    print("\n" + "=" * 60)
    print("Stress run completed")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
