"""WebSocket broadcasting performance metrics.

Extracted from websocket_server.py for file-size compliance.
"""
import time
from collections import deque


class WebSocketMetrics:
    """Tracks WebSocket broadcasting performance metrics."""

    def __init__(self):
        self.message_sizes: deque[int] = deque(maxlen=10000)
        self.message_count: int = 0
        self.bytes_sent: int = 0
        self.compression_ratio: float = 0.0
        self.delta_update_ratio: float = 0.0
        self.client_count: int = 0
        self.broadcast_latencies: deque[float] = deque(maxlen=10000)
        self.max_samples: int = 10000
        self._start_time: float = time.time()
        self._sorted_sizes_cache: list[int] | None = None
        self._sorted_latencies_cache: list[float] | None = None

    def record_message(self, size: int, compressed_size: int = 0) -> None:
        """Record a message size."""
        self.message_sizes.append(size)
        self.message_count += 1
        self.bytes_sent += size
        self._sorted_sizes_cache = None
        if compressed_size > 0:
            self.compression_ratio = size / compressed_size if compressed_size > 0 else 0.0

    def record_broadcast_latency(self, latency_ms: float) -> None:
        """Record broadcast latency."""
        self.broadcast_latencies.append(latency_ms)
        self._sorted_latencies_cache = None

    def record_delta_update(self, is_delta: bool) -> None:
        """Record whether a delta update was sent."""
        if is_delta:
            self.delta_update_ratio = (self.delta_update_ratio * 0.9) + (1.0 * 0.1)
        else:
            self.delta_update_ratio = (self.delta_update_ratio * 0.9) + (0.0 * 0.1)

    def get_avg_message_size(self) -> float:
        """Get average message size in bytes."""
        if not self.message_sizes:
            return 0.0
        return sum(self.message_sizes) / len(self.message_sizes)

    def get_p95_message_size(self) -> float:
        """Get p95 message size in bytes."""
        if not self.message_sizes:
            return 0.0
        if self._sorted_sizes_cache is None:
            self._sorted_sizes_cache = sorted(self.message_sizes)
        idx = int(len(self._sorted_sizes_cache) * 0.95)
        return self._sorted_sizes_cache[min(idx, len(self._sorted_sizes_cache) - 1)]

    def get_p95_broadcast_latency(self) -> float:
        """Get p95 broadcast latency in ms."""
        if not self.broadcast_latencies:
            return 0.0
        if self._sorted_latencies_cache is None:
            self._sorted_latencies_cache = sorted(self.broadcast_latencies)
        idx = int(len(self._sorted_latencies_cache) * 0.95)
        return self._sorted_latencies_cache[min(idx, len(self._sorted_latencies_cache) - 1)]

    def get_bandwidth_mbps(self) -> float:
        """Get bandwidth usage in Mbps."""
        elapsed = time.time() - self._start_time
        if elapsed == 0:
            return 0.0
        bytes_per_sec = self.bytes_sent / elapsed
        return (bytes_per_sec * 8) / 1_000_000

    def get_metrics(self) -> dict:
        """Get all metrics as a dictionary."""
        return {
            "message_count": self.message_count,
            "bytes_sent": self.bytes_sent,
            "avg_message_size_bytes": self.get_avg_message_size(),
            "p95_message_size_bytes": self.get_p95_message_size(),
            "compression_ratio": self.compression_ratio,
            "delta_update_ratio": self.delta_update_ratio,
            "client_count": self.client_count,
            "p95_broadcast_latency_ms": self.get_p95_broadcast_latency(),
            "bandwidth_mbps": self.get_bandwidth_mbps(),
            "uptime_seconds": time.time() - self._start_time,
        }
