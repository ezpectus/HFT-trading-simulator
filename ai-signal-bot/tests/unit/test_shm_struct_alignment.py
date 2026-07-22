"""
SHM IPC struct alignment test — verifies Python struct.pack/unpack
matches C++ #pragma pack(push, 1) layout byte-for-byte.

This test does NOT use shared memory — it only verifies that the
binary layout of Python's struct.Struct matches the C++ struct
definitions in shm_protocol.h.

If this test passes, Python→C++ roundtrip via SHM will produce
correct data (no garbage from misaligned fields).
"""
import struct

import pytest


class TestSignalMsgAlignment:
    """SignalMsg — 32 bytes, matches C++ struct SignalMsg."""

    STRUCT_FMT = '<Q B B f f f f B 5x'
    EXPECTED_SIZE = 32

    def test_size_matches_cpp(self):
        s = struct.Struct(self.STRUCT_FMT)
        assert s.size == self.EXPECTED_SIZE, \
            f"SignalMsg: Python size={s.size}, C++ expects={self.EXPECTED_SIZE}"

    def test_field_offsets(self):
        """Verify each field is at the expected byte offset."""
        s = struct.Struct(self.STRUCT_FMT)
        # Expected offsets: Q=0, B=8, B=9, f=10, f=14, f=18, f=22, B=26, pad=27
        # With pragma pack(1), no padding between fields
        # Pack known values and verify field positions via unpack_from at expected offsets
        packed = s.pack(1, 2, 3, 4.0, 5.0, 6.0, 7.0, 8)
        # Verify timestamp at offset 0
        assert struct.unpack_from('<Q', packed, 0)[0] == 1
        # Verify symbol_id at offset 8
        assert struct.unpack_from('<B', packed, 8)[0] == 2
        # Verify action at offset 9
        assert struct.unpack_from('<B', packed, 9)[0] == 3
        # Verify confidence at offset 10
        assert abs(struct.unpack_from('<f', packed, 10)[0] - 4.0) < 1e-6
        # Verify price at offset 14
        assert abs(struct.unpack_from('<f', packed, 14)[0] - 5.0) < 1e-6
        # Verify sl at offset 18
        assert abs(struct.unpack_from('<f', packed, 18)[0] - 6.0) < 1e-6
        # Verify tp at offset 22
        assert abs(struct.unpack_from('<f', packed, 22)[0] - 7.0) < 1e-6
        # Verify leverage at offset 26
        assert struct.unpack_from('<B', packed, 26)[0] == 8

    def test_roundtrip_known_values(self):
        """Pack known values, unpack, verify they match."""
        s = struct.Struct(self.STRUCT_FMT)
        timestamp = 1700000000_000000000  # ns since epoch
        symbol_id = 0  # BTC
        action = 1     # LONG
        confidence = 0.85
        price = 45000.50
        sl = 44500.00
        tp = 46000.00
        leverage = 10

        packed = s.pack(timestamp, symbol_id, action, confidence, price, sl, tp, leverage)
        assert len(packed) == self.EXPECTED_SIZE

        unpacked = s.unpack(packed)
        assert unpacked[0] == timestamp
        assert unpacked[1] == symbol_id
        assert unpacked[2] == action
        assert abs(unpacked[3] - confidence) < 1e-5
        assert abs(unpacked[4] - price) < 1e-2
        assert abs(unpacked[5] - sl) < 1e-2
        assert abs(unpacked[6] - tp) < 1e-2
        assert unpacked[7] == leverage

    def test_padding_is_zero(self):
        """Last 5 bytes must be zero padding."""
        s = struct.Struct(self.STRUCT_FMT)
        packed = s.pack(0, 0, 0, 0.0, 0.0, 0.0, 0.0, 0)
        # Bytes 27-31 should be padding (zeros)
        assert packed[27:32] == b'\x00\x00\x00\x00\x00'

    def test_action_values(self):
        """Verify action enum mapping: 0=NEUTRAL, 1=LONG, 2=SHORT."""
        s = struct.Struct(self.STRUCT_FMT)
        for action in (0, 1, 2):
            packed = s.pack(0, 0, action, 0.0, 0.0, 0.0, 0.0, 1)
            unpacked = s.unpack(packed)
            assert unpacked[2] == action


class TestFillMsgAlignment:
    """FillMsg — 28 bytes, matches C++ struct FillMsg."""

    STRUCT_FMT = '<Q B B f f f B 5x'
    EXPECTED_SIZE = 28

    def test_size_matches_cpp(self):
        s = struct.Struct(self.STRUCT_FMT)
        assert s.size == self.EXPECTED_SIZE

    def test_roundtrip_known_values(self):
        s = struct.Struct(self.STRUCT_FMT)
        timestamp = 1700000000_000000000
        symbol_id = 1   # ETH
        side = 0         # BUY
        qty = 0.5
        price = 2500.00
        fee = 0.1
        exchange_id = 3  # Simulator

        packed = s.pack(timestamp, symbol_id, side, qty, price, fee, exchange_id)
        assert len(packed) == self.EXPECTED_SIZE

        unpacked = s.unpack(packed)
        assert unpacked[0] == timestamp
        assert unpacked[1] == symbol_id
        assert unpacked[2] == side
        assert abs(unpacked[3] - qty) < 1e-6
        assert abs(unpacked[4] - price) < 1e-2
        assert abs(unpacked[5] - fee) < 1e-4
        assert unpacked[6] == exchange_id

    def test_padding_is_zero(self):
        s = struct.Struct(self.STRUCT_FMT)
        packed = s.pack(0, 0, 0, 0.0, 0.0, 0.0, 0)
        assert packed[23:28] == b'\x00\x00\x00\x00\x00'


class TestMarketSnapshotMsgAlignment:
    """MarketSnapshotMsg — 28 bytes, matches C++ struct MarketSnapshotMsg."""

    STRUCT_FMT = '<Q B 3x f f f f'
    EXPECTED_SIZE = 28

    def test_size_matches_cpp(self):
        s = struct.Struct(self.STRUCT_FMT)
        assert s.size == self.EXPECTED_SIZE

    def test_roundtrip_known_values(self):
        s = struct.Struct(self.STRUCT_FMT)
        timestamp = 1700000000_000000000
        symbol_id = 2  # SOL
        bid = 100.50
        ask = 100.52
        last = 100.51
        volume = 50000.0

        packed = s.pack(timestamp, symbol_id, bid, ask, last, volume)
        assert len(packed) == self.EXPECTED_SIZE

        unpacked = s.unpack(packed)
        assert unpacked[0] == timestamp
        assert unpacked[1] == symbol_id
        assert abs(unpacked[2] - bid) < 1e-2
        assert abs(unpacked[3] - ask) < 1e-2
        assert abs(unpacked[4] - last) < 1e-2
        assert abs(unpacked[5] - volume) < 1.0

    def test_padding_is_zero(self):
        """Bytes 9-11 must be zero padding (3x)."""
        s = struct.Struct(self.STRUCT_FMT)
        packed = s.pack(0, 0, 0.0, 0.0, 0.0, 0.0)
        assert packed[9:12] == b'\x00\x00\x00'

    def test_float_alignment(self):
        """Float fields must start at offset 12 (after Q=8 + B=1 + 3x pad)."""
        s = struct.Struct(self.STRUCT_FMT)
        packed = s.pack(0, 0, 1.0, 2.0, 3.0, 4.0)
        # Read float at offset 12 directly
        direct = struct.unpack_from('<f', packed, 12)[0]
        assert abs(direct - 1.0) < 1e-6


class TestKillSwitchMsgAlignment:
    """KillSwitchMsg — 16 bytes, matches C++ struct KillSwitchMsg.
    Note: Python side uses Prometheus metrics, not SHM for kill switch,
    but the struct is defined in C++ for SHM notification."""

    STRUCT_FMT = '<Q B B 6x'
    EXPECTED_SIZE = 16

    def test_size_matches_cpp(self):
        s = struct.Struct(self.STRUCT_FMT)
        assert s.size == self.EXPECTED_SIZE

    def test_roundtrip(self):
        s = struct.Struct(self.STRUCT_FMT)
        timestamp = 1700000000_000000000
        active = 1
        reason = 0  # MANUAL

        packed = s.pack(timestamp, active, reason)
        assert len(packed) == self.EXPECTED_SIZE

        unpacked = s.unpack(packed)
        assert unpacked[0] == timestamp
        assert unpacked[1] == active
        assert unpacked[2] == reason
