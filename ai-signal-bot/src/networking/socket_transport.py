"""
Raw UDP socket transport for low-latency market data.

Uses non-blocking UDP sockets with configurable buffer sizes.
Suitable for local market data feeds and simulator communication.

This module provides:
  - Non-blocking UDP socket receive/transmit
  - Market data frame parser (binary format)
  - Packet statistics tracking

Usage:
    from src.networking.socket_transport import SocketTransport

    transport = SocketTransport()
    if transport.initialize():
        transport.start_receive_loop(on_packet=my_handler)
"""

from __future__ import annotations

import logging
import socket
import struct
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any  # Any: stats dict values are heterogeneous

logger = logging.getLogger(__name__)


@dataclass
class MarketDataPacket:
    timestamp_ns: int
    symbol: str
    price: float
    qty: float
    side: str  # buy / sell
    msg_type: str  # new, modify, cancel, trade, snapshot


class SocketTransport:
    """Raw UDP socket transport for market data feeds."""

    def __init__(
        self,
        port: int = 9000,
        buffer_size: int = 1024 * 1024,  # 1MB
        rx_queue_size: int = 4096,
        tx_queue_size: int = 4096,
        bind_addr: str = "127.0.0.1",
    ):
        self.port = port
        self.buffer_size = buffer_size
        self.rx_queue_size = rx_queue_size
        self.tx_queue_size = tx_queue_size
        self.bind_addr = bind_addr
        self._initialized = False
        self._socket: socket.socket | None = None
        self._running = False
        self._stats = {
            "packets_rx": 0,
            "packets_tx": 0,
            "bytes_rx": 0,
            "bytes_tx": 0,
            "rx_drops": 0,
            "avg_latency_ns": 0,
        }

    def initialize(self) -> bool:
        """Initialize UDP socket."""
        logger.info(f"[Socket] Initializing UDP transport on port {self.port}")
        try:
            self._socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self._socket.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, self.buffer_size)
            self._socket.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, self.buffer_size)
            self._socket.bind((self.bind_addr, self.port))  # codeql[py/bind-all-interfaces] configurable via constructor
            self._socket.setblocking(False)
            self._initialized = True
            return True
        except (OSError, RuntimeError) as e:
            logger.error(f"[Socket] Init failed: {e}")
            return False

    def start_receive_loop(self, on_packet: Callable[[MarketDataPacket], None]) -> None:
        """Start receiving packets and calling handler."""
        if not self._initialized:
            logger.error("[Socket] Not initialized")
            return

        self._running = True
        logger.info("[Socket] Starting receive loop")

        while self._running:
            try:
                data, addr = self._socket.recvfrom(65536)
                self._stats["packets_rx"] += 1
                self._stats["bytes_rx"] += len(data)

                packet = self._parse_packet(data)
                if packet:
                    on_packet(packet)
            except BlockingIOError:
                time.sleep(0.0001)  # 100μs sleep
            except (OSError, struct.error, UnicodeDecodeError) as e:
                self._stats["rx_drops"] += 1
                logger.debug(f"[Socket] RX error: {e}")

    def send(self, data: bytes, dest: tuple = ("127.0.0.1", 9001)) -> bool:
        """Send data packet."""
        if not self._initialized:
            return False
        try:
            self._socket.sendto(data, dest)
            self._stats["packets_tx"] += 1
            self._stats["bytes_tx"] += len(data)
            return True
        except (OSError, RuntimeError) as e:
            logger.debug(f"[Socket] TX error: {e}")
            return False

    def stop(self) -> None:
        self._running = False
        if self._socket:
            self._socket.close()

    def _parse_packet(self, data: bytes) -> MarketDataPacket | None:
        """Parse raw packet into MarketDataPacket."""
        try:
            # Binary format: [ts_ns:8][symbol_len:1][symbol:N][price:8][qty:8][side:1][msg_type:1]
            if len(data) < 27:
                return None

            ts_ns = struct.unpack_from("!Q", data, 0)[0]
            sym_len = data[8]
            symbol = data[9:9+sym_len].decode("ascii")
            offset = 9 + sym_len
            price, qty = struct.unpack_from("!dd", data, offset)
            side = "buy" if data[offset + 16] == 0 else "sell"
            msg_type_map = {0: "new", 1: "modify", 2: "cancel", 3: "trade", 4: "snapshot"}
            msg_type = msg_type_map.get(data[offset + 17], "unknown")

            return MarketDataPacket(
                timestamp_ns=ts_ns, symbol=symbol, price=price,
                qty=qty, side=side, msg_type=msg_type,
            )
        except (struct.error, UnicodeDecodeError, IndexError):
            return None

    def get_stats(self) -> dict[str, Any]:
        return {**self._stats}

    def is_active(self) -> bool:
        return self._initialized
