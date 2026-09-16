"""Tests for ws_metrics.py — LatencyHistogram cumulative-bucket emission."""
import pytest

from exchange_simulator.ws_metrics import LatencyHistogram


class TestLatencyHistogram:
    def test_cumulative_buckets(self):
        h = LatencyHistogram()
        h.observe(0.003)  # <= 0.005 bucket
        h.observe(0.7)    # <= 1.0 bucket
        h.observe(9.0)    # only +Inf
        assert h.count == 3
        assert h.sum == pytest.approx(9.703)
        assert h.bucket_counts[1] == 1      # le=0.005
        assert h.bucket_counts[8] == 2      # le=1.0
        assert h.bucket_counts[-1] == 2     # le=5.0 — 9.0 not included
        lines = h.prometheus_lines("x_seconds", "help")
        assert 'x_seconds_bucket{le="+Inf"} 3' in lines
