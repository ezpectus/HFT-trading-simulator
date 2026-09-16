"""Tests for tools/load_10k.py — the 10k-msg/s WS load harness."""
import asyncio
import json

import pytest
import websockets

from tools.load_10k import LoadTestResults, run_load_test


def _market_msg() -> str:
    """Sim-style broadcast: the timestamp is the *simulated* market clock,
    not send wall-time (ws_broadcast emits market.current_timestamp)."""
    return json.dumps({"type": "market_data", "timestamp": 1704067200})


def test_record_message_counts_and_types():
    r = LoadTestResults()
    r.record_message(_market_msg(), 0)
    r.record_message(_market_msg(), 0)
    r.record_message(json.dumps({"type": "fill"}), 0)
    assert r.messages_received == 3
    assert r.msg_types == {"market_data": 2, "fill": 1}
    # Sim-clock timestamps must NOT be counted as latency (regression).
    assert len(r.latencies) == 0


def test_report_honors_target():
    r = LoadTestResults()
    r.start_time, r.end_time = 0, 10
    r.messages_received = 500  # 50 msg/s
    assert "Target (10/sec):  PASS" in r.report(10)
    assert "Target (100/sec):  FAIL" in r.report(100)


def test_report_latency_na_without_samples():
    r = LoadTestResults()
    r.start_time, r.end_time = 0, 1
    assert "Latency:           N/A" in r.report()


async def _broadcast_stub(ws):
    try:
        while True:
            await ws.send(_market_msg())
            await asyncio.sleep(0.01)
    except websockets.ConnectionClosed:
        pass


async def test_latency_samples_real_rtt():
    """End-to-end: ping/pong sampling produces real RTT numbers (fix)."""
    async with websockets.serve(_broadcast_stub, "localhost", 0) as server:
        port = server.sockets[0].getsockname()[1]
        r = await run_load_test(f"ws://localhost:{port}", duration=2, target=1)
    assert r.messages_received > 50
    lats = list(r.latencies)
    assert len(lats) >= 1
    assert all(0 <= x < 1000 for x in lats)
    report = r.report(1)
    assert "Latency p50" in report
    assert "Target (1/sec):  PASS" in report
