"""Tests for MetricsCollector and MetricsServer.

Tests cover: counter increments, gauge setters, Prometheus text format rendering,
HTTP server lifecycle, and HTTP response format.
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

from src.communication.metrics_server import MetricsCollector, MetricsServer


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
        assert isinstance(result, str)

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


class TestMetricsServer:
    """Tests for MetricsServer HTTP lifecycle."""

    def test_init_defaults(self):
        mc = MetricsCollector()
        server = MetricsServer(mc)
        assert server.host == "0.0.0.0"  # nosec: B104
        assert server.port == 9091
        assert server.collector is mc

    def test_init_custom_host_port(self):
        mc = MetricsCollector()
        server = MetricsServer(mc, host="127.0.0.1", port=9092)
        assert server.host == "127.0.0.1"
        assert server.port == 9092

    @pytest.mark.asyncio
    async def test_start_creates_server(self):
        mc = MetricsCollector()
        server = MetricsServer(mc, host="127.0.0.1", port=0)
        mock_server = MagicMock()
        mock_server.wait_closed = AsyncMock()
        with patch("asyncio.start_server", new_callable=AsyncMock, return_value=mock_server):
            await server.start()
            assert server._server is mock_server

    @pytest.mark.asyncio
    async def test_stop_closes_server(self):
        mc = MetricsCollector()
        server = MetricsServer(mc, host="127.0.0.1", port=0)
        mock_server = MagicMock()
        mock_server.wait_closed = AsyncMock()
        server._server = mock_server
        await server.stop()
        mock_server.close.assert_called_once()
        mock_server.wait_closed.assert_called_once()

    @pytest.mark.asyncio
    async def test_stop_without_start_is_noop(self):
        mc = MetricsCollector()
        server = MetricsServer(mc)
        # Should not raise
        await server.stop()

    @pytest.mark.asyncio
    async def test_handle_connection_returns_metrics(self):
        mc = MetricsCollector()
        mc.record_signal_sent()
        server = MetricsServer(mc)

        reader = AsyncMock()
        writer = MagicMock()
        writer.drain = AsyncMock()
        writer.wait_closed = AsyncMock()
        # Simulate HTTP request: "GET /metrics HTTP/1.1\r\n\r\n"
        reader.readline.side_effect = [
            b"GET /metrics HTTP/1.1\r\n",
            b"\r\n",
        ]

        await server._handle_connection(reader, writer)

        # Verify response was written
        assert writer.write.called
        written_data = writer.write.call_args[0][0]
        assert b"HTTP/1.1 200 OK" in written_data
        assert b"Content-Type: text/plain" in written_data
        assert b"ai_signal_bot_signals_sent_total 1" in written_data

    @pytest.mark.asyncio
    async def test_handle_connection_closes_writer(self):
        mc = MetricsCollector()
        server = MetricsServer(mc)

        reader = AsyncMock()
        writer = MagicMock()
        writer.drain = AsyncMock()
        writer.wait_closed = AsyncMock()
        reader.readline.side_effect = [b"GET /metrics HTTP/1.1\r\n", b"\r\n"]

        await server._handle_connection(reader, writer)

        writer.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_handle_connection_content_length_matches_body(self):
        mc = MetricsCollector()
        server = MetricsServer(mc)

        reader = AsyncMock()
        writer = MagicMock()
        writer.drain = AsyncMock()
        writer.wait_closed = AsyncMock()
        reader.readline.side_effect = [b"GET /metrics HTTP/1.1\r\n", b"\r\n"]

        await server._handle_connection(reader, writer)

        written_data = writer.write.call_args[0][0]
        # Parse Content-Length header
        headers_part = written_data.split(b"\r\n\r\n")[0]
        content_length = None
        for line in headers_part.split(b"\r\n"):
            if line.lower().startswith(b"content-length:"):
                content_length = int(line.split(b":")[1].strip())
        assert content_length is not None
        body = written_data.split(b"\r\n\r\n")[1]
        assert len(body) == content_length
