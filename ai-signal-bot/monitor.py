"""AI Signal Bot Monitor — live status dashboard.

Connects to the AI Signal Bot's signal WebSocket (port 8766) and displays
real-time signal feed, performance stats, and bot health in a terminal.

Usage:
    python monitor.py
"""
import asyncio
import json
import os
from datetime import datetime

import websockets

WS_URL = "ws://localhost:8766"
LOG_FILE = os.path.join(os.path.dirname(__file__), "logs", "ai_signal_bot.log")
SIGNALS_CSV = os.path.join(os.path.dirname(__file__), "logs", "signals.csv")

def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")

def read_log_tail(path, lines=15):
    """Read last N lines from log file."""
    try:
        with open(path, encoding="utf-8") as f:
            all_lines = f.readlines()
        return all_lines[-lines:]
    except (FileNotFoundError, PermissionError):
        return []

def read_signals_tail(path, lines=10):
    """Read last N signal lines from CSV."""
    try:
        with open(path, encoding="utf-8") as f:
            all_lines = f.readlines()
        return all_lines[-lines:]
    except (FileNotFoundError, PermissionError):
        return []

async def monitor():
    print(f"\n{'=' * 60}")
    print("  AI SIGNAL BOT — Live Monitor")
    print(f"  Connecting to {WS_URL} ...")
    print(f"{'=' * 60}\n")

    signals_received = 0
    last_signals = []
    connected = False
    reconnect_delay = 2

    while True:
        try:
            async with websockets.connect(WS_URL) as ws:
                connected = True
                reconnect_delay = 2
                print("  [CONNECTED] Listening for signals...\n")

                async for message in ws:
                    try:
                        data = json.loads(message)
                        if "type" in data and data["type"] == "signal":
                            signals_received += 1
                            last_signals.append(data)
                            if len(last_signals) > 20:
                                last_signals = last_signals[-20:]
                    except json.JSONDecodeError:
                        pass

                    # Refresh display
                    clear_screen()
                    print(f"\n{'=' * 60}")
                    print(f"  AI SIGNAL BOT — Live Monitor  {datetime.now().strftime('%H:%M:%S')}")
                    print(f"{'=' * 60}\n")

                    print(f"  Status:     {'CONNECTED' if connected else 'DISCONNECTED'}")
                    print(f"  WS URL:     {WS_URL}")
                    print(f"  Signals:    {signals_received} received\n")

                    # Recent signals
                    if last_signals:
                        print(f"  {'─' * 56}")
                        print("  Recent Signals:")
                        print(f"  {'─' * 56}")
                        for s in last_signals[-8:]:
                            ts = datetime.now().strftime('%H:%M:%S')
                            sym = s.get('symbol', '???')
                            direction = s.get('direction', '???')
                            conf = s.get('confidence', 0)
                            entry = s.get('entry_price', 0)
                            sl = s.get('stop_loss', 0)
                            tp = s.get('take_profit', 0)
                            rr = s.get('rr_ratio', 0)
                            reason = s.get('reason', '')[:30]
                            arrow = '▲' if direction == 'LONG' else '▼' if direction == 'SHORT' else '─'
                            color = '\033[92m' if direction == 'LONG' else '\033[91m' if direction == 'SHORT' else '\033[90m'
                            reset = '\033[0m'
                            print(f"  {ts} {color}{arrow} {direction:5s}{reset} {sym:10s} "
                                  f"conf={conf:5.1f}% entry=${entry:>10.2f} "
                                  f"SL=${sl:>10.2f} TP=${tp:>10.2f} R:R={rr:.2f}")
                            if reason:
                                print(f"         {reason}")
                        print()

                    # Log tail
                    log_lines = read_log_tail(LOG_FILE, 8)
                    if log_lines:
                        print(f"  {'─' * 56}")
                        print("  Bot Log (last 8 lines):")
                        print(f"  {'─' * 56}")
                        for line in log_lines:
                            print(f"  {line.rstrip()[:80]}")
                        print()

                    print(f"{'=' * 60}")
                    await asyncio.sleep(1)

        except (ConnectionRefusedError, OSError, Exception) as e:
            connected = False
            clear_screen()
            print(f"\n{'=' * 60}")
            print(f"  AI SIGNAL BOT — Live Monitor  {datetime.now().strftime('%H:%M:%S')}")
            print(f"{'=' * 60}\n")
            print("  Status:     DISCONNECTED")
            print(f"  Error:      {e}")
            print(f"  Retry in:   {reconnect_delay}s\n")

            # Show log even when disconnected
            log_lines = read_log_tail(LOG_FILE, 15)
            if log_lines:
                print(f"  {'─' * 56}")
                print("  Bot Log (last 15 lines):")
                print(f"  {'─' * 56}")
                for line in log_lines:
                    print(f"  {line.rstrip()[:80]}")
                print()

            # Show CSV signals
            sig_lines = read_signals_tail(SIGNALS_CSV, 5)
            if sig_lines:
                print(f"  {'─' * 56}")
                print("  Recent Signals (CSV):")
                print(f"  {'─' * 56}")
                for line in sig_lines:
                    print(f"  {line.rstrip()[:80]}")
                print()

            print(f"{'=' * 60}")
            await asyncio.sleep(reconnect_delay)
            reconnect_delay = min(reconnect_delay * 2, 30)

if __name__ == "__main__":
    try:
        asyncio.run(monitor())
    except KeyboardInterrupt:
        print("\nMonitor stopped.")
