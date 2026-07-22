"""Tests for ShmSignalProducer — init, push_signal, push_signal_dict, bulk_push, close.

Tests cover: init success/failure, raw signal push, dict-to-signal conversion
(symbol mapping, direction parsing, confidence scaling, leverage extraction),
bulk push, pending count, close, and context manager usage.
"""
import time
from unittest.mock import MagicMock, patch

import pytest

from src.communication.shm_signal_producer import ShmSignalProducer


@pytest.fixture
def producer():
    """Create a ShmSignalProducer with mocked buffer."""
    p = ShmSignalProducer(name="/test_signals", capacity=64)
    p._buffer = MagicMock()
    p._buffer.try_push.return_value = True
    p._buffer.bulk_push.return_value = 0
    p._buffer.size.return_value = 0
    return p


class TestInit:
    def test_init_success(self):
        p = ShmSignalProducer(name="/test_signals", capacity=128)
        with patch("src.communication.shm_signal_producer.ShmRingBuffer") as mock_rb:
            mock_instance = MagicMock()
            mock_rb.return_value = mock_instance
            result = p.init()
            assert result is True
            assert p._buffer is mock_instance

    def test_init_failure(self):
        p = ShmSignalProducer(name="/test_signals", capacity=128)
        with patch("src.communication.shm_signal_producer.ShmRingBuffer",
                   side_effect=Exception("SHM creation failed")):
            result = p.init()
            assert result is False
            assert p._buffer is None

    def test_default_values(self):
        p = ShmSignalProducer()
        assert p.name == "/hft_signals"
        assert p.capacity == 4096
        assert p._buffer is None


class TestPushSignal:
    def test_push_signal_returns_false_without_init(self):
        p = ShmSignalProducer()
        result = p.push_signal(1000, 0, 1, 0.8, 50000.0, 49000.0, 51000.0, 5)
        assert result is False

    def test_push_signal_success(self, producer):
        result = producer.push_signal(1000, 0, 1, 0.8, 50000.0, 49000.0, 51000.0, 5)
        assert result is True
        producer._buffer.try_push.assert_called_once_with(
            (1000, 0, 1, 0.8, 50000.0, 49000.0, 51000.0, 5)
        )

    def test_push_signal_default_leverage(self, producer):
        producer.push_signal(1000, 0, 1, 0.8, 50000.0, 49000.0, 51000.0)
        args = producer._buffer.try_push.call_args[0][0]
        assert args[7] == 1  # default leverage


class TestPushSignalDict:
    def test_long_direction(self, producer):
        signal = {
            "symbol": "BTC",
            "direction": "LONG",
            "confidence": 75,
            "entry_price": 50000.0,
            "stop_loss": 49000.0,
            "take_profit": 51000.0,
            "leverage": 5,
        }
        symbol_map = {"BTC": 0, "ETH": 1}
        producer.push_signal_dict(signal, symbol_map)
        args = producer._buffer.try_push.call_args[0][0]
        assert args[1] == 0  # symbol_id BTC=0
        assert args[2] == 1  # action LONG=1

    def test_short_direction(self, producer):
        signal = {"symbol": "ETH", "direction": "SHORT", "confidence": 60}
        producer.push_signal_dict(signal, {"ETH": 1})
        args = producer._buffer.try_push.call_args[0][0]
        assert args[2] == 2  # action SHORT=2

    def test_neutral_direction(self, producer):
        signal = {"symbol": "BTC", "direction": "NEUTRAL", "confidence": 50}
        producer.push_signal_dict(signal, {"BTC": 0})
        args = producer._buffer.try_push.call_args[0][0]
        assert args[2] == 0  # action NEUTRAL=0

    def test_unknown_direction_defaults_neutral(self, producer):
        signal = {"symbol": "BTC", "direction": "UNKNOWN", "confidence": 50}
        producer.push_signal_dict(signal, {"BTC": 0})
        args = producer._buffer.try_push.call_args[0][0]
        assert args[2] == 0  # unknown defaults to NEUTRAL=0

    def test_confidence_scaled_from_percentage(self, producer):
        signal = {"symbol": "BTC", "direction": "LONG", "confidence": 80}
        producer.push_signal_dict(signal, {"BTC": 0})
        args = producer._buffer.try_push.call_args[0][0]
        assert args[3] == pytest.approx(0.8)  # 80 / 100 = 0.8

    def test_confidence_default_zero(self, producer):
        signal = {"symbol": "BTC", "direction": "LONG"}
        producer.push_signal_dict(signal, {"BTC": 0})
        args = producer._buffer.try_push.call_args[0][0]
        assert args[3] == 0.0

    def test_entry_price_from_entry_price_key(self, producer):
        signal = {"symbol": "BTC", "direction": "LONG", "entry_price": 50100.0}
        producer.push_signal_dict(signal, {"BTC": 0})
        args = producer._buffer.try_push.call_args[0][0]
        assert args[4] == 50100.0

    def test_entry_price_fallback_to_price_key(self, producer):
        signal = {"symbol": "BTC", "direction": "LONG", "price": 50200.0}
        producer.push_signal_dict(signal, {"BTC": 0})
        args = producer._buffer.try_push.call_args[0][0]
        assert args[4] == 50200.0

    def test_stop_loss_default_zero(self, producer):
        signal = {"symbol": "BTC", "direction": "LONG"}
        producer.push_signal_dict(signal, {"BTC": 0})
        args = producer._buffer.try_push.call_args[0][0]
        assert args[5] == 0.0

    def test_take_profit_default_zero(self, producer):
        signal = {"symbol": "BTC", "direction": "LONG"}
        producer.push_signal_dict(signal, {"BTC": 0})
        args = producer._buffer.try_push.call_args[0][0]
        assert args[6] == 0.0

    def test_leverage_default_one(self, producer):
        signal = {"symbol": "BTC", "direction": "LONG"}
        producer.push_signal_dict(signal, {"BTC": 0})
        args = producer._buffer.try_push.call_args[0][0]
        assert args[7] == 1

    def test_unknown_symbol_defaults_to_zero(self, producer):
        signal = {"symbol": "UNKNOWN", "direction": "LONG"}
        producer.push_signal_dict(signal, {"BTC": 0})
        args = producer._buffer.try_push.call_args[0][0]
        assert args[1] == 0  # unknown symbol defaults to 0

    def test_timestamp_from_signal(self, producer):
        ts = 1234567890
        signal = {"symbol": "BTC", "direction": "LONG", "timestamp": ts}
        producer.push_signal_dict(signal, {"BTC": 0})
        args = producer._buffer.try_push.call_args[0][0]
        assert args[0] == ts

    def test_timestamp_default_current(self, producer):
        before = time.time_ns()
        signal = {"symbol": "BTC", "direction": "LONG"}
        producer.push_signal_dict(signal, {"BTC": 0})
        after = time.time_ns()
        args = producer._buffer.try_push.call_args[0][0]
        assert before <= args[0] <= after


class TestBulkPush:
    def test_bulk_push_returns_count(self, producer):
        signals = [(1, 0, 1, 0.8, 50000, 49000, 51000, 5)]
        producer._buffer.bulk_push.return_value = 1
        result = producer.bulk_push(signals)
        assert result == 1
        producer._buffer.bulk_push.assert_called_once_with(signals)

    def test_bulk_push_without_init(self):
        p = ShmSignalProducer()
        assert p.bulk_push([(1, 0, 1, 0.8, 50000, 49000, 51000, 5)]) == 0


class TestPending:
    def test_pending_with_buffer(self, producer):
        producer._buffer.size.return_value = 5
        assert producer.pending() == 5

    def test_pending_without_buffer(self):
        p = ShmSignalProducer()
        assert p.pending() == 0


class TestClose:
    def test_close_unlinks_buffer(self, producer):
        buf = producer._buffer
        producer.close()
        buf.unlink.assert_called_once()
        assert producer._buffer is None

    def test_close_without_buffer(self):
        p = ShmSignalProducer()
        p.close()  # Should not crash
        assert p._buffer is None


class TestContextManager:
    def test_context_manager_calls_init_and_close(self):
        p = ShmSignalProducer(name="/test_signals", capacity=64)
        with patch("src.communication.shm_signal_producer.ShmRingBuffer") as mock_rb:
            mock_instance = MagicMock()
            mock_rb.return_value = mock_instance
            with p as ctx:
                assert ctx is p
                assert p._buffer is mock_instance
            # After exit, buffer should be unlinked
            mock_instance.unlink.assert_called_once()
