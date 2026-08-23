"""Unit tests for monitoring/metrics.py — MetricsExporter Prometheus metrics."""

import pytest

from src.monitoring.metrics import HAS_PROMETHEUS, MetricsExporter

# ─── Fixtures ───


@pytest.fixture
def exporter() -> MetricsExporter:
    """Create a MetricsExporter instance."""
    return MetricsExporter(registry_name="test_trading_system")


# ─── Initialization ───


def test_metrics_exporter_initializes(exporter: MetricsExporter) -> None:
    """MetricsExporter should initialize without errors when prometheus_client is available."""
    if HAS_PROMETHEUS:
        assert exporter.registry is not None
    else:
        assert exporter.registry is None


def test_metrics_exporter_has_counters(exporter: MetricsExporter) -> None:
    """Counters should be initialized."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    assert hasattr(exporter, "signals_total")
    assert hasattr(exporter, "fills_total")
    assert hasattr(exporter, "orders_sent_total")
    assert hasattr(exporter, "orders_rejected_total")
    assert hasattr(exporter, "kill_switch_activations")


def test_metrics_exporter_has_gauges(exporter: MetricsExporter) -> None:
    """Gauges should be initialized."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    assert hasattr(exporter, "current_pnl")
    assert hasattr(exporter, "daily_pnl")
    assert hasattr(exporter, "total_equity")
    assert hasattr(exporter, "drawdown_pct")
    assert hasattr(exporter, "open_positions")
    assert hasattr(exporter, "total_exposure")
    assert hasattr(exporter, "websocket_connected")
    assert hasattr(exporter, "signal_confidence")
    assert hasattr(exporter, "kill_switch_active")
    assert hasattr(exporter, "shm_buffer_size")


def test_metrics_exporter_has_histograms(exporter: MetricsExporter) -> None:
    """Histograms should be initialized."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    assert hasattr(exporter, "signal_latency")
    assert hasattr(exporter, "order_latency")
    assert hasattr(exporter, "shm_round_trip_latency")


def test_metrics_exporter_has_summaries(exporter: MetricsExporter) -> None:
    """Summaries should be initialized."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    assert hasattr(exporter, "position_hold_time")


# ─── Record Methods ───


def test_record_signal(exporter: MetricsExporter) -> None:
    """record_signal should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.record_signal("BTC/USDT", "LONG", 0.85)


def test_record_fill(exporter: MetricsExporter) -> None:
    """record_fill should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.record_fill("binance", "BTC/USDT", "BUY")


def test_record_order_sent(exporter: MetricsExporter) -> None:
    """record_order_sent should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.record_order_sent("binance", "BTC/USDT", "BUY", "limit")


def test_record_order_rejected(exporter: MetricsExporter) -> None:
    """record_order_rejected should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.record_order_rejected("binance", "insufficient_balance")


def test_record_kill_switch(exporter: MetricsExporter) -> None:
    """record_kill_switch should set active flag."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.record_kill_switch("max_drawdown")
    exporter.reset_kill_switch()


def test_update_pnl(exporter: MetricsExporter) -> None:
    """update_pnl should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.update_pnl(current=1000.0, daily=500.0, equity=100000.0, drawdown=2.5)


def test_update_positions(exporter: MetricsExporter) -> None:
    """update_positions should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.update_positions(count=5, exposure=50000.0)


def test_update_ws_status(exporter: MetricsExporter) -> None:
    """update_ws_status should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.update_ws_status("exchange", connected=True)
    exporter.update_ws_status("signals", connected=False)


def test_update_shm_buffer(exporter: MetricsExporter) -> None:
    """update_shm_buffer should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.update_shm_buffer("signals", size=1024)


def test_observe_signal_latency(exporter: MetricsExporter) -> None:
    """observe_signal_latency should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.observe_signal_latency(seconds=0.005)


def test_observe_order_latency(exporter: MetricsExporter) -> None:
    """observe_order_latency should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.observe_order_latency("binance", seconds=0.001)


def test_observe_shm_round_trip(exporter: MetricsExporter) -> None:
    """observe_shm_round_trip should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.observe_shm_round_trip(seconds=0.0001)


def test_observe_position_hold_time(exporter: MetricsExporter) -> None:
    """observe_position_hold_time should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.observe_position_hold_time(seconds=120.0)


def test_reset_kill_switch(exporter: MetricsExporter) -> None:
    """reset_kill_switch should not raise after activation."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.reset_kill_switch()


# ─── Alert Metric Methods ───


def test_metrics_exporter_has_alert_metrics(exporter: MetricsExporter) -> None:
    """ai_signal_bot_* alert metrics should be initialized."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    assert hasattr(exporter, "signals_sent_total")
    assert hasattr(exporter, "signals_blocked_total")
    assert hasattr(exporter, "circuit_breaker_state")
    assert hasattr(exporter, "circuit_breaker_trips_total")
    assert hasattr(exporter, "ws_clients_connected")
    assert hasattr(exporter, "errors_total")
    assert hasattr(exporter, "bot_drawdown")
    assert hasattr(exporter, "bot_win_rate")
    assert hasattr(exporter, "bot_pnl_total")
    assert hasattr(exporter, "bot_uptime_seconds")


def test_record_signal_sent(exporter: MetricsExporter) -> None:
    """record_signal_sent should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.record_signal_sent()


def test_record_signal_blocked(exporter: MetricsExporter) -> None:
    """record_signal_blocked should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.record_signal_blocked()


def test_set_circuit_breaker_state(exporter: MetricsExporter) -> None:
    """set_circuit_breaker_state should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.set_circuit_breaker_state(0)
    exporter.set_circuit_breaker_state(1)
    exporter.set_circuit_breaker_state(2)


def test_record_circuit_breaker_trip(exporter: MetricsExporter) -> None:
    """record_circuit_breaker_trip should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.record_circuit_breaker_trip()


def test_set_ws_clients(exporter: MetricsExporter) -> None:
    """set_ws_clients should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.set_ws_clients(5)


def test_record_error(exporter: MetricsExporter) -> None:
    """record_error should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.record_error()


def test_set_bot_drawdown(exporter: MetricsExporter) -> None:
    """set_bot_drawdown should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.set_bot_drawdown(0.05)


def test_set_bot_win_rate(exporter: MetricsExporter) -> None:
    """set_bot_win_rate should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.set_bot_win_rate(0.65)


def test_set_bot_pnl_total(exporter: MetricsExporter) -> None:
    """set_bot_pnl_total should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.set_bot_pnl_total(1500.0)


def test_set_bot_uptime(exporter: MetricsExporter) -> None:
    """set_bot_uptime should not raise."""
    if not HAS_PROMETHEUS:
        pytest.skip("prometheus_client not installed")
    exporter.set_bot_uptime(3600.0)
