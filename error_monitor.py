"""Unified Error Monitor — tails all service logs for ERROR/WARN lines.

Monitors log files from all 3 services in real-time and displays
colorized error/warning output in a terminal dashboard.

Usage:
    python error_monitor.py
    python error_monitor.py --follow     # Follow mode (tail -f)
    python error_monitor.py --since 5m   # Show errors from last 5 minutes
"""
import argparse
import os
import re
import sys
import time
from datetime import datetime, timedelta

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(PROJECT_ROOT, "logs")

SERVICES = {
    "exchange_simulator": "Exchange Simulator",
    "ai_signal_bot": "AI Signal Bot",
    "hft_trade_bot": "HFT Trade Bot",
}

ERROR_PATTERN = re.compile(
    r'\b(ERROR|CRITICAL|FATAL|Traceback|Exception)\b',
    re.IGNORECASE,
)
WARN_PATTERN = re.compile(
    r'\b(WARN|WARNING)\b',
    re.IGNORECASE,
)

COLORS = {
    "RED": "\033[91m",
    "YELLOW": "\033[93m",
    "CYAN": "\033[96m",
    "GREEN": "\033[92m",
    "RESET": "\033[0m",
    "BOLD": "\033[1m",
}


def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")


def colorize(text, color):
    if not sys.stdout.isatty():
        return text
    return f"{COLORS.get(color, '')}{text}{COLORS['RESET']}"


def find_log_files():
    """Find all log files in logs/ directory."""
    files = {}
    if not os.path.isdir(LOG_DIR):
        return files
    for filename in os.listdir(LOG_DIR):
        if filename.endswith(".log"):
            for key, label in SERVICES.items():
                if key in filename.lower():
                    files[filename] = os.path.join(LOG_DIR, filename)
                    break
    return files


def parse_timestamp(line):
    """Try to extract timestamp from log line."""
    ts_patterns = [
        r'(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2})',
        r'\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]',
        r'(\d{2}:\d{2}:\d{2})',
    ]
    for pattern in ts_patterns:
        match = re.search(pattern, line)
        if match:
            return match.group(1)
    return None


def scan_log_file(filepath, since_minutes=0):
    """Scan a log file for errors and warnings."""
    results = []
    cutoff = datetime.now() - timedelta(minutes=since_minutes) if since_minutes > 0 else None

    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            for line_num, line in enumerate(f, 1):
                line = line.rstrip()
                if not line:
                    continue

                is_error = bool(ERROR_PATTERN.search(line))
                is_warn = bool(WARN_PATTERN.search(line))

                if not is_error and not is_warn:
                    continue

                if cutoff:
                    ts_str = parse_timestamp(line)
                    if ts_str:
                        try:
                            ts = datetime.strptime(ts_str[:19], "%Y-%m-%d %H:%M:%S")
                            if ts < cutoff:
                                continue
                        except ValueError:
                            pass

                results.append({
                    "line_num": line_num,
                    "level": "ERROR" if is_error else "WARN",
                    "text": line,
                })
    except (FileNotFoundError, PermissionError):
        pass

    return results


def print_dashboard(all_results, follow=False):
    """Print the error monitor dashboard."""
    clear_screen()
    total_errors = 0
    total_warns = 0

    print(colorize("=" * 70, "CYAN"))
    print(colorize("  UNIFIED ERROR MONITOR", "BOLD"))
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(colorize("=" * 70, "CYAN"))
    print()

    for filename, filepath in find_log_files().items():
        service_name = "Unknown"
        for key, label in SERVICES.items():
            if key in filename.lower():
                service_name = label
                break

        results = all_results.get(filepath, [])
        errors = [r for r in results if r["level"] == "ERROR"]
        warns = [r for r in results if r["level"] == "WARN"]
        total_errors += len(errors)
        total_warns += len(warns)

        status_color = "RED" if errors else ("YELLOW" if warns else "GREEN")
        status_icon = "✗" if errors else ("⚠" if warns else "✓")
        status_text = "ERRORS" if errors else ("WARNINGS" if warns else "CLEAN")

        print(f"  {colorize(status_icon, status_color)} {colorize(service_name, 'BOLD')} "
              f"[{colorize(status_text, status_color)}] "
              f"E:{len(errors)} W:{len(warns)}")

        recent = results[-10:] if len(results) > 10 else results
        for r in recent:
            level_color = "RED" if r["level"] == "ERROR" else "YELLOW"
            text = r["text"][:120]
            if len(r["text"]) > 120:
                text += "..."
            print(f"    {colorize(r['level'], level_color)} L{r['line_num']}: {text}")

        print()

    print(colorize("-" * 70, "CYAN"))
    print(f"  Total: {colorize(str(total_errors), 'RED')} errors, "
          f"{colorize(str(total_warns), 'YELLOW')} warnings")

    if follow:
        print(colorize("  (Following... Press Ctrl+C to stop)", "GREEN"))
    print()


def main():
    parser = argparse.ArgumentParser(description="Unified Error Monitor")
    parser.add_argument("--follow", "-f", action="store_true", help="Follow mode (continuous refresh)")
    parser.add_argument("--since", type=int, default=0, help="Show errors from last N minutes")
    parser.add_argument("--interval", type=float, default=2.0, help="Refresh interval in seconds (follow mode)")
    args = parser.parse_args()

    if args.follow:
        try:
            while True:
                log_files = find_log_files()
                all_results = {}
                for filename, filepath in log_files.items():
                    all_results[filepath] = scan_log_file(filepath, args.since)
                print_dashboard(all_results, follow=True)
                time.sleep(args.interval)
        except KeyboardInterrupt:
            print("\n  Stopped.")
    else:
        log_files = find_log_files()
        if not log_files:
            print(colorize("No log files found in logs/ directory.", "YELLOW"))
            print(f"  Expected location: {LOG_DIR}")
            return

        all_results = {}
        for filename, filepath in log_files.items():
            all_results[filepath] = scan_log_file(filepath, args.since)
        print_dashboard(all_results, follow=False)


if __name__ == "__main__":
    main()
