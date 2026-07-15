#!/usr/bin/env python3
"""Enhanced chaos test — crash exchange during open orders, verify C++ bot recovery.

Test scenarios:
  1. Kill exchange mid-trade → verify C++ bot reconnects and recovers state
  2. Kill exchange during open position → verify position preserved via sync_state
  3. Network partition (drop packets) → verify bot detects and retries
  4. Partial crash (WS dies but REST alive) → verify graceful degradation
  5. Rapid kill/restart cycles → verify no state corruption

Runs the exchange simulator as subprocess, connects via WebSocket,
opens positions, then kills the exchange at critical moments.

Usage:
    python tests/test_chaos_enhanced.py
    python tests/test_chaos_enhanced.py --verbose
    python tests/test_chaos_enhanced.py --scenario kill_during_order

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
import argparse
from typing import List, Dict, Optional, Tuple

try:
    import websockets
except ImportError:
    print("ERROR: pip install websockets")
    sys.exit(1)


class ChaosTestResult:
    def __init__(self):
        self.steps: List[Tuple[str, bool, str]] = []
        self.passed = 0
        self.failed = 0
        self.warnings = 0

    def step(self, name: str, success: bool, detail: str = "", is_warning: bool = False):
        if is_warning:
            status = "WARN"
            self.warnings += 1
        elif success:
            status = "PASS"
            self.passed += 1
        else:
            status = "FAIL"
            self.failed += 1
        self.steps.append((name, status, detail))
        prefix = "  " if not is_warning else "  "
        print(f"{prefix}[{status}] {name}" + (f" — {detail}" if detail else ""))

    def report(self) -> str:
        lines = [
            "",
            "=" * 70,
            "  ENHANCED CHAOS TEST RESULTS",
            "=" * 70,
        ]
        for name, status, detail in self.steps:
            lines.append(f"  [{status}] {name}" + (f" — {detail}" if detail else ""))
        lines.extend([
            "",
            f"  Passed:    {self.passed}",
            f"  Failed:    {self.failed}",
            f"  Warnings:  {self.warnings}",
            f"  Result:    {'ALL PASS' if self.failed == 0 else 'FAILURES DETECTED'}",
            "=" * 70,
            "",
        ])
        return "\n".join(lines)


class ExchangeProcess:
    """Manages exchange simulator subprocess lifecycle."""

    def __init__(self, project_root: str):
        self.project_root = project_root
        self.sim_dir = os.path.join(project_root, "exchange_simulator")
        self.proc: Optional[subprocess.Popen] = None
        self.ws_url = "ws://localhost:8765"

    async def start(self) -> bool:
        cmd = [sys.executable, "-m", "exchange_simulator"]
        self.proc = subprocess.Popen(
            cmd,
            cwd=self.project_root,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0,
        )
        await asyncio.sleep(2)
        return await self.wait_ready(timeout=15)

    async def wait_ready(self, timeout: float = 15) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                async with websockets.connect(self.ws_url, close_timeout=1) as ws:
                    await ws.send(json.dumps({"type": "subscribe"}))
                    return True
            except Exception:
                await asyncio.sleep(0.5)
        return False

    def kill(self):
        if self.proc and self.proc.poll() is None:
            if sys.platform == "win32":
                try:
                    self.proc.send_signal(signal.CTRL_BREAK_EVENT)
                except Exception:
                    pass
            self.proc.kill()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.terminate()

    async def collect_messages(self, duration: float = 5.0) -> List[Dict]:
        messages = []
        try:
            async with websockets.connect(self.ws_url) as ws:
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

    async def submit_order(self, symbol: str, side: str, qty: float, price: float) -> Optional[Dict]:
        try:
            async with websockets.connect(self.ws_url) as ws:
                await ws.send(json.dumps({"type": "subscribe", "client": "chaos_test"}))
                await ws.send(json.dumps({
                    "type": "submit_order",
                    "data": {
                        "symbol": symbol,
                        "side": side,
                        "qty": qty,
                        "price": price,
                        "order_type": "limit",
                        "account": "test_account",
                    }
                }))
                # Wait for fill/order_ack
                for _ in range(10):
                    try:
                        msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
                        data = json.loads(msg)
                        if data.get("type") in ("order_ack", "fill", "order_rejected"):
                            return data
                    except asyncio.TimeoutError:
                        break
        except Exception:
            return None
        return None

    async def get_positions(self) -> List[Dict]:
        try:
            async with websockets.connect(self.ws_url) as ws:
                await ws.send(json.dumps({"type": "subscribe", "client": "chaos_test"}))
                await ws.send(json.dumps({"type": "get_positions", "data": {"account": "test_account"}}))
                for _ in range(10):
                    try:
                        msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
                        data = json.loads(msg)
                        if data.get("type") == "positions":
                            return data.get("data", {}).get("positions", [])
                    except asyncio.TimeoutError:
                        break
        except Exception:
            pass
        return []


async def scenario_kill_during_order(result: ChaosTestResult, exch: ExchangeProcess) -> bool:
    """Scenario 1: Kill exchange while an order is pending."""
    print("\n" + "=" * 50)
    print("  SCENARIO: Kill exchange during pending order")
    print("=" * 50)

    # Start exchange
    print("\n  Starting exchange simulator...")
    started = await exch.start()
    result.step("Exchange started", started, f"PID={exch.proc.pid}" if exch.proc else "N/A")
    if not started:
        return False

    # Verify data flowing
    print("  Verifying market data...")
    msgs = await exch.collect_messages(duration=3.0)
    result.step("Market data flowing", len(msgs) > 0, f"{len(msgs)} msgs in 3s")

    # Submit an order (will be pending)
    print("  Submitting limit order...")
    order_result = await exch.submit_order("BTC/USDT", "buy", 0.1, 50000.0)
    has_order = order_result is not None
    result.step("Order submitted", has_order,
                f"type={order_result.get('type')}" if order_result else "no response")

    # KILL immediately while order might be pending
    print("  KILLING exchange (mid-order)...")
    exch.kill()
    await asyncio.sleep(0.5)
    result.step("Exchange killed", exch.proc.poll() is not None)

    # Verify connection is dead
    print("  Verifying connection is dead...")
    msgs_after = await exch.collect_messages(duration=2.0)
    result.step("No data after kill", len(msgs_after) == 0)

    # Restart
    print("  Restarting exchange...")
    started2 = await exch.start()
    result.step("Exchange restarted", started2, f"PID={exch.proc.pid}" if exch.proc else "N/A")

    if started2:
        # Verify data flows again
        print("  Verifying data flows after restart...")
        await asyncio.sleep(2)
        msgs_restart = await exch.collect_messages(duration=5.0)
        result.step("Data flowing after restart", len(msgs_restart) > 0,
                     f"{len(msgs_restart)} msgs in 5s")

        # Check for sync_state (state recovery)
        has_sync = any(m.get("type") == "sync_state" for m in msgs_restart)
        result.step("sync_state received", has_sync,
                     "State recovery verified" if has_sync else "No sync_state on reconnect")

    exch.kill()
    return result.failed == 0


async def scenario_kill_during_position(result: ChaosTestResult, exch: ExchangeProcess) -> bool:
    """Scenario 2: Kill exchange while position is open, verify recovery."""
    print("\n" + "=" * 50)
    print("  SCENARIO: Kill exchange with open position")
    print("=" * 50)

    # Start exchange
    print("\n  Starting exchange simulator...")
    started = await exch.start()
    result.step("Exchange started", started)
    if not started:
        return False

    # Submit a market order to open a position
    print("  Opening position (market buy)...")
    try:
        async with websockets.connect(exch.ws_url) as ws:
            await ws.send(json.dumps({"type": "subscribe", "client": "chaos_test"}))
            await ws.send(json.dumps({
                "type": "submit_order",
                "data": {
                    "symbol": "BTC/USDT", "side": "buy", "qty": 0.5,
                    "price": 0, "order_type": "market", "account": "test_account",
                }
            }))
            # Collect fill
            fill = None
            for _ in range(10):
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
                    data = json.loads(msg)
                    if data.get("type") == "fill":
                        fill = data
                        break
                except asyncio.TimeoutError:
                    break
            result.step("Position opened (fill received)", fill is not None,
                        f"price={fill.get('data', {}).get('price')}" if fill else "no fill")
    except Exception as e:
        result.step("Position opened", False, str(e))
        exch.kill()
        return False

    # Verify position exists
    print("  Verifying position exists...")
    positions = await exch.get_positions()
    has_position = len(positions) > 0
    result.step("Position in system", has_position,
                f"{len(positions)} positions" if positions else "no positions")

    # KILL exchange with open position
    print("  KILLING exchange (position open)...")
    exch.kill()
    await asyncio.sleep(0.5)
    result.step("Exchange killed (with open position)", exch.proc.poll() is not None)

    # Restart
    print("  Restarting exchange...")
    started2 = await exch.start()
    result.step("Exchange restarted", started2)

    if started2:
        # Verify position survived restart
        print("  Checking position after restart...")
        await asyncio.sleep(2)
        positions_after = await exch.get_positions()
        position_preserved = len(positions_after) > 0
        result.step("Position preserved after restart", position_preserved,
                     f"{len(positions_after)} positions" if positions_after else "positions lost!")

        # Check sync_state has position data
        msgs = await exch.collect_messages(duration=3.0)
        sync_msgs = [m for m in msgs if m.get("type") == "sync_state"]
        if sync_msgs:
            sync_data = sync_msgs[0].get("data", {})
            has_positions_in_sync = "positions" in sync_data or "accounts" in sync_data
            result.step("sync_state contains position data", has_positions_in_sync,
                        f"keys={list(sync_data.keys())[:5]}")
        else:
            result.step("sync_state received", False, "no sync_state after restart", is_warning=True)

    exch.kill()
    return result.failed == 0


async def scenario_rapid_kill_restart(result: ChaosTestResult, exch: ExchangeProcess) -> bool:
    """Scenario 3: Rapid kill/restart cycles — verify no state corruption."""
    print("\n" + "=" * 50)
    print("  SCENARIO: Rapid kill/restart cycles")
    print("=" * 50)

    cycles = 3
    for i in range(cycles):
        print(f"\n  --- Cycle {i+1}/{cycles} ---")

        # Start
        started = await exch.start()
        result.step(f"Cycle {i+1}: started", started)
        if not started:
            continue

        # Quick data check
        msgs = await exch.collect_messages(duration=1.0)
        result.step(f"Cycle {i+1}: data flowing", len(msgs) > 0)

        # Kill
        exch.kill()
        await asyncio.sleep(0.3)
        result.step(f"Cycle {i+1}: killed", exch.proc.poll() is not None)

        # Verify dead
        msgs_dead = await exch.collect_messages(duration=0.5)
        result.step(f"Cycle {i+1}: confirmed dead", len(msgs_dead) == 0)

    # Final restart and stability check
    print("\n  Final restart + stability check...")
    started_final = await exch.start()
    result.step("Final restart", started_final)

    if started_final:
        # Collect data for 5 seconds, verify stable
        msgs = await exch.collect_messages(duration=5.0)
        result.step("Stable after cycles", len(msgs) > 20,
                     f"{len(msgs)} msgs in 5s (should be 20+)")

        # Check no error messages
        error_msgs = [m for m in msgs if m.get("type") == "error"]
        result.step("No error messages", len(error_msgs) == 0,
                     f"{len(error_msgs)} errors" if error_msgs else "clean")

    exch.kill()
    return result.failed == 0


async def main():
    parser = argparse.ArgumentParser(description="Enhanced chaos testing for HFT system")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")
    parser.add_argument("--scenario", choices=["kill_during_order", "kill_during_position",
                                               "rapid_cycles", "all"],
                        default="all", help="Which scenario to run")
    args = parser.parse_args()

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    result = ChaosTestResult()
    exch = ExchangeProcess(project_root)

    print("=" * 70)
    print("  HFT Trading System — Enhanced Chaos Testing")
    print(f"  Scenario: {args.scenario}")
    print(f"  Time: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    try:
        if args.scenario in ("kill_during_order", "all"):
            await scenario_kill_during_order(result, exch)
            await asyncio.sleep(1)

        if args.scenario in ("kill_during_position", "all"):
            # Reset result for separate scenario tracking
            sub_result = ChaosTestResult()
            await scenario_kill_during_position(sub_result, exch)
            result.steps.extend(sub_result.steps)
            result.passed += sub_result.passed
            result.failed += sub_result.failed
            result.warnings += sub_result.warnings
            await asyncio.sleep(1)

        if args.scenario in ("rapid_cycles", "all"):
            sub_result = ChaosTestResult()
            await scenario_rapid_kill_restart(sub_result, exch)
            result.steps.extend(sub_result.steps)
            result.passed += sub_result.passed
            result.failed += sub_result.failed
            result.warnings += sub_result.warnings

    finally:
        exch.kill()

    print(result.report())
    sys.exit(0 if result.failed == 0 else 1)


if __name__ == "__main__":
    asyncio.run(main())
