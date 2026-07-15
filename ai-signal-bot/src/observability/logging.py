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
import sys
import os
from typing import Optional

_configured: bool = False


def setup_logging(
    service: str = "ai-signal-bot",
    level: str = "INFO",
    json_logs: bool = False,
    log_file: Optional[str] = None,
) -> None:
    """Configure structured logging for the application."""
    global _configured
    if _configured:
        return

    try:
        import structlog
    except ImportError:
        # Fallback to standard logging
        logging.basicConfig(
            level=getattr(logging, level.upper(), logging.INFO),
            format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            stream=sys.stdout,
        )
        _configured = True
        return

    log_level = getattr(logging, level.upper(), logging.INFO)

    # Shared processors for both structlog and stdlib
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

    # Configure stdlib logging
    handlers = []
    if json_logs:
        formatter = structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=shared_processors,
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                structlog.processors.JSONRenderer(),
            ],
        )
    else:
        formatter = structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=shared_processors,
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                structlog.dev.ConsoleRenderer(colors=sys.stdout.isatty()),
            ],
        )

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    handlers.append(console_handler)

    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(
            structlog.stdlib.ProcessorFormatter(
                foreign_pre_chain=shared_processors,
                processors=[
                    structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                    structlog.processors.JSONRenderer(),
                ],
            )
        )
        handlers.append(file_handler)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    for h in handlers:
        root_logger.addHandler(h)
    root_logger.setLevel(log_level)

    # Reduce noise from libraries
    logging.getLogger("asyncio").setLevel(logging.WARNING)
    logging.getLogger("websockets").setLevel(logging.WARNING)
    logging.getLogger("aiohttp.access").setLevel(logging.WARNING)

    _configured = True


def _add_service_context(service: str):
    """Add service name and version to every log entry."""
    import structlog

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
