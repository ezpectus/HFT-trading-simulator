"""
Structured logging setup using structlog.

Provides JSON-formatted logs with:
- Correlation IDs (trace_id, span_id)
- Contextual fields (service, version)
- Async-safe configuration
- Console (dev) and JSON (prod) renderers

Usage:
    from src.observability.logging import setup_logging, get_logger

    setup_logging(service="ai-signal-bot", level="INFO", json_logs=True)
    log = get_logger(__name__)
    log.info("signal_generated", symbol="BTC/USDT", confidence=0.85)
"""

from __future__ import annotations

import logging
import os
import sys
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import structlog

_configured: bool = False


def setup_logging(
    service: str = "ai-signal-bot",
    level: str = "INFO",
    json_logs: bool = False,
    log_file: str | None = None,
) -> None:
    """Configure structured logging for the application."""
    global _configured
    if _configured:
        return

    try:
        import structlog
    except ImportError:
        logging.basicConfig(
            level=getattr(logging, level.upper(), logging.INFO),
            format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            stream=sys.stdout,
        )
        _configured = True
        return

    log_level = getattr(logging, level.upper(), logging.INFO)
    shared_processors = _configure_structlog(service, structlog)
    handlers = _setup_handlers(
        json_logs, log_file, shared_processors, structlog
    )

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    for h in handlers:
        root_logger.addHandler(h)
    root_logger.setLevel(log_level)

    _suppress_library_noise()
    _configured = True


def _configure_structlog(service: str, structlog) -> list:
    """Configure structlog and return shared processors list."""
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        _add_service_context(service),
    ]
    structlog.configure(
        processors=shared_processors + [
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
    return shared_processors


def _create_formatter(
    json_logs: bool, shared_processors: list, structlog
) -> structlog.stdlib.ProcessorFormatter:
    """Create a ProcessorFormatter for JSON or console output."""
    processors = [
        structlog.stdlib.ProcessorFormatter.remove_processors_meta,
    ]
    if json_logs:
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer(colors=sys.stdout.isatty()))
    return structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=processors,
    )


def _setup_handlers(
    json_logs: bool,
    log_file: str | None,
    shared_processors: list,
    structlog,
) -> list[logging.Handler]:
    """Create console and optional file handlers."""
    formatter = _create_formatter(json_logs, shared_processors, structlog)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    handlers: list[logging.Handler] = [console_handler]

    if log_file:
        file_formatter = _create_formatter(True, shared_processors, structlog)
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(file_formatter)
        handlers.append(file_handler)

    return handlers


def _suppress_library_noise() -> None:
    """Reduce log noise from common libraries."""
    logging.getLogger("asyncio").setLevel(logging.WARNING)
    logging.getLogger("websockets").setLevel(logging.WARNING)
    logging.getLogger("aiohttp.access").setLevel(logging.WARNING)


def _add_service_context(service: str):
    """Add service name and version to every log entry."""

    def processor(logger, method_name, event_dict):
        event_dict["service"] = service
        event_dict["version"] = os.environ.get("APP_VERSION", "1.0.0")
        return event_dict

    return processor


def get_logger(name: str = __name__):
    """Get a structured logger instance."""
    try:
        import structlog
        return structlog.get_logger(name)
    except ImportError:
        return logging.getLogger(name)


def bind_context(**kwargs) -> None:
    """Bind contextual fields to all subsequent log entries in this async context."""
    try:
        import structlog
        structlog.contextvars.bind_contextvars(**kwargs)
    except ImportError:
        pass


def clear_context() -> None:
    """Clear all bound context variables."""
    try:
        import structlog
        structlog.contextvars.clear_contextvars()
    except ImportError:
        pass
