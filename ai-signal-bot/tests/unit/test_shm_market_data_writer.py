"""Tests for ShmMarketDataWriter — init, write_snapshot, close, context manager."""
import struct
import sys

import pytest

from src.communication.shm_market_data_writer import (
    SLOT_OFFSET_DATA,
    SLOT_OFFSET_SEQ,
    SLOT_SIZE,
    ShmMarketDataWriter,
)

IS_WINDOWS = sys.platform == 'win32'


def make_writer(name=None, max_symbols=4):
    if name is None:
        name = f"/test_mdw_{id(object())}"
    return ShmMarketDataWriter(name=name, max_symbols=max_symbols)


@pytest.fixture
def writer():
    w = make_writer()
    if not w.init():
        pytest.skip("SHM not available in this environment")
    yield w
    w.close()


class TestInit:
    def test_init_success(self, writer):
        assert writer._mm is not None
        assert writer._total_size == 8 + writer.max_symbols * SLOT_SIZE

    def test_num_slots_written(self, writer):
        num_slots = struct.unpack_from('<Q', writer._mm, 0)[0]
        assert num_slots == writer.max_symbols

    def test_init_zeroed(self, writer):
        slot_offset = 8 + 0 * SLOT_SIZE
        seq = struct.unpack_from('<Q', writer._mm, slot_offset + SLOT_OFFSET_SEQ)[0]
        assert seq == 0


class TestWriteSnapshot:
    def test_write_updates_seq(self, writer):
        writer.write_snapshot(0, 1000, 50000.0, 50001.0, 50000.5, 10.0)
        slot_offset = 8 + 0 * SLOT_SIZE
        seq = struct.unpack_from('<Q', writer._mm, slot_offset + SLOT_OFFSET_SEQ)[0]
        assert seq == 2

    def test_write_increments_seq_per_write(self, writer):
        writer.write_snapshot(0, 1000, 50000.0, 50001.0, 50000.5, 10.0)
        writer.write_snapshot(0, 2000, 51000.0, 51001.0, 51000.5, 20.0)
        slot_offset = 8 + 0 * SLOT_SIZE
        seq = struct.unpack_from('<Q', writer._mm, slot_offset + SLOT_OFFSET_SEQ)[0]
        assert seq == 4

    def test_write_different_slots(self, writer):
        writer.write_snapshot(0, 1000, 50000.0, 50001.0, 50000.5, 10.0)
        writer.write_snapshot(1, 2000, 3000.0, 3001.0, 3000.5, 5.0)
        slot0_seq = struct.unpack_from('<Q', writer._mm, 8 + 0 * SLOT_SIZE + SLOT_OFFSET_SEQ)[0]
        slot1_seq = struct.unpack_from('<Q', writer._mm, 8 + 1 * SLOT_SIZE + SLOT_OFFSET_SEQ)[0]
        assert slot0_seq == 2
        assert slot1_seq == 2

    def test_write_ignores_invalid_symbol_id(self, writer):
        writer.write_snapshot(999, 1000, 50000.0, 50001.0, 50000.5, 10.0)
        for i in range(writer.max_symbols):
            slot_offset = 8 + i * SLOT_SIZE
            seq = struct.unpack_from('<Q', writer._mm, slot_offset + SLOT_OFFSET_SEQ)[0]
            assert seq == 0


class TestWritePrice:
    def test_write_price_convenience(self, writer):
        writer.write_price(0, 50000.0, 50001.0, 50000.5, 10.0)
        slot_offset = 8 + 0 * SLOT_SIZE
        seq = struct.unpack_from('<Q', writer._mm, slot_offset + SLOT_OFFSET_SEQ)[0]
        assert seq == 2


class TestClose:
    def test_close_clears_mm(self, writer):
        writer.close()
        assert writer._mm is None

    def test_close_idempotent(self, writer):
        writer.close()
        writer.close()
        assert writer._mm is None


class TestContextManager:
    def test_context_manager(self):
        w = make_writer()
        try:
            with w as ctx:
                assert ctx is w
                assert w._mm is not None
            assert w._mm is None
        except (OSError, ValueError, struct.error, BufferError):
            pytest.skip("SHM not available in this environment")
