"""Tests for networking/socket_transport.py — SocketTransport and MarketDataPacket."""
import socket
import struct

import pytest

from src.networking.socket_transport import MarketDataPacket, SocketTransport


class TestMarketDataPacket:
    def test_creation(self):
        pkt = MarketDataPacket(
            timestamp_ns=1234567890,
            symbol="BTC/USDT",
            price=50000.0,
            qty=1.5,
            side="buy",
            msg_type="new",
        )
        assert pkt.timestamp_ns == 1234567890
        assert pkt.symbol == "BTC/USDT"
        assert pkt.price == 50000.0
        assert pkt.qty == 1.5
        assert pkt.side == "buy"
        assert pkt.msg_type == "new"


class TestSocketTransportInit:
    def test_defaults(self):
        t = SocketTransport()
        assert t.port == 9000
        assert t.buffer_size == 1024 * 1024
        assert t.rx_queue_size == 4096
        assert t.tx_queue_size == 4096
        assert t.bind_addr == "127.0.0.1"
        assert t._initialized is False
        assert t._socket is None
        assert t._running is False

    def test_custom_params(self):
        t = SocketTransport(port=8080, buffer_size=2048, bind_addr="0.0.0.0")
        assert t.port == 8080
        assert t.buffer_size == 2048
        assert t.bind_addr == "0.0.0.0"

    def test_initial_stats(self):
        t = SocketTransport()
        assert t._stats["packets_rx"] == 0
        assert t._stats["packets_tx"] == 0
        assert t._stats["bytes_rx"] == 0
        assert t._stats["bytes_tx"] == 0
        assert t._stats["rx_drops"] == 0
        assert t._stats["avg_latency_ns"] == 0


class TestSocketTransportInitialize:
    def test_initialize_socket(self):
        t = SocketTransport(port=0, bind_addr="127.0.0.1")
        result = t.initialize()
        assert result is True
        assert t._initialized is True
        assert t._socket is not None
        t.stop()

    def test_initialize_creates_udp_socket(self):
        t = SocketTransport(port=0, bind_addr="127.0.0.1")
        t.initialize()
        assert t._socket is not None
        assert t._socket.type == socket.SOCK_DGRAM
        t.stop()

    def test_initialize_sets_nonblocking(self):
        t = SocketTransport(port=0, bind_addr="127.0.0.1")
        t.initialize()
        assert t._socket.getblocking() is False
        t.stop()


class TestSocketTransportSend:
    def test_send_not_initialized(self):
        t = SocketTransport()
        assert t.send(b"test") is False

    def test_send_to_receiver(self):
        rx = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        rx.bind(("127.0.0.1", 0))
        rx_port = rx.getsockname()[1]
        rx.settimeout(2.0)

        t = SocketTransport(port=0, bind_addr="127.0.0.1")
        t.initialize()

        data = b"hello socket"
        result = t.send(data, dest=("127.0.0.1", rx_port))
        assert result is True
        assert t._stats["packets_tx"] == 1
        assert t._stats["bytes_tx"] == len(data)

        received, addr = rx.recvfrom(4096)
        assert received == data

        rx.close()
        t.stop()


class TestSocketTransportParsePacket:
    def test_parse_valid_packet(self):
        t = SocketTransport(port=0, bind_addr="127.0.0.1")
        symbol = "BTC"
        sym_bytes = symbol.encode("ascii")
        data = struct.pack("!Q", 1234567890)
        data += struct.pack("!B", len(sym_bytes))
        data += sym_bytes
        data += struct.pack("!dd", 50000.0, 1.5)
        data += struct.pack("!B", 0)  # buy
        data += struct.pack("!B", 3)  # trade

        pkt = t._parse_packet(data)
        assert pkt is not None
        assert pkt.timestamp_ns == 1234567890
        assert pkt.symbol == "BTC"
        assert pkt.price == 50000.0
        assert pkt.qty == 1.5
        assert pkt.side == "buy"
        assert pkt.msg_type == "trade"

    def test_parse_short_packet(self):
        t = SocketTransport(port=0, bind_addr="127.0.0.1")
        pkt = t._parse_packet(b"short")
        assert pkt is None

    def test_parse_empty_packet(self):
        t = SocketTransport(port=0, bind_addr="127.0.0.1")
        pkt = t._parse_packet(b"")
        assert pkt is None

    def test_parse_sell_side(self):
        t = SocketTransport(port=0, bind_addr="127.0.0.1")
        symbol = "ETH"
        sym_bytes = symbol.encode("ascii")
        data = struct.pack("!Q", 99999)
        data += struct.pack("!B", len(sym_bytes))
        data += sym_bytes
        data += struct.pack("!dd", 3000.0, 2.0)
        data += struct.pack("!B", 1)  # sell
        data += struct.pack("!B", 0)  # new

        pkt = t._parse_packet(data)
        assert pkt is not None
        assert pkt.side == "sell"
        assert pkt.msg_type == "new"

    def test_parse_unknown_msg_type(self):
        t = SocketTransport(port=0, bind_addr="127.0.0.1")
        symbol = "X"
        sym_bytes = symbol.encode("ascii")
        data = struct.pack("!Q", 1)
        data += struct.pack("!B", len(sym_bytes))
        data += sym_bytes
        data += struct.pack("!dd", 100.0, 1.0)
        data += struct.pack("!B", 0)
        data += struct.pack("!B", 99)  # unknown

        pkt = t._parse_packet(data)
        assert pkt is not None
        assert pkt.msg_type == "unknown"


class TestSocketTransportStats:
    def test_get_stats(self):
        t = SocketTransport()
        stats = t.get_stats()
        assert "packets_rx" in stats
        assert "packets_tx" in stats
        assert "bytes_rx" in stats
        assert "bytes_tx" in stats
        assert "rx_drops" in stats

    def test_is_active(self):
        t = SocketTransport()
        assert t.is_active() is False


class TestSocketTransportStop:
    def test_stop_closes_socket(self):
        t = SocketTransport(port=0, bind_addr="127.0.0.1")
        t.initialize()
        t.stop()
        assert t._running is False

    def test_stop_without_init(self):
        t = SocketTransport()
        t.stop()
        assert t._running is False

    def test_stop_idempotent(self):
        t = SocketTransport(port=0, bind_addr="127.0.0.1")
        t.initialize()
        t.stop()
        t.stop()
        assert t._running is False
