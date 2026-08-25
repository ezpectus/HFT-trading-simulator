"""Tests for monitoring metrics."""
import pytest
from src.monitoring.metrics import MetricsExporter


class TestMetricsExporter:
    def test_creation_without_prometheus(self):
        exporter = MetricsExporter()
        assert exporter is not None

    def test_metrics_dict_initialized(self):
        exporter = MetricsExporter()
        assert hasattr(exporter, "_metrics") or hasattr(exporter, "metrics")
