"""Run logging — timestamped log files for every service start.

Creates a new log file per run in logs/<service>_<YYYYMMDD_HHMMSS>.log
and a symlink/pointer logs/<service>_latest.log to the most recent.

Usage:
    from run_logger import setup_run_logging
    logger = setup_run_logging("exchange_simulator", level="INFO")
    # ... at shutdown:
    logger.info("Run finished. Log file: logs/exchange_simulator_20250630_025000.log")
"""
import logging
import os
import sys
from datetime import datetime


def setup_run_logging(
    service_name: str,
    level: str = "INFO",
    log_dir: str = None,
    also_latest: bool = True,
) -> tuple[logging.Logger, str]:
    """Configure logging with timestamped file + console output.

    Args:
        service_name: Name used in log filename (e.g. "exchange_simulator")
        level: Logging level (DEBUG, INFO, WARNING, ERROR)
        log_dir: Directory for log files (default: logs/ at project root)
        also_latest: Also write to logs/<service>_latest.log

    Returns:
        (logger, log_file_path)
    """
    if log_dir is None:
        # Find project root (parent of the service directory)
        frame = sys._getframe(1)
        caller_dir = os.path.dirname(os.path.abspath(frame.f_code.co_filename))
        # Walk up to find project root (has .git or docker-compose.yml)
        project_root = caller_dir
        for _ in range(5):
            if os.path.exists(os.path.join(project_root, ".git")) or \
               os.path.exists(os.path.join(project_root, "docker-compose.yml")):
                break
            project_root = os.path.dirname(project_root)
        log_dir = os.path.join(project_root, "logs")

    os.makedirs(log_dir, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_filename = f"{service_name}_{timestamp}.log"
    log_path = os.path.join(log_dir, log_filename)

    log_level = getattr(logging, level.upper(), logging.INFO)

    # Remove existing handlers
    root_logger = logging.getLogger()
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.setLevel(log_level)

    # File handler (timestamped)
    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setFormatter(formatter)
    file_handler.setLevel(log_level)

    root_logger.setLevel(log_level)
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)

    # Also write to _latest.log
    if also_latest:
        latest_path = os.path.join(log_dir, f"{service_name}_latest.log")
        latest_handler = logging.FileHandler(latest_path, mode="w", encoding="utf-8")
        latest_handler.setFormatter(formatter)
        latest_handler.setLevel(log_level)
        root_logger.addHandler(latest_handler)

    logger = logging.getLogger(service_name)
    logger.info(f"Log file: {log_path}")
    return logger, log_path


def get_log_dir() -> str:
    """Return the logs directory path."""
    frame = sys._getframe(1)
    caller_dir = os.path.dirname(os.path.abspath(frame.f_code.co_filename))
    project_root = caller_dir
    for _ in range(5):
        if os.path.exists(os.path.join(project_root, ".git")) or \
           os.path.exists(os.path.join(project_root, "docker-compose.yml")):
            break
        project_root = os.path.dirname(project_root)
    log_dir = os.path.join(project_root, "logs")
    os.makedirs(log_dir, exist_ok=True)
    return log_dir
