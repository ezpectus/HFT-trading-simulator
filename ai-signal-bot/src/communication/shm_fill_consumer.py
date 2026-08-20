"""
SHM fill consumer — reads fills from C++ via shared memory.

Python side: opens existing SHM segment created by C++, polls for fills.
Used for persistence (PostgreSQL) and dashboard updates.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

from .shm_ring_buffer import FILL_STRUCT, ShmRingBuffer

logger = logging.getLogger(__name__)


class ShmFillConsumer:
    """Reads execution fills from C++ HFT trade bot via SHM."""

    def __init__(self, name: str = "/hft_fills", capacity: int = 4096):
        self.name = name
        self.capacity = capacity
        self._buffer: ShmRingBuffer | None = None
        self._running = False

    def init(self) -> bool:
        """Open existing SHM segment (C++ creates it)."""
        try:
            self._buffer = ShmRingBuffer(
                name=self.name,
                element_struct=FILL_STRUCT,
                capacity=self.capacity,
                create=False,
            )
            logger.info(f"SHM fill consumer initialized: {self.name}")
            return True
        except Exception as e:
            logger.error(f"Failed to init SHM fill consumer: {e}")
            return False

    def try_pop(self) -> tuple | None:
        """Non-blocking pop of a single fill. Returns None if empty."""
        if not self._buffer:
            return None
        return self._buffer.try_pop()

    def bulk_pop(self, max_count: int = 256) -> list[tuple]:
        """Pop up to max_count fills. Returns list of unpacked tuples."""
        if not self._buffer:
            return []
        return self._buffer.bulk_pop(max_count)

    def pending(self) -> int:
        """Number of fills not yet consumed."""
        return self._buffer.size() if self._buffer else 0

    async def run_polling(
        self,
        callback: Callable[[list[tuple]], None],
        poll_interval: float = 0.001,
        batch_size: int = 256,
    ):
        """
        Async polling loop: periodically pop fills and invoke callback.

        Args:
            callback: Called with list of fill tuples
            poll_interval: Seconds between polls (default 1ms)
            batch_size: Max fills per poll
        """
        self._running = True
        logger.info("SHM fill consumer polling started")
        while self._running:
            fills = self.bulk_pop(batch_size)
            if fills:
                callback(fills)
            await asyncio.sleep(poll_interval)
        logger.info("SHM fill consumer polling stopped")

    def stop(self):
        """Stop the polling loop."""
        self._running = False

    def close(self):
        """Close SHM segment."""
        if self._buffer:
            self._buffer.close()
            self._buffer = None

    def __enter__(self):
        self.init()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
