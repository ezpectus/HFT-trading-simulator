"""CSV trade logger — writes every fill/trade to a timestamped CSV file.

Creates logs/trades_<YYYYMMDD_HHMMSS>.csv with columns:
  timestamp, exchange, symbol, side, type, price, quantity, fee, order_id, status

Also maintains logs/trades_latest.csv (overwritten each run).

Usage:
    from trade_csv_logger import TradeCsvLogger
    logger = TradeCsvLogger()
    logger.log_fill({
        "timestamp": time.time(),
        "exchange": "binance",
        "symbol": "BTC/USDT",
        "side": "BUY",
        "type": "market",
        "price": 65000.5,
        "quantity": 0.1,
        "fee": 0.4875,
        "order_id": "abc123",
        "status": "filled",
    })
"""
import csv
import os
import threading
from datetime import datetime

FIELDNAMES = [
    "timestamp", "datetime", "exchange", "symbol", "side", "type",
    "price", "quantity", "fee", "order_id", "status",
]


class TradeCsvLogger:
    """Thread-safe CSV trade logger with timestamped filenames."""

    def __init__(self, log_dir: str = None):
        if log_dir is None:
            # Find project root
            caller_dir = os.path.dirname(os.path.abspath(
                __import__('sys')._getframe(1).f_code.co_filename
            ))
            project_root = caller_dir
            for _ in range(5):
                if os.path.exists(os.path.join(project_root, ".git")) or \
                   os.path.exists(os.path.join(project_root, "docker-compose.yml")):
                    break
                project_root = os.path.dirname(project_root)
            log_dir = os.path.join(project_root, "logs")

        os.makedirs(log_dir, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.csv_path = os.path.join(log_dir, f"trades_{timestamp}.csv")
        self.latest_path = os.path.join(log_dir, "trades_latest.csv")
        self._lock = threading.Lock()
        self._row_count = 0

        # Write headers
        for path in [self.csv_path, self.latest_path]:
            with open(path, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
                writer.writeheader()

    def log_fill(self, trade: dict) -> None:
        """Log a single trade/fill to the CSV file."""
        row = {
            "timestamp": trade.get("timestamp", ""),
            "datetime": datetime.utcnow().isoformat() if not trade.get("datetime") else trade["datetime"],
            "exchange": trade.get("exchange", ""),
            "symbol": trade.get("symbol", ""),
            "side": trade.get("side", ""),
            "type": trade.get("type", ""),
            "price": trade.get("price", ""),
            "quantity": trade.get("quantity", ""),
            "fee": trade.get("fee", ""),
            "order_id": trade.get("order_id", ""),
            "status": trade.get("status", "filled"),
        }

        with self._lock:
            for path in [self.csv_path, self.latest_path]:
                with open(path, "a", newline="", encoding="utf-8") as f:
                    writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
                    writer.writerow(row)
            self._row_count += 1

    def log_batch(self, trades: list[dict]) -> None:
        """Log multiple trades at once."""
        with self._lock:
            for path in [self.csv_path, self.latest_path]:
                with open(path, "a", newline="", encoding="utf-8") as f:
                    writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
                    for trade in trades:
                        row = {
                            "timestamp": trade.get("timestamp", ""),
                            "datetime": datetime.utcnow().isoformat() if not trade.get("datetime") else trade["datetime"],
                            "exchange": trade.get("exchange", ""),
                            "symbol": trade.get("symbol", ""),
                            "side": trade.get("side", ""),
                            "type": trade.get("type", ""),
                            "price": trade.get("price", ""),
                            "quantity": trade.get("quantity", ""),
                            "fee": trade.get("fee", ""),
                            "order_id": trade.get("order_id", ""),
                            "status": trade.get("status", "filled"),
                        }
                        writer.writerow(row)
            self._row_count += len(trades)

    @property
    def row_count(self) -> int:
        return self._row_count

    @property
    def path(self) -> str:
        return self.csv_path
