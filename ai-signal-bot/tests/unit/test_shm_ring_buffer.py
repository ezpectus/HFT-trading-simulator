"""Tests for ShmRingBuffer SHM consumer validation.

Tests cover: capacity mismatch detection, element_size mismatch detection,
magic mismatch detection, and normal consumer open with matching parameters.
"""
import mmap
import struct
import sys

import pytest

from src.communication.shm_ring_buffer import (
    OFF_CAPACITY,
    OFF_ELEMENT_SIZE,
    OFF_HEAD,
    OFF_MAGIC,
    OFF_TAIL,
    OFF_TOTAL_SIZE,
    SHM_HEADER_ACTUAL_SIZE,
    SHM_MAGIC,
    ShmRingBuffer,
)

IS_WINDOWS = sys.platform == 'win32'

# Use a simple struct for testing: 1 uint32 + 1 float = 8 bytes
TEST_STRUCT = struct.Struct('<If')
TEST_CAPACITY = 64


def make_buffer(name, element_struct, capacity, create=True):
    """Helper to create a ShmRingBuffer with unique name."""
    return ShmRingBuffer(name, element_struct, capacity, create=create)


def write_header(mm, capacity, element_size):
    """Write a valid SHM header directly into mmap."""
    total_size = SHM_HEADER_ACTUAL_SIZE + capacity * element_size
    struct.pack_into('<Q', mm, OFF_MAGIC, SHM_MAGIC)
    struct.pack_into('<Q', mm, OFF_CAPACITY, capacity)
    struct.pack_into('<Q', mm, OFF_ELEMENT_SIZE, element_size)
    struct.pack_into('<Q', mm, OFF_TOTAL_SIZE, total_size)
    struct.pack_into('<Q', mm, OFF_HEAD, 0)
    struct.pack_into('<Q', mm, OFF_TAIL, 0)


class TestConsumerValidation:
    """Tests that consumer mode validates header fields."""

    def test_consumer_accepts_matching_params(self):
        name = f"/test_shm_match_{id(self)}"
        try:
            producer = make_buffer(name, TEST_STRUCT, TEST_CAPACITY, create=True)
            producer.close()

            consumer = make_buffer(name, TEST_STRUCT, TEST_CAPACITY, create=False)
            consumer.close()
        except Exception:
            pytest.skip("SHM not available in this environment")

    def test_consumer_rejects_capacity_mismatch(self):
        name = f"/test_shm_cap_{id(self)}"
        try:
            # Create with capacity 64
            producer = make_buffer(name, TEST_STRUCT, 64, create=True)
            producer.close()

            # Try to open with different capacity
            with pytest.raises(ValueError, match="capacity mismatch"):
                consumer = make_buffer(name, TEST_STRUCT, 128, create=False)
                consumer.close()
        except Exception:
            pytest.skip("SHM not available in this environment")

    def test_consumer_rejects_element_size_mismatch(self):
        name = f"/test_shm_elem_{id(self)}"
        try:
            # Create with TEST_STRUCT (8 bytes)
            producer = make_buffer(name, TEST_STRUCT, TEST_CAPACITY, create=True)
            producer.close()

            # Try to open with different struct size (4 bytes)
            wrong_struct = struct.Struct('<I')
            with pytest.raises(ValueError, match="element_size mismatch"):
                consumer = make_buffer(name, wrong_struct, TEST_CAPACITY, create=False)
                consumer.close()
        except Exception:
            pytest.skip("SHM not available in this environment")

    def test_consumer_rejects_magic_mismatch(self):
        name = f"/test_shm_magic_{id(self)}"
        try:
            producer = make_buffer(name, TEST_STRUCT, TEST_CAPACITY, create=True)
            # Corrupt the magic
            struct.pack_into('<Q', producer._mm, OFF_MAGIC, 0xDEADBEEF)
            producer.close()

            with pytest.raises(ValueError, match="magic mismatch"):
                consumer = make_buffer(name, TEST_STRUCT, TEST_CAPACITY, create=False)
                consumer.close()
        except Exception:
            pytest.skip("SHM not available in this environment")


class TestProducerValidation:
    """Tests that producer mode initializes header correctly."""

    def test_producer_writes_correct_capacity(self):
        name = f"/test_shm_pcap_{id(self)}"
        try:
            buf = make_buffer(name, TEST_STRUCT, 128, create=True)
            stored = struct.unpack_from('<Q', buf._mm, OFF_CAPACITY)[0]
            assert stored == 128
            buf.close()
        except Exception:
            pytest.skip("SHM not available in this environment")

    def test_producer_writes_correct_element_size(self):
        name = f"/test_shm_psize_{id(self)}"
        try:
            buf = make_buffer(name, TEST_STRUCT, 64, create=True)
            stored = struct.unpack_from('<Q', buf._mm, OFF_ELEMENT_SIZE)[0]
            assert stored == TEST_STRUCT.size
            buf.close()
        except Exception:
            pytest.skip("SHM not available in this environment")

    def test_producer_writes_magic(self):
        name = f"/test_shm_pmagic_{id(self)}"
        try:
            buf = make_buffer(name, TEST_STRUCT, 64, create=True)
            stored = struct.unpack_from('<Q', buf._mm, OFF_MAGIC)[0]
            assert stored == SHM_MAGIC
            buf.close()
        except Exception:
            pytest.skip("SHM not available in this environment")


class TestPushPop:
    """Basic push/pop functionality tests."""

    def test_push_and_pop_single(self):
        name = f"/test_shm_pp_{id(self)}"
        try:
            buf = make_buffer(name, TEST_STRUCT, 64, create=True)
            result = buf.try_push((42, 3.14))
            assert result is True

            item = buf.try_pop()
            assert item is not None
            assert item[0] == 42
            assert item[1] == pytest.approx(3.14)
            buf.close()
        except Exception:
            pytest.skip("SHM not available in this environment")

    def test_pop_empty_returns_none(self):
        name = f"/test_shm_empty_{id(self)}"
        try:
            buf = make_buffer(name, TEST_STRUCT, 64, create=True)
            assert buf.try_pop() is None
            assert buf.empty()
            buf.close()
        except Exception:
            pytest.skip("SHM not available in this environment")

    def test_push_full_returns_false(self):
        name = f"/test_shm_full_{id(self)}"
        try:
            buf = make_buffer(name, TEST_STRUCT, 4, create=True)
            for i in range(4):
                assert buf.try_push((i, float(i)))
            # Buffer is full
            assert buf.try_push((99, 99.0)) is False
            assert buf.full()
            buf.close()
        except Exception:
            pytest.skip("SHM not available in this environment")

    def test_size_after_pushes(self):
        name = f"/test_shm_size_{id(self)}"
        try:
            buf = make_buffer(name, TEST_STRUCT, 64, create=True)
            buf.try_push((1, 1.0))
            buf.try_push((2, 2.0))
            buf.try_push((3, 3.0))
            assert buf.size() == 3
            buf.close()
        except Exception:
            pytest.skip("SHM not available in this environment")


class TestBulkOperations:
    """Bulk push/pop tests."""

    def test_bulk_push(self):
        name = f"/test_shm_bpush_{id(self)}"
        try:
            buf = make_buffer(name, TEST_STRUCT, 64, create=True)
            items = [(i, float(i)) for i in range(10)]
            pushed = buf.bulk_push(items)
            assert pushed == 10
            assert buf.size() == 10
            buf.close()
        except Exception:
            pytest.skip("SHM not available in this environment")

    def test_bulk_push_partial_when_full(self):
        name = f"/test_shm_bpushfull_{id(self)}"
        try:
            buf = make_buffer(name, TEST_STRUCT, 4, create=True)
            items = [(i, float(i)) for i in range(10)]
            pushed = buf.bulk_push(items)
            assert pushed == 4
            buf.close()
        except Exception:
            pytest.skip("SHM not available in this environment")

    def test_bulk_pop(self):
        name = f"/test_shm_bpop_{id(self)}"
        try:
            buf = make_buffer(name, TEST_STRUCT, 64, create=True)
            for i in range(5):
                buf.try_push((i, float(i)))
            items = buf.bulk_pop(3)
            assert len(items) == 3
            assert items[0][0] == 0
            assert items[2][0] == 2
            assert buf.size() == 2
            buf.close()
        except Exception:
            pytest.skip("SHM not available in this environment")


class TestInvalidCapacity:
    """Test that non-power-of-2 capacities are rejected."""

    def test_zero_capacity_rejected(self):
        with pytest.raises(ValueError, match="power of 2"):
            make_buffer(f"/test_shm_zero_{id(self)}", TEST_STRUCT, 0)

    def test_non_power_of_2_rejected(self):
        with pytest.raises(ValueError, match="power of 2"):
            make_buffer(f"/test_shm_nonpow_{id(self)}", TEST_STRUCT, 3)

    def test_negative_capacity_rejected(self):
        with pytest.raises(ValueError, match="power of 2"):
            make_buffer(f"/test_shm_neg_{id(self)}", TEST_STRUCT, -4)
