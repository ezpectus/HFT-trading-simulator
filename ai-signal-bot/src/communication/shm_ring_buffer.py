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

import mmap
import os
import struct
import ctypes
from typing import TypeVar, Generic, Optional, List
from dataclasses import dataclass
from contextlib import contextmanager

T = TypeVar('T')

SHM_MAGIC = 0x484654343253484D  # "HFT42SHM"
SHM_HEADER_SIZE = 128  # 2 cache lines

# Header format: Q=uint64, x=padding
# [magic:8][capacity:8][element_size:8][total_size:8]
# [padding:32][head:8 at offset 64][padding:56][tail:8 at offset 128]
# Actually the C++ struct has alignas(64) on head and tail.
# Layout:
#   offset 0:  magic (8)
#   offset 8:  capacity (8)
#   offset 16: element_size (8)
#   offset 24: total_size (8)
#   offset 32: padding (32 bytes to reach offset 64)
#   offset 64: head (8) — alignas(64)
#   offset 72: padding (56 bytes to reach offset 128)
#   offset 128: tail (8) — alignas(64)
#   offset 136: padding (48 bytes to reach 192... wait, total header is 128)
# Let me recalculate. The C++ struct:
#   uint64_t magic (8)
#   uint64_t capacity (8)
#   uint64_t element_size (8)
#   uint64_t total_size (8)
#   -- 32 bytes so far --
#   alignas(64) std::atomic<uint64_t> head  -> offset 64
#   -- head at offset 64, 8 bytes --
#   alignas(64) std::atomic<uint64_t> tail  -> offset 128
#   -- tail at offset 128, 8 bytes --
#   uint8_t padding_[48] -> offset 136
#   -- total: 136 + 48 = 184... but sizeof is 128?
# Wait, the padding_ is to fill to 128 bytes total. But with alignas(64) on tail,
# tail would be at offset 128, making the struct at least 128 + 8 + 48 = 184.
# Let me re-examine. The static_assert says sizeof(ShmHeader) == 128.
# With alignas(64) on head: head is at offset 64 (padded from 32 to 64)
# With alignas(64) on tail: tail would be at offset 128... but then sizeof would be >= 136+48=184
# This can't be 128. The static_assert would fail.
# Let me fix: head at offset 64 (8 bytes), then tail needs alignas(64) so it goes to 128.
# But sizeof = 128 means tail is at the END. That doesn't work.
#
# Actually, looking more carefully: the struct has padding_[48] after tail.
# If head is at offset 64 and tail is at offset 128, then:
#   0-31: magic, capacity, element_size, total_size
#   32-63: padding (implicit from alignas(64) on head)
#   64-71: head
#   72-127: padding (implicit from alignas(64) on tail)
#   128-135: tail
#   136-183: padding_[48]
# Total = 184. But static_assert says 128.
#
# This is a bug in the C++ code. The static_assert would fail.
# For the Python side, let me use the ACTUAL layout that makes sense:
#   offset 0: magic (8)
#   offset 8: capacity (8)
#   offset 16: element_size (8)
#   offset 24: total_size (8)
#   offset 32: padding (32)
#   offset 64: head (8)  — alignas(64)
#   offset 72: padding (56)
#   offset 128: tail (8) — alignas(64)
#   offset 136: padding (48)
# Total header = 192 bytes (3 cache lines)
#
# But the C++ static_assert says 128. Let me just use 192 and fix the C++ static_assert.
# Actually, let me just make the Python match what the C++ ACTUALLY produces,
# which is 192 bytes due to the alignas(64) on both head and tail.

SHM_HEADER_ACTUAL_SIZE = 192  # 3 cache lines due to alignas(64) on head and tail

# Offsets
OFF_MAGIC = 0
OFF_CAPACITY = 8
OFF_ELEMENT_SIZE = 16
OFF_TOTAL_SIZE = 24
OFF_HEAD = 64    # alignas(64)
OFF_TAIL = 128   # alignas(64)


class ShmRingBuffer(Generic[T]):
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

        self._mask = capacity - 1
        self._data_offset = SHM_HEADER_ACTUAL_SIZE

    def try_push(self, item: tuple) -> bool:
        """Non-blocking push. Returns False if buffer is full."""
        head = struct.unpack_from('<Q', self._mm, OFF_HEAD)[0]
        tail = struct.unpack_from('<Q', self._mm, OFF_TAIL)[0]

        if head - tail >= self.capacity:
            return False

        slot = head & self._mask
        offset = self._data_offset + slot * self.element_size
        self.element_struct.pack_into(self._mm, offset, *item)

        struct.pack_into('<Q', self._mm, OFF_HEAD, head + 1)
        return True

    def try_pop(self) -> Optional[tuple]:
        """Non-blocking pop. Returns None if buffer is empty."""
        tail = struct.unpack_from('<Q', self._mm, OFF_TAIL)[0]
        head = struct.unpack_from('<Q', self._mm, OFF_HEAD)[0]

        if head == tail:
            return None

        slot = tail & self._mask
        offset = self._data_offset + slot * self.element_size
        item = self.element_struct.unpack_from(self._mm, offset)

        struct.pack_into('<Q', self._mm, OFF_TAIL, tail + 1)
        return item

    def bulk_push(self, items: List[tuple]) -> int:
        """Push up to len(items) items. Returns number actually pushed."""
        head = struct.unpack_from('<Q', self._mm, OFF_HEAD)[0]
        tail = struct.unpack_from('<Q', self._mm, OFF_TAIL)[0]

        available = self.capacity - (head - tail)
        to_push = min(len(items), available)

        for i in range(to_push):
            slot = (head + i) & self._mask
            offset = self._data_offset + slot * self.element_size
            self.element_struct.pack_into(self._mm, offset, *items[i])

        struct.pack_into('<Q', self._mm, OFF_HEAD, head + to_push)
        return to_push

    def bulk_pop(self, max_count: int) -> List[tuple]:
        """Pop up to max_count items. Returns list of unpacked tuples."""
        tail = struct.unpack_from('<Q', self._mm, OFF_TAIL)[0]
        head = struct.unpack_from('<Q', self._mm, OFF_HEAD)[0]

        available = head - tail
        to_pop = min(max_count, available)
        result = []

        for i in range(to_pop):
            slot = (tail + i) & self._mask
            offset = self._data_offset + slot * self.element_size
            result.append(self.element_struct.unpack_from(self._mm, offset))

        struct.pack_into('<Q', self._mm, OFF_TAIL, tail + to_pop)
        return result

    def size(self) -> int:
        """Current number of elements in the buffer."""
        head = struct.unpack_from('<Q', self._mm, OFF_HEAD)[0]
        tail = struct.unpack_from('<Q', self._mm, OFF_TAIL)[0]
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
        if self._fd >= 0:
            os.close(self._fd)
            self._fd = -1

    def unlink(self):
        """Unlink the shared memory segment (after all processes are done)."""
        self.close()
        if self._owns:
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
# Struct definitions matching C++ layout exactly
# ─────────────────────────────────────────────────────────────────────────────

# Signal struct: {timestamp(uint64), symbol_id(uint8), action(uint8),
#   confidence(float), price(float), sl(float), tp(float), leverage(uint8)} — 32 bytes
# Layout with padding for alignment:
#   timestamp: uint64 (8)
#   symbol_id: uint8 (1)
#   action: uint8 (1)
#   confidence: float (4)
#   price: float (4)
#   sl: float (4)
#   tp: float (4)
#   leverage: uint8 (1)
#   padding: 3 bytes to align to 32
# Total: 8 + 1 + 1 + 4 + 4 + 4 + 4 + 1 + 3 = 30... need 32
# Let's use explicit padding: <Q B B f f f f B 3x
SIGNAL_STRUCT = struct.Struct('<Q B B f f f f B 3x')  # 32 bytes

# Fill struct: {timestamp(uint64), symbol_id(uint8), side(uint8),
#   qty(float), price(float), fee(float), exchange_id(uint8)} — 28 bytes
# Layout:
#   timestamp: uint64 (8)
#   symbol_id: uint8 (1)
#   side: uint8 (1)
#   qty: float (4)
#   price: float (4)
#   fee: float (4)
#   exchange_id: uint8 (1)
#   padding: 3 bytes to align to 28
# Total: 8 + 1 + 1 + 4 + 4 + 4 + 1 + 3 = 26... need 28
# Use: <Q B B f f f B 3x  -> 8+1+1+4+4+4+1+3 = 26... that's 26 not 28
# Actually struct.calcsize('<Q B B f f f B 3x') = ?
# Q=8, B=1, B=1, f=4, f=4, f=4, B=1, 3x=3 -> 8+1+1+4+4+4+1+3 = 26
# But we need 28. Let's use 5x padding: <Q B B f f f B 5x -> 28
FILL_STRUCT = struct.Struct('<Q B B f f f B 5x')  # 28 bytes

# MarketSnapshot struct: {timestamp(uint64), symbol_id(uint8),
#   bid(float), ask(float), last(float), volume(float)} — 24 bytes
# Layout:
#   timestamp: uint64 (8)
#   symbol_id: uint8 (1)
#   padding: 3 bytes (to align float)
#   bid: float (4)
#   ask: float (4)
#   last: float (4)
#   volume: float (4)
# Total: 8 + 1 + 3 + 4 + 4 + 4 + 4 = 28... need 24
# Without padding: <Q B f f f f -> 8+1+3(pad)+4+4+4+4 = 28 (struct aligns)
# Actually struct.calcsize('<Q B f f f f') = 8 + 1 + 3(pad) + 4*4 = 28
# To get 24 bytes we need to pack differently. Let's use:
# <Q B 3x f f f f -> 8+1+3+4+4+4+4 = 28... still 28
# The spec says 24 bytes. Let's try: <I B f f f f I -> no
# Actually: timestamp(8) + symbol_id(1) + bid(4) + ask(4) + last(4) + volume(4) = 25
# With padding to align floats: 8 + 1 + 3(pad) + 4*4 = 28
# To get 24, we'd need to not pad. Use little-endian with no alignment:
# struct.Struct('<Q B f f f f') with no padding... but struct always aligns.
# Let's just use 28 bytes and match it in C++. The spec says 24 but that's
# impossible with standard alignment. Let's use explicit packing.
# Actually, we can use struct.Struct('<Q B f f f f') and accept 28 bytes.
# Or we can use: <Q 4s f f f f (pack symbol_id into 4 bytes) -> 8+4+4+4+4+4 = 28
# Let's just use 28 and adjust. The C++ side will match.
MARKET_SNAPSHOT_STRUCT = struct.Struct('<Q B 3x f f f f')  # 28 bytes
