"""WebSocket broadcasting performance metrics.

Extracted from websocket_server.py for file-size compliance.
"""
import time
from collections import deque


class LatencyHistogram:
    """Prometheus-style cumulative-bucket latency histogram (seconds)."""

    BUCKETS: tuple[float, ...] = (0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0)

    def __init__(self) -> None:
        self.bucket_counts = [0] * len(self.BUCKETS)
        self.count = 0
        self.sum = 0.0

    def observe(self, seconds: float) -> None:
        self.count += 1
        self.sum += seconds
        for i, bound in enumerate(self.BUCKETS):
            if seconds <= bound:
                self.bucket_counts[i] += 1

    def prometheus_lines(self, name: str, help_text: str) -> list[str]:
        lines = [f"# HELP {name} {help_text}", f"# TYPE {name} histogram"]
        for bound, cnt in zip(self.BUCKETS, self.bucket_counts):
            lines.append(f'{name}_bucket{{le="{bound:g}"}} {cnt}')
        lines.append(f'{name}_bucket{{le="+Inf"}} {self.count}')
        lines.append(f"{name}_sum {self.sum:.6f}")
        lines.append(f"{name}_count {self.count}")
        return lines


class WebSocketMetrics:
    """Tracks WebSocket broadcasting performance metrics."""

    def __init__(self):
        self.message_sizes: deque[int] = deque(maxlen=10000)
        self.message_count: int = 0
        self.bytes_sent: int = 0
        self.delta_update_ratio: float = 0.0
        self.broadcast_latencies: deque[float] = deque(maxlen=10000)
        self.max_samples: int = 10000
        self.errors_total: int = 0
        self.price_updates_total: int = 0
        self.order_latency = LatencyHistogram()
        self.ws_latency = LatencyHistogram()
        self.feed_latency = LatencyHistogram()
        self._start_time: float = time.monotonic()
        self._sorted_sizes_cache: list[int] | None = None
        self._sorted_latencies_cache: list[float] | None = None

    def record_message(self, size: int) -> None:
        """Record a message size."""
        self.message_sizes.append(size)
        self.message_count += 1
        self.bytes_sent += size
        self._sorted_sizes_cache = None

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
        elapsed = time.monotonic() - self._start_time
        if elapsed <= 0:
            return 0.0
        bytes_per_sec = self.bytes_sent / elapsed
        return (bytes_per_sec * 8) / 1_000_000


