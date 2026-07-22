"""Shared timestamped run logging for all Python services.

Creates per-run log files in logs/ with timestamped filenames and a
_latest.log symlink pointing to the most recent run.

Supports both human-readable (text) and structured JSON logging.

Usage:
    from run_logger import setup_run_logging
    logger, log_path = setup_run_logging("exchange_simulator", level="INFO")
    logger, log_path = setup_run_logging("ai_signal_bot", format_type="json")
"""
import json
import logging
import os
import sys
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    """JSON log formatter for structured logging.

    Outputs one JSON object per line with fields:
    ts, level, logger, msg, and optional exception.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds") + "Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry, default=str)


def _project_root() -> str:
    """Auto-detect project root (parent of this file's directory)."""
    return os.path.dirname(os.path.abspath(__file__))


def setup_run_logging(
    service_name: str,
    level: str = "INFO",
    log_dir: str | None = None,
    format_type: str = "text",
) -> tuple[logging.Logger, str]:
    """Setup timestamped logging for a service run.

    Args:
        service_name: Name of the service (e.g. "exchange_simulator", "ai_signal_bot").
        level: Logging level string (DEBUG, INFO, WARNING, ERROR).
        log_dir: Override log directory. Defaults to <project_root>/logs/.
        format_type: 'json' for structured JSON logs, 'text' for human-readable.

    Returns:
        Tuple of (configured logger, absolute log file path).
    """
    root = _project_root()
    if log_dir is None:
        log_dir = os.path.join(root, "logs")
    os.makedirs(log_dir, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_filename = f"{service_name}_{timestamp}.log"
    log_path = os.path.join(log_dir, log_filename)

    # Create logger for this service
    logger = logging.getLogger(service_name)
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Remove existing handlers to avoid duplicates on re-init
    logger.handlers.clear()

    # Select formatter
    if format_type == "json":
        formatter = JsonFormatter()
    else:
        formatter = logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    # File handler
    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setLevel(getattr(logging, level.upper(), logging.INFO))
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    # Console handler (always text for readability)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, level.upper(), logging.INFO))
    console_formatter = logging.Formatter(
        "[%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)

    # Create _latest.log symlink (or copy on Windows)
    latest_path = os.path.join(log_dir, f"{service_name}_latest.log")
    try:
        if os.path.islink(latest_path) or os.path.exists(latest_path):
            os.remove(latest_path)
        os.symlink(log_path, latest_path)
    except (OSError, NotImplementedError):
        # Windows: symlink may fail without admin privileges, create a plain file
        try:
            with open(latest_path, "w", encoding="utf-8") as f:
                f.write(log_path + "\n")
        except OSError:
            pass

    logger.info(f"Log started: {log_path} (format={format_type})")
    return logger, log_path
