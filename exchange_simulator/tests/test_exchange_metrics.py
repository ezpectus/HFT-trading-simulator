"""Unit tests for exchange_simulator/metrics.py — ExchangeSimulatorMetrics."""

import pytest
from prometheus_client import REGISTRY

from exchange_simulator.metrics import (
    ExchangeSimulatorMetrics,
    get_metrics,
    init_metrics,
)

# ─── Fixtures ───


def _clear_prometheus_metrics():
    """Unregister exchange_simulator metrics to avoid duplicate registration errors."""
    collectors = set()
    for name in list(REGISTRY._names_to_collectors):
        if 'exchange_simulator' in name:
            collectors.add(REGISTRY._names_to_collectors[name])
    for c in collectors:
        REGISTRY.unregister(c)


@pytest.fixture
def metrics() -> ExchangeSimulatorMetrics:
    """Create a fresh metrics instance (don't start server)."""
    _clear_prometheus_metrics()
    return ExchangeSimulatorMetrics(metrics_port=9999)


# ─── Initialization ───


def test_metrics_has_counters(metrics: ExchangeSimulatorMetrics) -> None:
    """Counters should be initialized."""
    assert hasattr(metrics, "orders_total")
    assert hasattr(metrics, "fills_total")
    assert hasattr(metrics, "errors_total")
    assert hasattr(metrics, "price_updates_total")


def test_metrics_has_gauges(metrics: ExchangeSimulatorMetrics) -> None:
    """Gauges should be initialized."""
    assert hasattr(metrics, "order_rate")
    assert hasattr(metrics, "fill_rate")
    assert hasattr(metrics, "error_rate")
    assert hasattr(metrics, "cpu_usage")
    assert hasattr(metrics, "memory_usage")
    assert hasattr(metrics, "active_connections")
    assert hasattr(metrics, "price_update_rate")


def test_metrics_has_histograms(metrics: ExchangeSimulatorMetrics) -> None:
    """Histograms should be initialized."""
    assert hasattr(metrics, "order_latency")
    assert hasattr(metrics, "websocket_latency")
    assert hasattr(metrics, "price_feed_latency")


# ─── Record Methods ───


def test_record_order(metrics: ExchangeSimulatorMetrics) -> None:
    """record_order should not raise."""
    metrics.record_order("BTC/USDT", "BUY", "FILLED", 0.005)


def test_record_fill(metrics: ExchangeSimulatorMetrics) -> None:
    """record_fill should not raise."""
    metrics.record_fill("BTC/USDT", "BUY")


def test_record_error(metrics: ExchangeSimulatorMetrics) -> None:
    """record_error should not raise."""
    metrics.record_error("timeout", "websocket")


def test_record_price_update(metrics: ExchangeSimulatorMetrics) -> None:
    """record_price_update should not raise."""
    metrics.record_price_update("BTC/USDT", "binance", 0.01)


def test_record_websocket_latency(metrics: ExchangeSimulatorMetrics) -> None:
    """record_websocket_latency should not raise."""
    metrics.record_websocket_latency("client_1", 0.001)


# ─── Update Methods ───


def test_update_system_metrics(metrics: ExchangeSimulatorMetrics) -> None:
    """update_system_metrics should not raise."""
    metrics.update_system_metrics(cpu_usage=45.5, memory_usage=1024000, active_connections=10)


def test_update_order_rate(metrics: ExchangeSimulatorMetrics) -> None:
    """update_order_rate should not raise."""
    metrics.update_order_rate("BTC/USDT", 50.0)


def test_update_fill_rate(metrics: ExchangeSimulatorMetrics) -> None:
    """update_fill_rate should not raise."""
    metrics.update_fill_rate("BTC/USDT", 45.0)


def test_update_price_update_rate(metrics: ExchangeSimulatorMetrics) -> None:
    """update_price_update_rate should not raise."""
    metrics.update_price_update_rate("BTC/USDT", 100.0)


def test_update_error_rate(metrics: ExchangeSimulatorMetrics) -> None:
    """update_error_rate should not raise."""
    metrics.update_error_rate("websocket", 0.5)


# ─── Singleton ───


def test_get_metrics_returns_instance() -> None:
    """get_metrics should return a singleton instance."""
    _clear_prometheus_metrics()
    m1 = get_metrics()
    m2 = get_metrics()
    assert m1 is m2
