#!/usr/bin/env python3
"""Load test — measure WebSocket message throughput at 10k+ messages/sec.

Connects to the exchange simulator WebSocket and measures:
- Messages received per second
- Latency percentiles (p50, p95, p99)
- Total messages over test duration
- Memory usage

Usage:
    python tests/test_load_10k.py --url ws://localhost:8765 --duration 30 --target 10000

Requirements:
    pip install websockets psutil
"""
import argparse
import asyncio
import json
import statistics
import sys
import time
from collections import deque

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False


class LoadTestResults:
    def __init__(self):
        self.messages_received = 0
        self.latencies = deque(maxlen=100000)
        self.msg_types = {}
        self.start_time = 0
        self.end_time = 0
        self.peak_rate = 0
        self._rate_window = deque()  # (timestamp, count) for rolling rate

    def record_message(self, msg_data: str, recv_time: float):
        self.messages_received += 1
        now = time.time()

        # Track message type
        try:
            data = json.loads(msg_data)
            msg_type = data.get("type", "unknown")
            self.msg_types[msg_type] = self.msg_types.get(msg_type, 0) + 1

            # Measure latency if timestamp present
            ts = data.get("timestamp") or data.get("received_at") or data.get("time")
            if ts and isinstance(ts, (int, float)):
                # Exchange uses seconds, convert
                latency_ms = (now - ts) * 1000
                if 0 < latency_ms < 10000:  # sanity check
                    self.latencies.append(latency_ms)
        except (json.JSONDecodeError, KeyError):
            pass

        # Rolling rate calculation (1-second window)
        self._rate_window.append(now)
        while self._rate_window and self._rate_window[0] < now - 1.0:
            self._rate_window.popleft()
        current_rate = len(self._rate_window)
        if current_rate > self.peak_rate:
            self.peak_rate = current_rate

    def report(self) -> str:
        duration = self.end_time - self.start_time
        avg_rate = self.messages_received / duration if duration > 0 else 0

        lines = [
            "",
            "=" * 60,
            "  LOAD TEST RESULTS",
            "=" * 60,
            f"  Duration:          {duration:.1f}s",
            f"  Total messages:    {self.messages_received:,}",
            f"  Average rate:      {avg_rate:,.0f} msg/sec",
            f"  Peak rate:         {self.peak_rate:,} msg/sec",
        ]

        if self.latencies:
            lats = sorted(self.latencies)
            p50 = lats[len(lats) // 2]
            p95 = lats[int(len(lats) * 0.95)]
            p99 = lats[int(len(lats) * 0.99)]
            lines.extend([
                f"  Latency p50:       {p50:.2f}ms",
                f"  Latency p95:       {p95:.2f}ms",
                f"  Latency p99:       {p99:.2f}ms",
                f"  Latency min:       {lats[0]:.2f}ms",
                f"  Latency max:       {lats[-1]:.2f}ms",
            ])
        else:
            lines.append("  Latency:           N/A (no timestamps in messages)")

        lines.append(f"  Message types:     {len(self.msg_types)}")
        for mtype, count in sorted(self.msg_types.items(), key=lambda x: -x[1])[:5]:
            lines.append(f"    {mtype:20s} {count:>10,}")

        if HAS_PSUTIL:
            proc = psutil.Process()
            mem = proc.memory_info()
            lines.extend([
                f"  Memory RSS:        {mem.rss / 1024 / 1024:.1f}MB",
                f"  Memory VMS:        {mem.vms / 1024 / 1024:.1f}MB",
            ])

        target_met = "PASS" if avg_rate >= 10000 else "FAIL"
        lines.extend([
            "",
            f"  Target (10k/sec):  {target_met}",
            "=" * 60,
            "",
        ])
        return "\n".join(lines)


async def run_load_test(url: str, duration: int, target: int):
    import websockets

    results = LoadTestResults()
    results.start_time = time.time()

    print(f"Connecting to {url} ...")
    try:
        async with websockets.connect(url, max_size=2**24) as ws:
            # Send subscribe
            await ws.send(json.dumps({"type": "subscribe", "client": "load_test"}))
            print(f"Connected. Running for {duration}s ...")

            # Set up timeout
            end_time = time.time() + duration

            # Progress reporting
            last_report = time.time()
            last_count = 0

            while time.time() < end_time:
                try:
                    remaining = max(0.1, end_time - time.time())
                    msg = await asyncio.wait_for(ws.recv(), timeout=remaining)
                    results.record_message(msg, time.time())

                    # Progress every 5 seconds
                    now = time.time()
                    if now - last_report >= 5.0:
                        rate = (results.messages_received - last_count) / (now - last_report)
                        print(f"  [{now - results.start_time:.0f}s] {results.messages_received:,} msgs, "
                              f"rate: {rate:,.0f}/s, peak: {results.peak_rate:,}/s")
                        last_report = now
                        last_count = results.messages_received

                except TimeoutError:
                    break
                except websockets.ConnectionClosed:
                    print("Connection closed by server")
                    break

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return results

    results.end_time = time.time()
    return results


def main():
    parser = argparse.ArgumentParser(description="WebSocket load test — 10k+ msg/sec")
    parser.add_argument("--url", default="ws://localhost:8765", help="WebSocket URL")
    parser.add_argument("--duration", type=int, default=30, help="Test duration in seconds")
    parser.add_argument("--target", type=int, default=10000, help="Target messages/sec")
    args = parser.parse_args()

    results = asyncio.run(run_load_test(args.url, args.duration, args.target))
    print(results.report())

    avg_rate = results.messages_received / (results.end_time - results.start_time) if results.end_time > results.start_time else 0
    sys.exit(0 if avg_rate >= args.target else 1)


if __name__ == "__main__":
    main()
