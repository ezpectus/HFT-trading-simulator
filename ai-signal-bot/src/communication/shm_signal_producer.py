"""
SHM signal producer — writes signals to shared memory for C++ consumer.

Python side: creates SHM segment, packs Signal structs, pushes to ring buffer.
C++ reads signals and executes orders.
"""

from __future__ import annotations

import time
import logging
from typing import Optional
from .shm_ring_buffer import ShmRingBuffer, SIGNAL_STRUCT

logger = logging.getLogger(__name__)


class ShmSignalProducer:
    """Writes trading signals to SHM for C++ HFT trade bot to consume."""

    def __init__(self, name: str = "/hft_signals", capacity: int = 4096):
        self.name = name
        self.capacity = capacity
        self._buffer: Optional[ShmRingBuffer] = None

    def init(self) -> bool:
        """Create the SHM segment. Must be called before push."""
        try:
            self._buffer = ShmRingBuffer(
                name=self.name,
                element_struct=SIGNAL_STRUCT,
                capacity=self.capacity,
                create=True,
            )
            logger.info(f"SHM signal producer initialized: {self.name} (cap={self.capacity})")
            return True
        except Exception as e:
            logger.error(f"Failed to init SHM signal producer: {e}")
            return False

    def push_signal(
        self,
        timestamp_ns: int,
        symbol_id: int,
        action: int,
        confidence: float,
        price: float,
        sl: float,
        tp: float,
        leverage: int = 1,
    ) -> bool:
        """Push a signal to the SHM ring buffer. Non-blocking."""
        if not self._buffer:
            return False
        return self._buffer.try_push(
            (timestamp_ns, symbol_id, action, confidence, price, sl, tp, leverage)
        )

    def push_signal_dict(self, signal: dict, symbol_map: dict) -> bool:
        """Push a signal from a dict (as produced by strategy engine)."""
        symbol_id = symbol_map.get(signal.get("symbol", "BTC"), 0)
        action = 0
        if signal.get("direction") == "LONG":
            action = 1
        elif signal.get("direction") == "SHORT":
            action = 2

        ts = int(signal.get("timestamp", time.time_ns()))
        confidence = float(signal.get("confidence", 0.0)) / 100.0
        price = float(signal.get("entry_price", signal.get("price", 0.0)))
        sl = float(signal.get("stop_loss", 0.0))
        tp = float(signal.get("take_profit", 0.0))
        leverage = int(signal.get("leverage", 1))

        return self.push_signal(ts, symbol_id, action, confidence, price, sl, tp, leverage)

    def bulk_push(self, signals: list[tuple]) -> int:
        """Push multiple signals at once. Returns number pushed."""
        if not self._buffer:
            return 0
        return self._buffer.bulk_push(signals)

    def pending(self) -> int:
        """Number of signals not yet consumed by C++."""
        return self._buffer.size() if self._buffer else 0

    def close(self):
        """Close and unlink SHM segment."""
        if self._buffer:
            self._buffer.unlink()
            self._buffer = None

    def __enter__(self):
        self.init()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
