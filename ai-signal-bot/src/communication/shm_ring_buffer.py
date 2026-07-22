"""
Shared memory SPSC lock-free ring buffer for Python ↔ C++ IPC.

Mirror of C++ ShmRingBuffer<T> using mmap + ctypes for atomic operations.
Same binary layout: [ShmHeader][Element 0]...[Element N-1]

Header: magic, capacity, element_size, total_size, head (atomic), tail (atomic)
head/tail are cache-line aligned (alignas(64)) to prevent false sharing.

Single-producer single-consumer: Python pushes, C++ pops (or vice versa).
All operations are O(1) and non-blocking.
"""

from __future__ import annotations

import ctypes
import mmap
import os
import struct
import sys
from typing import TypeVar

# Atomic helpers: use ctypes for aligned atomic-like reads/writes
# On x86/x64, aligned 8-byte reads/writes are naturally atomic.
# We use ctypes.c_uint64 to ensure aligned access.
# For cross-process visibility, we rely on mmap flush/msync.

IS_WINDOWS = sys.platform == 'win32'

# Memory barrier: force store ordering for cross-process visibility
if IS_WINDOWS:
    def _mm_barrier(mm):
        """Flush modified pages to file for cross-process visibility."""
        try:
            ctypes.windll.kernel32.FlushViewOfFile(mm._mapped_view, ctypes.c_size_t(8))
        except Exception:
            pass
else:
    def _mm_barrier(mm):
        """msync to force visibility across processes."""
        try:
            mm.flush()
        except Exception:
            pass

def _atomic_read_u64(mm, offset):
    """Read a uint64 from shared memory (aligned, naturally atomic on x86/x64)."""
    return struct.unpack_from('<Q', mm, offset)[0]

def _atomic_write_u64(mm, offset, value):
    """Write a uint64 to shared memory with release semantics.
    On x86/x64, aligned 8-byte stores are naturally atomic and have
    release ordering. We flush the page for cross-process visibility."""
    struct.pack_into('<Q', mm, offset, value)
    _mm_barrier(mm)

T = TypeVar('T')

SHM_MAGIC = 0x484654343253484D  # "HFT42SHM"
SHM_HEADER_SIZE = 128  # 2 cache lines

# Binary layout (3 cache lines = 192 bytes due to alignas(64) on head and tail):
#   offset 0:   magic (uint64)
#   offset 8:   capacity (uint64)
#   offset 16:  element_size (uint64)
#   offset 24:  total_size (uint64)
#   offset 32:  padding (32 bytes)
#   offset 64:  head (uint64, alignas(64))
#   offset 72:  padding (56 bytes)
#   offset 128: tail (uint64, alignas(64))
#   offset 136: padding (48 bytes)
# Total header = 192 bytes

SHM_HEADER_ACTUAL_SIZE = 192  # 3 cache lines

# Offsets
OFF_MAGIC = 0
OFF_CAPACITY = 8
OFF_ELEMENT_SIZE = 16
OFF_TOTAL_SIZE = 24
OFF_HEAD = 64    # alignas(64)
OFF_TAIL = 128   # alignas(64)


class ShmRingBuffer[T]:
    """
    Shared memory SPSC ring buffer.

    Args:
        name: POSIX shared memory name (e.g. "/hft_signals")
        element_struct: struct.Struct for packing/unpacking elements
        capacity: Number of elements (must be power of 2)
        create: True to create (producer), False to open existing (consumer)
    """

    def __init__(self, name: str, element_struct: struct.Struct,
                 capacity: int, create: bool = True):
        if capacity <= 0 or (capacity & (capacity - 1)) != 0:
            raise ValueError("capacity must be power of 2")

        self.name = name
        self.capacity = capacity
        self.element_size = element_struct.size
        self.element_struct = element_struct
        self._owns = create

        data_size = capacity * self.element_size
        total_size = SHM_HEADER_ACTUAL_SIZE + data_size
        self._total_size = total_size

        if IS_WINDOWS:
            # Windows: page-file-backed shared memory via mmap tagname
            tag = name.lstrip("/")
            access = mmap.ACCESS_WRITE
            if create:
                self._mm = mmap.mmap(-1, total_size, tagname=tag, access=access)
            else:
                # On Windows, mmap with tagname creates the section if it doesn't exist.
                # We validate after mapping and raise if magic doesn't match.
                self._mm = mmap.mmap(-1, total_size, tagname=tag, access=access)
                magic = struct.unpack_from('<Q', self._mm, OFF_MAGIC)[0]
                if magic != SHM_MAGIC:
                    self._mm.close()
                    self._mm = None
                    raise ValueError(f"SHM segment not initialized: {name} (magic mismatch)")
            self._fd = -1  # No file descriptor on Windows
        else:
            # POSIX: use /dev/shm
            if create:
                self._fd = os.open(f"/dev/shm{name}", os.O_CREAT | os.O_RDWR, 0o666)
                os.ftruncate(self._fd, total_size)
            else:
                self._fd = os.open(f"/dev/shm{name}", os.O_RDWR, 0o666)

            self._mm = mmap.mmap(self._fd, total_size, mmap.MAP_SHARED,
                                 mmap.PROT_READ | mmap.PROT_WRITE)

        if create:
            # Initialize header
            struct.pack_into('<Q', self._mm, OFF_MAGIC, SHM_MAGIC)
            struct.pack_into('<Q', self._mm, OFF_CAPACITY, capacity)
            struct.pack_into('<Q', self._mm, OFF_ELEMENT_SIZE, self.element_size)
            struct.pack_into('<Q', self._mm, OFF_TOTAL_SIZE, total_size)
            struct.pack_into('<Q', self._mm, OFF_HEAD, 0)
            struct.pack_into('<Q', self._mm, OFF_TAIL, 0)
        else:
            # Validate
            magic = struct.unpack_from('<Q', self._mm, OFF_MAGIC)[0]
            if magic != SHM_MAGIC:
                self.close()
                raise ValueError(f"SHM magic mismatch: {name}")

            stored_capacity = struct.unpack_from('<Q', self._mm, OFF_CAPACITY)[0]
            stored_elem_size = struct.unpack_from('<Q', self._mm, OFF_ELEMENT_SIZE)[0]
            if stored_capacity != capacity:
                self.close()
                raise ValueError(
                    f"SHM capacity mismatch: {name} (expected {capacity}, got {stored_capacity})"
                )
            if stored_elem_size != self.element_size:
                self.close()
                raise ValueError(
                    f"SHM element_size mismatch: {name} (expected {self.element_size}, got {stored_elem_size})"
                )

        self._mask = capacity - 1
        self._data_offset = SHM_HEADER_ACTUAL_SIZE

    def try_push(self, item: tuple) -> bool:
        """Non-blocking push. Returns False if buffer is full."""
        head = _atomic_read_u64(self._mm, OFF_HEAD)
        tail = _atomic_read_u64(self._mm, OFF_TAIL)

        if head - tail >= self.capacity:
            return False

        slot = head & self._mask
        offset = self._data_offset + slot * self.element_size
        self.element_struct.pack_into(self._mm, offset, *item)

        _atomic_write_u64(self._mm, OFF_HEAD, head + 1)
        return True

    def try_pop(self) -> tuple | None:
        """Non-blocking pop. Returns None if buffer is empty."""
        tail = _atomic_read_u64(self._mm, OFF_TAIL)
        head = _atomic_read_u64(self._mm, OFF_HEAD)

        if head == tail:
            return None

        slot = tail & self._mask
        offset = self._data_offset + slot * self.element_size
        item = self.element_struct.unpack_from(self._mm, offset)

        _atomic_write_u64(self._mm, OFF_TAIL, tail + 1)
        return item

    def bulk_push(self, items: list[tuple]) -> int:
        """Push up to len(items) items. Returns number actually pushed."""
        head = _atomic_read_u64(self._mm, OFF_HEAD)
        tail = _atomic_read_u64(self._mm, OFF_TAIL)

        available = self.capacity - (head - tail)
        to_push = min(len(items), available)

        for i in range(to_push):
            slot = (head + i) & self._mask
            offset = self._data_offset + slot * self.element_size
            self.element_struct.pack_into(self._mm, offset, *items[i])

        _atomic_write_u64(self._mm, OFF_HEAD, head + to_push)
        return to_push

    def bulk_pop(self, max_count: int) -> list[tuple]:
        """Pop up to max_count items. Returns list of unpacked tuples."""
        tail = _atomic_read_u64(self._mm, OFF_TAIL)
        head = _atomic_read_u64(self._mm, OFF_HEAD)

        available = head - tail
        to_pop = min(max_count, available)
        result = []

        for i in range(to_pop):
            slot = (tail + i) & self._mask
            offset = self._data_offset + slot * self.element_size
            result.append(self.element_struct.unpack_from(self._mm, offset))

        _atomic_write_u64(self._mm, OFF_TAIL, tail + to_pop)
        return result

    def size(self) -> int:
        """Current number of elements in the buffer."""
        head = _atomic_read_u64(self._mm, OFF_HEAD)
        tail = _atomic_read_u64(self._mm, OFF_TAIL)
        return head - tail

    def empty(self) -> bool:
        return self.size() == 0

    def full(self) -> bool:
        return self.size() >= self.capacity

    def close(self):
        """Close mmap and file descriptor."""
        if self._mm:
            self._mm.close()
            self._mm = None
        if not IS_WINDOWS and self._fd >= 0:
            os.close(self._fd)
            self._fd = -1

    def unlink(self):
        """Unlink the shared memory segment (after all processes are done)."""
        self.close()
        if self._owns:
            if not IS_WINDOWS:
                try:
                    os.remove(f"/dev/shm{self.name}")
                except FileNotFoundError:
                    pass
            self._owns = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def __del__(self):
        self.close()


# ─────────────────────────────────────────────────────────────────────────────
# Struct definitions matching C++ layout exactly (pragma pack(push, 1))
# ─────────────────────────────────────────────────────────────────────────────

# Signal struct (32 bytes): timestamp, symbol_id, action, confidence, price, sl, tp, leverage
SIGNAL_STRUCT = struct.Struct('<Q B B f f f f B 5x')  # 32 bytes

# Fill struct (28 bytes): timestamp, symbol_id, side, qty, price, fee, exchange_id
FILL_STRUCT = struct.Struct('<Q B B f f f B 5x')  # 28 bytes

# MarketSnapshot struct (28 bytes): timestamp, symbol_id, bid, ask, last, volume
MARKET_SNAPSHOT_STRUCT = struct.Struct('<Q B 3x f f f f')  # 28 bytes
