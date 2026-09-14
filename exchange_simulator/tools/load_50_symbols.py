"""
Load harness: 50-symbol market data over the real WS protocol.

Requires a live sim. Measures:
- WS round-trip latency via ping/pong
- Broadcast symbol coverage — how many of the expected symbols actually
  stream in the candles feed
- WS message throughput

Usage:
    python tools/load_50_symbols.py
"""

import asyncio
import json
import statistics
import time
from collections import deque

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

WS_URL = "ws://localhost:8765"


class LoadTester:
    def __init__(self):
        self.latencies: list[float] = []
        self.errors: int = 0
        self.success_count: int = 0
        self._pending_pings: deque[float] = deque()

    async def test_ws_ping_latency(self, ws):
        """Round-trip latency: ping -> pong on the live protocol."""
        try:
            self._pending_pings.append(time.time())
            await ws.send_json({"type": "ping"})
        except (OSError, aiohttp.ClientError):
            self._pending_pings.pop()
            self.errors += 1

    def _on_message(self, data: dict):
        if data.get("type") == "pong" and self._pending_pings:
            sent = self._pending_pings.popleft()
            self.latencies.append((time.time() - sent) * 1000)
            self.success_count += 1

    async def run_ping_load_test(self, iterations: int = 100):
        print(f"Running WS ping/pong load test with {iterations} iterations...")

        async def reader(ws, deadline):
            async for msg in ws:
                if time.time() > deadline:
                    break
                if msg.type == aiohttp.WSMsgType.TEXT:
                    try:
                        self._on_message(json.loads(msg.data))
                    except (ValueError, TypeError):
                        pass

        async with aiohttp.ClientSession() as session:
            async with session.ws_connect(WS_URL) as ws:
                deadline = time.time() + iterations * 0.05 + 5
                task = asyncio.create_task(reader(ws, deadline))
                for _ in range(iterations):
                    await self.test_ws_ping_latency(ws)
                    await asyncio.sleep(0.05)
                await asyncio.sleep(0.5)
                task.cancel()

        self.print_results("WS ping/pong")

    async def run_symbol_coverage_test(self, duration: int = 20):
        """Count how many of the expected symbols actually stream."""
        print(f"Running symbol coverage test for {duration}s over {len(SYMBOLS)} symbols...")
        seen: set[str] = set()
        messages = 0

        try:
            async with aiohttp.ClientSession() as session:
                async with session.ws_connect(WS_URL) as ws:
                    await ws.send_json({
                        "type": "subscribe",
                        "protocol_version": 2,
                        "encoding": "json",
                    })
                    deadline = time.time() + duration
                    while time.time() < deadline:
                        try:
                            msg = await asyncio.wait_for(ws.receive(), timeout=deadline - time.time())
                        except TimeoutError:
                            break
                        if msg.type != aiohttp.WSMsgType.TEXT:
                            if msg.type == aiohttp.WSMsgType.ERROR:
                                break
                            continue
                        try:
                            data = json.loads(msg.data)
                        except (ValueError, TypeError):
                            continue
                        if data.get("type") == "candles":
                            messages += 1
                            for candle in data.get("candles") or []:
                                sym = candle.get("symbol")
                                if sym:
                                    seen.add(sym)
        except (OSError, aiohttp.ClientError) as e:
            print(f"WebSocket error: {e}")
            return

        missing = [s for s in SYMBOLS if s not in seen]
        print("\nSymbol Coverage Results:")
        print(f"  Broadcast messages: {messages}")
        print(f"  Symbols streaming: {len(seen)} (expected {len(SYMBOLS)})")
        print(f"  Coverage: {len(seen & set(SYMBOLS)) / len(SYMBOLS) * 100:.1f}% of watchlist")
        if missing:
            print(f"  Missing: {', '.join(missing[:10])}{' …' if len(missing) > 10 else ''}")

    async def test_websocket_throughput(self, duration: int = 30):
        print(f"Running WebSocket throughput test for {duration} seconds...")

        message_count = 0
        start_time = time.time()

        try:
            async with aiohttp.ClientSession() as session:
                async with session.ws_connect(WS_URL) as ws:
                    await ws.send_json({
                        "type": "subscribe",
                        "protocol_version": 2,
                        "encoding": "json",
                    })

                    msg = await ws.receive_json()
                    if msg.get("type") == "welcome":
                        print("WebSocket connected")

                    while time.time() - start_time < duration:
                        msg = await ws.receive()
                        if msg.type == aiohttp.WSMsgType.TEXT:
                            message_count += 1
                        elif msg.type == aiohttp.WSMsgType.ERROR:
                            break

                    throughput = message_count / duration
                    print(f"WebSocket throughput: {throughput:.2f} messages/second")

        except (OSError, aiohttp.ClientError, RuntimeError) as e:
            print(f"WebSocket error: {e}")

    def print_results(self, test_name: str):
        if not self.latencies:
            print(f"{test_name}: no replies received")
            self.latencies = []
            self.errors = 0
            self.success_count = 0
            return

        avg_latency = statistics.mean(self.latencies)
        median_latency = statistics.median(self.latencies)
        p95_latency = statistics.quantiles(self.latencies, n=100)[94] if len(self.latencies) >= 100 else max(self.latencies)
        p99_latency = statistics.quantiles(self.latencies, n=100)[98] if len(self.latencies) >= 100 else max(self.latencies)

        print(f"\n{test_name} Results:")
        print(f"  Round trips: {self.success_count}")
        print(f"  Errors: {self.errors}")
        print(f"  Average latency: {avg_latency:.2f}ms")
        print(f"  Median latency: {median_latency:.2f}ms")
        print(f"  P95 latency: {p95_latency:.2f}ms")
        print(f"  P99 latency: {p99_latency:.2f}ms")

        self.latencies = []
        self.errors = 0
        self.success_count = 0


async def main():
    tester = LoadTester()

    print("=" * 60)
    print("Load Harness — 50-symbol feed, requires live sim on", WS_URL)
    print("=" * 60)

    await tester.run_ping_load_test(iterations=100)
    await tester.run_symbol_coverage_test(duration=20)
    await tester.test_websocket_throughput(duration=30)

    print("\n" + "=" * 60)
    print("Load run completed")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
