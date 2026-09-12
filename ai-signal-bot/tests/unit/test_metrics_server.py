"""Tests for MetricsCollector.

Tests cover: counter increments, gauge setters, and Prometheus text format rendering.
"""
import pytest

from src.communication.metrics_server import MetricsCollector


class TestMetricsCollector:
    """Tests for MetricsCollector counter and gauge operations."""

    def test_initial_values_are_zero(self):
        mc = MetricsCollector()
        rendered = mc.render()
        assert "ai_signal_bot_signals_sent_total 0" in rendered
        assert "ai_signal_bot_signals_blocked_total 0" in rendered
        assert "ai_signal_bot_backtests_run_total 0" in rendered
        assert "ai_signal_bot_circuit_breaker_trips_total 0" in rendered
        assert "ai_signal_bot_ws_clients_connected 0" in rendered
        assert "ai_signal_bot_circuit_breaker_state 0" in rendered

    def test_record_signal_sent_increments(self):
        mc = MetricsCollector()
        mc.record_signal_sent()
        mc.record_signal_sent()
        mc.record_signal_sent()
        rendered = mc.render()
        assert "ai_signal_bot_signals_sent_total 3" in rendered

    def test_record_signal_blocked_increments(self):
        mc = MetricsCollector()
        mc.record_signal_blocked()
        mc.record_signal_blocked()
        rendered = mc.render()
        assert "ai_signal_bot_signals_blocked_total 2" in rendered

    def test_record_backtest_increments(self):
        mc = MetricsCollector()
        mc.record_backtest()
        rendered = mc.render()
        assert "ai_signal_bot_backtests_run_total 1" in rendered

    def test_record_circuit_breaker_trip_increments(self):
        mc = MetricsCollector()
        mc.record_circuit_breaker_trip()
        mc.record_circuit_breaker_trip()
        mc.record_circuit_breaker_trip()
        rendered = mc.render()
        assert "ai_signal_bot_circuit_breaker_trips_total 3" in rendered

    def test_set_ws_clients(self):
        mc = MetricsCollector()
        mc.set_ws_clients(5)
        rendered = mc.render()
        assert "ai_signal_bot_ws_clients_connected 5" in rendered

    def test_set_ws_clients_overwrite(self):
        mc = MetricsCollector()
        mc.set_ws_clients(3)
        mc.set_ws_clients(7)
        rendered = mc.render()
        assert "ai_signal_bot_ws_clients_connected 7" in rendered

    def test_set_circuit_breaker_state_closed(self):
        mc = MetricsCollector()
        mc.set_circuit_breaker_state(0)
        rendered = mc.render()
        assert "ai_signal_bot_circuit_breaker_state 0" in rendered

    def test_set_circuit_breaker_state_open(self):
        mc = MetricsCollector()
        mc.set_circuit_breaker_state(1)
        rendered = mc.render()
        assert "ai_signal_bot_circuit_breaker_state 1" in rendered

    def test_set_circuit_breaker_state_half_open(self):
        mc = MetricsCollector()
        mc.set_circuit_breaker_state(2)
        rendered = mc.render()
        assert "ai_signal_bot_circuit_breaker_state 2" in rendered

    def test_uptime_seconds_positive(self):
        mc = MetricsCollector()
        rendered = mc.render()
        # Uptime should be a positive number
        for line in rendered.split("\n"):
            if line.startswith("ai_signal_bot_uptime_seconds"):
                value = float(line.split()[-1])
                assert value >= 0.0
                return
        pytest.fail("uptime metric not found")

    def test_render_contains_all_help_lines(self):
        mc = MetricsCollector()
        rendered = mc.render()
        assert "# HELP ai_signal_bot_signals_sent_total" in rendered
        assert "# HELP ai_signal_bot_signals_blocked_total" in rendered
        assert "# HELP ai_signal_bot_ws_clients_connected" in rendered
        assert "# HELP ai_signal_bot_backtests_run_total" in rendered
        assert "# HELP ai_signal_bot_circuit_breaker_trips_total" in rendered
        assert "# HELP ai_signal_bot_circuit_breaker_state" in rendered
        assert "# HELP ai_signal_bot_uptime_seconds" in rendered

    def test_render_contains_all_type_lines(self):
        mc = MetricsCollector()
        rendered = mc.render()
        assert "# TYPE ai_signal_bot_signals_sent_total counter" in rendered
        assert "# TYPE ai_signal_bot_signals_blocked_total counter" in rendered
        assert "# TYPE ai_signal_bot_ws_clients_connected gauge" in rendered
        assert "# TYPE ai_signal_bot_backtests_run_total counter" in rendered
        assert "# TYPE ai_signal_bot_circuit_breaker_trips_total counter" in rendered
        assert "# TYPE ai_signal_bot_circuit_breaker_state gauge" in rendered
        assert "# TYPE ai_signal_bot_uptime_seconds gauge" in rendered

    def test_render_returns_string(self):
        mc = MetricsCollector()
        result = mc.render()
        assert "# HELP ai_signal_bot_" in result and "# TYPE" in result  # prometheus exposition format

    def test_render_ends_with_newline(self):
        mc = MetricsCollector()
        rendered = mc.render()
        # The last line is empty (from the trailing "" in the list)
        assert rendered.endswith("\n")

    def test_combined_counters_and_gauges(self):
        mc = MetricsCollector()
        mc.record_signal_sent()
        mc.record_signal_sent()
        mc.record_signal_blocked()
        mc.record_backtest()
        mc.record_circuit_breaker_trip()
        mc.set_ws_clients(2)
        mc.set_circuit_breaker_state(1)
        rendered = mc.render()
        assert "ai_signal_bot_signals_sent_total 2" in rendered
        assert "ai_signal_bot_signals_blocked_total 1" in rendered
        assert "ai_signal_bot_backtests_run_total 1" in rendered
        assert "ai_signal_bot_circuit_breaker_trips_total 1" in rendered
        assert "ai_signal_bot_ws_clients_connected 2" in rendered
        assert "ai_signal_bot_circuit_breaker_state 1" in rendered
