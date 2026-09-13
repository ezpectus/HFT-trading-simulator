"""
SHM kill-switch consumer — reads kill-switch notifications from C++ via shared memory.

Python side: opens existing SHM segment created by C++, polls for activations.
On activation the bot records metrics, alerts, and stops pushing signals to a
dead HFT process.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable

from src.observability.logging import get_logger

from .shm_ring_buffer import KILL_SWITCH_STRUCT, ShmRingBuffer

logger = get_logger(__name__)

REASON_NAMES = {
    0: "manual",
    1: "daily_loss",
    2: "max_drawdown",
    3: "margin_call",
    4: "file_trigger",
}


class ShmKillSwitchConsumer:
    """Reads kill-switch activations from the C++ HFT trade bot via SHM."""

    def __init__(self, name: str = "/hft_kill_switch", capacity: int = 64):
        self.name = name
        self.capacity = capacity
        self._buffer: ShmRingBuffer | None = None
        self._running = False
        self.last_reason: int | None = None
        self.activated = False

    def init(self) -> bool:
        """Open existing SHM segment (C++ creates it)."""
        try:
            self._buffer = ShmRingBuffer(
                name=self.name,
                element_struct=KILL_SWITCH_STRUCT,
                capacity=self.capacity,
                create=False,
            )
            logger.info("SHM kill-switch consumer initialized: %s", self.name)
            return True
        except (OSError, RuntimeError, ValueError) as e:
            logger.error("Failed to init SHM kill-switch consumer: %s", e)
            return False

    def try_pop(self) -> tuple | None:
        """Non-blocking pop of a single activation. Returns None if empty."""
        if not self._buffer:
            return None
        return self._buffer.try_pop()

    async def run_polling(
        self,
        callback: Callable[[int, int], None],
        poll_interval: float = 0.05,
    ):
        """Async polling loop: pop activations, invoke callback(ts_ns, reason)."""
        self._running = True
        logger.info("SHM kill-switch polling started")
        while self._running:
            msg = self.try_pop()
            if msg:
                ts_ns, active, reason = msg
                self.activated = bool(active)
                self.last_reason = reason
                callback(ts_ns, reason)
            await asyncio.sleep(poll_interval)
        logger.info("SHM kill-switch polling stopped")

    def stop(self):
        """Stop the polling loop."""
        self._running = False

    def close(self):
        """Close SHM segment."""
        if self._buffer:
            self._buffer.close()
            self._buffer = None
