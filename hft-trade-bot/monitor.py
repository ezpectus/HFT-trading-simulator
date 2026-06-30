"""HFT Trade Bot Monitor — C++ engine status viewer.

Tails the HFT Trade Bot log file and displays real-time status,
trade executions, and errors in a terminal.

Usage:
    python monitor.py
"""
import os
import sys
import time
from datetime import datetime

HFT_LOG = os.path.join(os.path.dirname(__file__), "logs", "hft_trade_bot.log")
HFT_DIR = os.path.join(os.path.dirname(__file__), "build")

def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")

def read_tail(path, lines=30):
    """Read last N lines from a file."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
        return all_lines[-lines:]
    except (FileNotFoundError, PermissionError):
        return []

def check_process():
    """Check if HFT Trade Bot process is running."""
    try:
        if os.name == "nt":
            result = os.popen('tasklist /FI "IMAGENAME eq hft_trade_bot.exe" 2>nul').read()
            return "hft_trade_bot.exe" in result
        else:
            result = os.popen('pgrep -f hft_trade_bot').read()
            return len(result.strip()) > 0
    except Exception:
        return False

def monitor():
    print(f"\n{'=' * 60}")
    print(f"  HFT TRADE BOT (C++) — Status Monitor")
    print(f"{'=' * 60}\n")
    print(f"  Log file:  {HFT_LOG}")
    print(f"  Binary:    {os.path.join(HFT_DIR, 'hft_trade_bot.exe') if os.name == 'nt' else os.path.join(HFT_DIR, 'hft_trade_bot')}")
    print(f"  Starting monitor...\n")

    last_size = 0
    error_count = 0
    warn_count = 0
    trade_count = 0
    signal_count = 0

    while True:
        clear_screen()

        # Check if binary exists
        binary_path = os.path.join(HFT_DIR, "hft_trade_bot.exe") if os.name == "nt" else os.path.join(HFT_DIR, "hft_trade_bot")
        binary_exists = os.path.exists(binary_path)
        process_running = check_process()

        # Read log
        log_lines = read_tail(HFT_LOG, 30)

        # Count errors/warnings/trades in new lines
        current_size = 0
        try:
            current_size = os.path.getsize(HFT_LOG)
        except (FileNotFoundError, OSError):
            pass

        if current_size > last_size and log_lines:
            new_lines = log_lines[-(current_size - last_size) // 50:]  # rough estimate
            for line in log_lines:
                if "[error]" in line.lower() or "ERROR" in line:
                    error_count += 1
                if "[warn]" in line.lower() or "WARN" in line:
                    warn_count += 1
                if "order" in line.lower() and ("filled" in line.lower() or "executed" in line.lower()):
                    trade_count += 1
                if "signal" in line.lower() and "received" in line.lower():
                    signal_count += 1
            last_size = current_size

        print(f"\n{'=' * 60}")
        print(f"  HFT TRADE BOT (C++) — Status Monitor  {datetime.now().strftime('%H:%M:%S')}")
        print(f"{'=' * 60}\n")

        status_color = '\033[92m' if process_running else '\033[91m'
        reset = '\033[0m'
        print(f"  Process:     {status_color}{'RUNNING' if process_running else 'NOT RUNNING'}{reset}")
        print(f"  Binary:      {'EXISTS' if binary_exists else 'NOT BUILT — run cmake build'}")
        print(f"  Log file:    {'EXISTS' if os.path.exists(HFT_LOG) else 'NOT FOUND (bot not started yet)'}")
        print(f"  Log size:    {current_size:,} bytes\n")

        # Stats
        print(f"  {'─' * 56}")
        print(f"  Statistics (session):")
        print(f"  {'─' * 56}")
        print(f"  Signals received:  {signal_count}")
        print(f"  Trades executed:   {trade_count}")
        print(f"  Warnings:          {warn_count}")
        print(f"  Errors:            {error_count}\n")

        # Log output
        if log_lines:
            print(f"  {'─' * 56}")
            print(f"  HFT Bot Log (last 20 lines):")
            print(f"  {'─' * 56}")
            for line in log_lines[-20:]:
                line = line.rstrip()
                if len(line) > 80:
                    line = line[:77] + "..."
                # Color code
                if "[error]" in line.lower() or "ERROR" in line:
                    print(f"  \033[91m{line}\033[0m")
                elif "[warn]" in line.lower() or "WARN" in line:
                    print(f"  \033[93m{line}\033[0m")
                elif "order" in line.lower() or "trade" in line.lower():
                    print(f"  \033[96m{line}\033[0m")
                else:
                    print(f"  {line}")
        else:
            print(f"  {'─' * 56}")
            print(f"  No log file found. Start the HFT Trade Bot first.")
            print(f"  {'─' * 56}")

        print(f"\n{'=' * 60}")

        time.sleep(2)

if __name__ == "__main__":
    try:
        monitor()
    except KeyboardInterrupt:
        print("\nMonitor stopped.")
