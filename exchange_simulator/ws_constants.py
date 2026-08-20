"""Shared constants and utilities for WebSocket server modules.

Extracted from websocket_server.py to avoid circular imports between
the main module and mixin modules.
"""
import logging

try:
    from websockets import ServerConnection as WebSocketServerConnection  # noqa: F401
except ImportError:
    WebSocketServerConnection = None  # type: ignore[assignment,misc]

try:
    import msgpack  # noqa: F401
    _HAS_MSGPACK = True
except ImportError:
    _HAS_MSGPACK = False

try:
    import orjson  # noqa: F401
    _HAS_ORJSON = True
except ImportError:
    _HAS_ORJSON = False

try:
    import multiprocessing.shared_memory as shm_mod  # noqa: F401
    _HAS_SHM = True
except ImportError:
    _HAS_SHM = False

PROTOCOL_VERSION = 2

logger = logging.getLogger("exchange_simulator.ws")


def _sanitize_log(value) -> str:
    """Sanitize user-controlled values before logging to prevent log injection."""
    return str(value).replace('\n', ' ').replace('\r', ' ')[:200]
