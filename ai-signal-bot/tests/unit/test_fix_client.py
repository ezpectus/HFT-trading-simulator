"""Tests for FixMessage parse/build and FixSession message construction.

Tests cover: parse normal message, build+parse round-trip, malformed tag
(non-numeric), missing '=' delimiter, empty message, checksum validation,
body length correctness, msg_type/seq_num properties, get/get_int/get_float.
"""
import pytest

from src.communication.fix_client import SOH, FixMessage, FixSession


class TestFixMessageParse:
    def test_parse_normal_message(self):
        raw = f"8=FIX.4.4{SOH}9=12{SOH}35=A{SOH}34=1{SOH}10=000{SOH}".encode('ascii')
        msg = FixMessage.parse(raw)
        assert msg.get(8) == "FIX.4.4"
        assert msg.get(35) == "A"
        assert msg.get_int(34) == 1

    def test_parse_empty_bytes(self):
        msg = FixMessage.parse(b"")
        assert msg.fields == {}

    def test_parse_missing_equals_delimiter(self):
        raw = f"8=FIX.4.4{SOH}GARBAGE{SOH}35=A{SOH}".encode('ascii')
        msg = FixMessage.parse(raw)
        assert msg.get(8) == "FIX.4.4"
        assert msg.get(35) == "A"
        assert len(msg.fields) == 2

    def test_parse_non_numeric_tag_skipped(self):
        raw = f"8=FIX.4.4{SOH}XX=value{SOH}35=A{SOH}".encode('ascii')
        msg = FixMessage.parse(raw)
        assert msg.get(8) == "FIX.4.4"
        assert msg.get(35) == "A"
        assert len(msg.fields) == 2

    def test_parse_multiple_fields(self):
        raw = f"8=FIX.4.4{SOH}35=8{SOH}34=42{SOH}55=BTCUSDT{SOH}38=0.5{SOH}".encode('ascii')
        msg = FixMessage.parse(raw)
        assert msg.get(35) == "8"
        assert msg.get_int(34) == 42
        assert msg.get(55) == "BTCUSDT"
        assert msg.get_float(38) == 0.5

    def test_parse_non_ascii_replaced(self):
        raw = f"8=FIX.4.4{SOH}35=A{SOH}\xff\xfe{SOH}".encode('latin-1')
        msg = FixMessage.parse(raw)
        assert msg.get(8) == "FIX.4.4"
        assert msg.get(35) == "A"


class TestFixMessageBuild:
    def test_build_basic_message(self):
        raw = FixMessage.build([(35, "A"), (34, "1")])
        text = raw.decode('ascii')
        assert text.startswith(f"8=FIX.4.4{SOH}")
        assert f"35=A{SOH}" in text
        assert f"34=1{SOH}" in text
        assert text.endswith(f"10=000{SOH}") or "10=" in text

    def test_build_includes_checksum(self):
        raw = FixMessage.build([(35, "A"), (34, "1")])
        text = raw.decode('ascii')
        assert "10=" in text

    def test_build_checksum_correct(self):
        fields = [(35, "A"), (34, "1"), (49, "SENDER"), (56, "TARGET")]
        raw = FixMessage.build(fields)
        text = raw.decode('ascii')
        # Extract checksum from message
        parts = text.split(SOH)
        checksum_tag = None
        body_end_idx = None
        for i, part in enumerate(parts):
            if part.startswith("10="):
                checksum_tag = int(part[3:])
                body_end_idx = i
                break
        assert checksum_tag is not None
        # Recompute: sum all bytes up to the 10= tag
        full_before_checksum = SOH.join(parts[:body_end_idx]) + SOH
        expected = sum(full_before_checksum.encode('ascii')) % 256
        assert checksum_tag == expected

    def test_build_body_length_correct(self):
        fields = [(35, "A"), (34, "1")]
        raw = FixMessage.build(fields)
        text = raw.decode('ascii')
        parts = text.split(SOH)
        body_length = None
        for part in parts:
            if part.startswith("9="):
                body_length = int(part[2:])
                break
        assert body_length is not None
        # Body is everything after 9=BodyLength SOH, before 10=CheckSum
        body = f"35=A{SOH}34=1{SOH}"
        assert body_length == len(body)

    def test_build_custom_begin_string(self):
        raw = FixMessage.build([(35, "A")], begin_string="FIX.4.2")
        text = raw.decode('ascii')
        assert text.startswith(f"8=FIX.4.2{SOH}")


class TestFixMessageRoundTrip:
    def test_build_parse_round_trip(self):
        fields = [(35, "8"), (34, "42"), (55, "BTCUSDT"), (38, "0.5"), (44, "50000.0")]
        raw = FixMessage.build(fields)
        msg = FixMessage.parse(raw)
        assert msg.get(35) == "8"
        assert msg.get_int(34) == 42
        assert msg.get(55) == "BTCUSDT"
        assert msg.get_float(38) == 0.5
        assert msg.get_float(44) == 50000.0

    def test_round_trip_preserves_all_fields(self):
        fields = [(35, "D"), (34, "1"), (49, "SENDER"), (56, "TARGET"), (55, "ETHUSDT")]
        raw = FixMessage.build(fields)
        msg = FixMessage.parse(raw)
        for tag, value in fields:
            assert msg.get(tag) == value


class TestFixMessageProperties:
    def test_msg_type(self):
        msg = FixMessage(fields={35: "A"})
        assert msg.msg_type == "A"

    def test_msg_type_empty(self):
        msg = FixMessage()
        assert msg.msg_type == ""

    def test_seq_num(self):
        msg = FixMessage(fields={34: "42"})
        assert msg.seq_num == 42

    def test_seq_num_default(self):
        msg = FixMessage()
        assert msg.seq_num == 0

    def test_is_logon(self):
        assert FixMessage(fields={35: "A"}).is_logon is True
        assert FixMessage(fields={35: "8"}).is_logon is False

    def test_is_logout(self):
        assert FixMessage(fields={35: "5"}).is_logout is True
        assert FixMessage(fields={35: "A"}).is_logout is False

    def test_is_heartbeat(self):
        assert FixMessage(fields={35: "0"}).is_heartbeat is True
        assert FixMessage(fields={35: "A"}).is_heartbeat is False

    def test_is_execution_report(self):
        assert FixMessage(fields={35: "8"}).is_execution_report is True
        assert FixMessage(fields={35: "A"}).is_execution_report is False

    def test_is_market_data(self):
        assert FixMessage(fields={35: "W"}).is_market_data is True
        assert FixMessage(fields={35: "A"}).is_market_data is False


class TestFixMessageAccessors:
    def test_get_returns_none_for_missing(self):
        msg = FixMessage(fields={35: "A"})
        assert msg.get(99) is None

    def test_get_int_returns_zero_for_missing(self):
        msg = FixMessage()
        assert msg.get_int(34) == 0

    def test_get_float_returns_zero_for_missing(self):
        msg = FixMessage()
        assert msg.get_float(38) == 0.0

    def test_get_int_parses_value(self):
        msg = FixMessage(fields={34: "123"})
        assert msg.get_int(34) == 123

    def test_get_float_parses_value(self):
        msg = FixMessage(fields={38: "0.75"})
        assert msg.get_float(38) == 0.75


class TestFixSessionBuildMsg:
    def test_build_msg_increments_seq(self, tmp_path):
        session = FixSession("SENDER", "TARGET", seq_file=str(tmp_path / "seq.txt"))
        assert session.outgoing_seq == 1
        msg = session._build_msg("A", [(98, "0"), (108, "30")])
        assert session.outgoing_seq == 2
        parsed = FixMessage.parse(msg)
        assert parsed.get_int(34) == 1
        assert parsed.get(35) == "A"
        assert parsed.get(49) == "SENDER"
        assert parsed.get(56) == "TARGET"

    def test_build_msg_saves_seq(self, tmp_path):
        seq_file = str(tmp_path / "seq.txt")
        session = FixSession("SENDER", "TARGET", seq_file=seq_file)
        session._build_msg("A", [])
        session._build_msg("0", [])
        assert session.outgoing_seq == 3
        # Reload from file
        session2 = FixSession("SENDER", "TARGET", seq_file=seq_file)
        assert session2.outgoing_seq == 3

    def test_build_msg_timestamp(self, tmp_path):
        session = FixSession("SENDER", "TARGET", seq_file=str(tmp_path / "seq.txt"))
        msg = session._build_msg("A", [])
        parsed = FixMessage.parse(msg)
        ts = parsed.get(52)
        assert ts is not None
        assert len(ts) == 21  # YYYYMMDD-HH:MM:SS.000000
