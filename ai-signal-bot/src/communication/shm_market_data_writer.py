"""
SHM market data writer — writes market data to shared memory for C++ consumer.

Python side: creates SHM segment, writes MarketSnapshot structs.
C++ reads market data for signal generation and order routing.
Uses latest-snapshot-wins model (single slot per symbol, seq-guarded).
"""

from __future__ import annotations

import mmap
import os
import struct
import sys

from src.observability.logging import get_logger

from .shm_ring_buffer import MARKET_SNAPSHOT_STRUCT, _mm_barrier

IS_WINDOWS = sys.platform == 'win32'

logger = get_logger(__name__)

# Layout: [num_slots: uint64][SnapshotSlot 0][SnapshotSlot 1]...
# SnapshotSlot: [seq: uint64][MarketSnapshotMsg: 28 bytes][padding: 28 bytes] = 64 bytes
SLOT_SIZE = 64
SLOT_OFFSET_SEQ = 0
SLOT_OFFSET_DATA = 8


class ShmMarketDataWriter:
    """Writes market snapshots to SHM for C++ to read (latest-wins per symbol)."""

    def __init__(self, name: str = "/hft_market", max_symbols: int = 10):
        self.name = name
        self.max_symbols = max_symbols
        self._fd = -1
        self._mm: mmap.mmap | None = None
        self._total_size = 0

    def init(self) -> bool:
        """Create the SHM segment."""
        try:
            self._total_size = 8 + self.max_symbols * SLOT_SIZE
            if IS_WINDOWS:
                tag = self.name.lstrip("/")
                self._mm = mmap.mmap(-1, self._total_size, tagname=tag,
                                     access=mmap.ACCESS_WRITE)
                self._fd = -1
            else:
                self._fd = os.open(f"/dev/shm{self.name}", os.O_CREAT | os.O_RDWR, 0o600)  # nosec: B108  # codeql[py/overly-permissive-file-permission]
                os.ftruncate(self._fd, self._total_size)
                self._mm = mmap.mmap(
                    self._fd, self._total_size, mmap.MAP_SHARED,
                    mmap.PROT_READ | mmap.PROT_WRITE,
                )
            # Zero out
            self._mm[0:self._total_size] = b'\x00' * self._total_size
            # Write num_slots
            struct.pack_into('<Q', self._mm, 0, self.max_symbols)
            logger.info("SHM market data writer initialized: %s (%s symbols)", self.name, self.max_symbols)
            return True
        except (OSError, ValueError, FileNotFoundError) as e:
            logger.error("Failed to init SHM market data writer: %s", e)
            return False

    def write_snapshot(
        self,
        symbol_id: int,
        timestamp_ns: int,
        bid: float,
        ask: float,
        last: float,
        volume: float,
    ):
        """Write a market snapshot for a symbol (lock-free, seq-guarded)."""
        if not self._mm or symbol_id >= self.max_symbols:
            return

        slot_offset = 8 + symbol_id * SLOT_SIZE

        # Read current seq
        seq = struct.unpack_from('<Q', self._mm, slot_offset + SLOT_OFFSET_SEQ)[0]
        # Increment before write (odd = write in progress)
        struct.pack_into('<Q', self._mm, slot_offset + SLOT_OFFSET_SEQ, seq + 1)
        _mm_barrier(self._mm)  # Ensure seq is visible before data (ARM ordering)

        # Write data
        MARKET_SNAPSHOT_STRUCT.pack_into(
            self._mm,
            slot_offset + SLOT_OFFSET_DATA,
            timestamp_ns, symbol_id, bid, ask, last, volume,
        )

        # Increment after write (even = consistent)
        _mm_barrier(self._mm)  # Ensure data is visible before seq+2 (ARM ordering)
        struct.pack_into('<Q', self._mm, slot_offset + SLOT_OFFSET_SEQ, seq + 2)

    def write_price(self, symbol_id: int, bid: float, ask: float,
                    last: float, volume: float = 0.0):
        """Convenience: write current prices with current timestamp."""
        import time
        self.write_snapshot(symbol_id, time.time_ns(), bid, ask, last, volume)

    def close(self):
        """Close and unlink SHM segment."""
        if self._mm:
            self._mm.close()
            self._mm = None
        if not IS_WINDOWS and self._fd >= 0:
            os.close(self._fd)
            self._fd = -1
        if not IS_WINDOWS:
            try:
                os.remove(f"/dev/shm{self.name}")  # nosec: B108
            except FileNotFoundError:
                pass

    def __enter__(self):
        self.init()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
