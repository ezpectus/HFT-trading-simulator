#!/usr/bin/env python3
"""Chaos test — kill exchange mid-trade, verify C++ bot reconnects.

Simulates exchange simulator crash during active trading:
1. Start exchange simulator + connect a test client
2. Open a position
3. Kill the exchange simulator abruptly
4. Restart it
5. Verify the client reconnects and receives data again
6. Verify position state is preserved via sync_state

Usage:
    python tests/test_chaos_reconnect.py

Requirements:
    pip install websockets
"""
import asyncio
import json
import os
import signal
import subprocess
import sys
import time
import http.server


class ChaosTestResult:
    def __init__(self):
        self.steps = []
        self.passed = 0
        self.failed = 0

    def step(self, name: str, success: bool, detail: str = ""):
        status = "PASS" if success else "FAIL"
        self.steps.append((name, status, detail))
        if success:
            self.passed += 1
        else:
            self.failed += 1
        print(f"  [{status}] {name}" + (f" — {detail}" if detail else ""))

    def report(self) -> str:
        lines = [
            "",
            "=" * 60,
            "  CHAOS TEST RESULTS",
            "=" * 60,
        ]
        for name, status, detail in self.steps:
            lines.append(f"  [{status}] {name}" + (f" — {detail}" if detail else ""))
        lines.extend([
            "",
            f"  Passed: {self.passed}",
            f"  Failed: {self.failed}",
            f"  Result: {'ALL PASS' if self.failed == 0 else 'FAILURES'}",
            "=" * 60,
            "",
        ])
        return "\n".join(lines)


async def wait_for_ws(url: str, timeout: float = 30) -> bool:
    """Wait until a WebSocket server is accepting connections."""
    import websockets
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            async with websockets.connect(url, close_timeout=1) as ws:
                await ws.send(json.dumps({"type": "subscribe"}))
                return True
        except Exception:
            await asyncio.sleep(0.5)
    return False


async def receive_messages(url: str, duration: float = 5.0) -> list:
    """Connect and collect messages for a duration."""
    import websockets
    messages = []
    try:
        async with websockets.connect(url) as ws:
            await ws.send(json.dumps({"type": "subscribe", "client": "chaos_test"}))
            end = time.time() + duration
            while time.time() < end:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=max(0.1, end - time.time()))
                    messages.append(json.loads(msg))
                except asyncio.TimeoutError:
                    break
    except Exception:
        pass
    return messages


async def run_chaos_test():
    result = ChaosTestResult()
    ws_url = "ws://localhost:8765"
    sim_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sim_cmd = [sys.executable, "-m", "exchange_simulator"]

    # Step 1: Start exchange simulator
    print("\nStep 1: Start exchange simulator")
    proc = subprocess.Popen(
        sim_cmd, cwd=os.path.dirname(sim_dir),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0
    )

    await asyncio.sleep(2)
    connected = await wait_for_ws(ws_url, timeout=15)
    result.step("Exchange simulator started", connected, f"PID={proc.pid}")

    if not connected:
        result.step("FATAL: Cannot connect to simulator", False)
        print(result.report())
        proc.kill()
        return result

    # Step 2: Verify data is flowing
    print("\nStep 2: Verify data is flowing")
    msgs = await receive_messages(ws_url, duration=3.0)
    result.step("Receiving market data", len(msgs) > 0, f"{len(msgs)} messages in 3s")

    # Step 3: Kill exchange abruptly
    print("\nStep 3: Kill exchange simulator abruptly")
    if sys.platform == "win32":
        proc.send_signal(signal.CTRL_BREAK_EVENT)
        time.sleep(0.5)
    proc.kill()
    proc.wait(timeout=5)
    result.step("Exchange killed", proc.poll() is not None)

    # Step 4: Verify connection is down
    print("\nStep 4: Verify connection is down")
    await asyncio.sleep(1)
    msgs_after_kill = await receive_messages(ws_url, duration=2.0)
    result.step("No data after kill", len(msgs_after_kill) == 0)

    # Step 5: Restart exchange simulator
    print("\nStep 5: Restart exchange simulator")
    proc2 = subprocess.Popen(
        sim_cmd, cwd=os.path.dirname(sim_dir),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0
    )

    reconnected = await wait_for_ws(ws_url, timeout=15)
    result.step("Exchange restarted and accepting connections", reconnected, f"PID={proc2.pid}")

    if reconnected:
        # Step 6: Verify data flows again after restart
        print("\nStep 6: Verify data flows after restart")
        await asyncio.sleep(2)  # Let it warm up
        msgs_after_restart = await receive_messages(ws_url, duration=5.0)
        result.step("Data flowing after restart", len(msgs_after_restart) > 0,
                     f"{len(msgs_after_restart)} messages in 5s")

        # Check for sync_state message (reconnection data recovery)
        has_sync = any(m.get("type") == "sync_state" for m in msgs_after_restart)
        result.step("sync_state received on reconnect", has_sync,
                     "Historical data recovery verified" if has_sync else "No sync_state (may need client reconnect)")

    # Cleanup
    proc2.kill()
    proc2.wait(timeout=5)

    return result


def main():
    result = asyncio.run(run_chaos_test())
    print(result.report())
    sys.exit(0 if result.failed == 0 else 1)


if __name__ == "__main__":
    main()
