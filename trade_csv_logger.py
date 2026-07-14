"""Shared CSV trade logging for all Python services.

Logs every fill, SL/TP close, and arbitrage execution to timestamped CSV
files in logs/ with a _latest.csv symlink.

Usage:
    from trade_csv_logger import TradeCsvLogger
    logger = TradeCsvLogger()
    logger.log_fill({"timestamp": ..., "exchange": ..., "symbol": ..., ...})
"""
import csv
import os
import threading
from datetime import datetime


class TradeCsvLogger:
    """Thread-safe CSV trade logger with timestamped filenames."""

    _CSV_FIELDS = [
        "timestamp",
        "exchange",
        "symbol",
        "side",
        "type",
        "price",
        "quantity",
        "fee",
        "pnl",
        "reason",
    ]

    def __init__(self, log_dir: str = None, service_name: str = "trades") -> None:
        """Initialize the trade CSV logger.

        Args:
            log_dir: Override log directory. Defaults to <project_root>/logs/.
            service_name: Prefix for the CSV filename.
        """
        root = os.path.dirname(os.path.abspath(__file__))
        if log_dir is None:
            log_dir = os.path.join(root, "logs")
        os.makedirs(log_dir, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.path = os.path.join(log_dir, f"{service_name}_{timestamp}.csv")
        self._lock = threading.Lock()
        self._write_header()

        # Create _latest.csv symlink (or plain file on Windows)
        latest_path = os.path.join(log_dir, f"{service_name}_latest.csv")
        try:
            if os.path.islink(latest_path) or os.path.exists(latest_path):
                os.remove(latest_path)
            os.symlink(self.path, latest_path)
        except (OSError, NotImplementedError):
            try:
                with open(latest_path, "w", encoding="utf-8") as f:
                    f.write(self.path + "\n")
            except OSError:
                pass

    def _write_header(self) -> None:
        """Write CSV header row."""
        with open(self.path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=self._CSV_FIELDS)
            writer.writeheader()

    def log_fill(self, data: dict) -> None:
        """Log a single fill/trade to the CSV file.

        Args:
            data: Dict with keys matching _CSV_FIELDS (missing keys default to "").
        """
        row = {k: data.get(k, "") for k in self._CSV_FIELDS}
        with self._lock:
            with open(self.path, "a", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=self._CSV_FIELDS)
                writer.writerow(row)

    def log_batch(self, rows: list[dict]) -> None:
        """Log multiple fills/trades at once.

        Args:
            rows: List of dicts with keys matching _CSV_FIELDS.
        """
        with self._lock:
            with open(self.path, "a", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=self._CSV_FIELDS)
                for data in rows:
                    row = {k: data.get(k, "") for k in self._CSV_FIELDS}
                    writer.writerow(row)
