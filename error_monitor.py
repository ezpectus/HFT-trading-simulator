"""Error Monitor — unified error/warning viewer for all services.

Tails log files from Exchange Simulator, AI Signal Bot, and HFT Trade Bot,
filtering for errors and warnings only. Displays them in a single terminal.

Usage:
    python error_monitor.py
"""
import os
import sys
import time
from datetime import datetime
from collections import defaultdict

ROOT = os.path.dirname(os.path.abspath(__file__))

LOG_SOURCES = {
    "Exchange Sim": os.path.join(ROOT, "exchange-simulator", "logs", "exchange_simulator.log"),
    "AI Signal Bot": os.path.join(ROOT, "ai-signal-bot", "logs", "ai_signal_bot.log"),
    "HFT Trade Bot": os.path.join(ROOT, "hft-trade-bot", "logs", "hft_trade_bot.log"),
}

ERROR_KEYWORDS = ["error", "exception", "traceback", "failed", "critical", "fatal"]
WARN_KEYWORDS = ["warn", "deprecated", "timeout", "retry", "reconnect"]

def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")

def is_error(line):
    lower = line.lower()
    return any(kw in lower for kw in ERROR_KEYWORDS)

def is_warning(line):
    lower = line.lower()
    return any(kw in lower for kw in WARN_KEYWORDS) and not is_error(line)

def read_errors(path, max_lines=50):
    """Read lines containing errors/warnings from log file."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
        filtered = []
        for line in all_lines:
            if is_error(line) or is_warning(line):
                filtered.append(line.rstrip())
        return filtered[-max_lines:]
    except (FileNotFoundError, PermissionError):
        return None  # None = file not found, [] = no errors

def monitor():
    print(f"\n{'=' * 60}")
    print(f"  UNIFIED ERROR MONITOR — All Services")
    print(f"{'=' * 60}\n")
    print(f"  Monitoring {len(LOG_SOURCES)} log sources...")
    print(f"  Press Ctrl+C to stop.\n")

    while True:
        clear_screen()

        all_errors = []
        source_status = {}

        for name, path in LOG_SOURCES.items():
            exists = os.path.exists(path)
            source_status[name] = exists
            if not exists:
                continue
            errors = read_errors(path, 30)
            if errors:
                for line in errors:
                    all_errors.append((name, line))

        print(f"\n{'=' * 60}")
        print(f"  UNIFIED ERROR MONITOR  {datetime.now().strftime('%H:%M:%S')}")
        print(f"{'=' * 60}\n")

        # Source status
        print(f"  Log Sources:")
        for name, exists in source_status.items():
            color = '\033[92m' if exists else '\033[91m'
            reset = '\033[0m'
            print(f"    {name:20s} {color}{'ACTIVE' if exists else 'NO LOG FILE'}{reset}")
        print()

        # Error count
        error_count = sum(1 for _, line in all_errors if is_error(line))
        warn_count = sum(1 for _, line in all_errors if is_warning(line))
        print(f"  Total Errors:   {error_count}")
        print(f"  Total Warnings: {warn_count}\n")

        # Display errors
        if all_errors:
            print(f"  {'─' * 56}")
            print(f"  Recent Errors & Warnings (last {len(all_errors)}):")
            print(f"  {'─' * 56}")
            for source, line in all_errors[-25:]:
                if len(line) > 70:
                    line = line[:67] + "..."
                if is_error(line):
                    print(f"  \033[91m[{source[:12]:12s}] {line}\033[0m")
                else:
                    print(f"  \033[93m[{source[:12]:12s}] {line}\033[0m")
        else:
            print(f"  {'─' * 56}")
            print(f"  No errors or warnings detected.")
            print(f"  {'─' * 56}")

        print(f"\n{'=' * 60}")

        time.sleep(3)

if __name__ == "__main__":
    try:
        monitor()
    except KeyboardInterrupt:
        print("\nError monitor stopped.")
