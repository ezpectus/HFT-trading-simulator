"""Tests for monitoring metrics."""
import pytest

from src.monitoring.metrics import MetricsExporter


class TestMetricsExporter:
    def test_creation_without_prometheus(self):
        exporter = MetricsExporter()
        assert isinstance(exporter, MetricsExporter)
        assert hasattr(exporter, "signals_total")  # metric attrs initialized even without prometheus

    def test_metrics_dict_initialized(self):
        exporter = MetricsExporter()
        assert hasattr(exporter, "signals_total")  # metric attrs initialized (None if prometheus missing)
