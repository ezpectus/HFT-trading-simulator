"""Tests for communication CircuitBreaker and MetricsServer — signal protection and Prometheus metrics."""
import asyncio
import time

import pytest

from src.communication.circuit_breaker import (
    BreakerState,
    CircuitBreaker,
    CircuitBreakerConfig,
)
from src.communication.metrics_server import MetricsCollector, MetricsServer


class TestCircuitBreakerInit:
    def test_defaults(self):
        cb = CircuitBreaker()
        assert cb.state == BreakerState.CLOSED
        assert cb.is_closed
        assert not cb.is_open
        assert cb.total_trips == 0
        assert cb.total_blocks == 0

    def test_custom_config(self):
        cb = CircuitBreaker(CircuitBreakerConfig(
            failure_threshold=3, cooldown_seconds=10, success_threshold=1
        ))
        assert cb.config.failure_threshold == 3
        assert cb.config.cooldown_seconds == 10


class TestCircuitBreakerClosed:
    def test_allows_signals_when_closed(self):
        cb = CircuitBreaker()
        assert cb.allow_signal()
        assert cb.allow_signal()

    def test_success_resets_failure_count(self):
        cb = CircuitBreaker()
        cb.record_failure()
        cb.record_failure()
        cb.record_success()
        assert cb.is_closed

    def test_does_not_trip_below_threshold(self):
        cb = CircuitBreaker(CircuitBreakerConfig(failure_threshold=5))
        for _ in range(4):
            cb.record_failure()
        assert cb.is_closed


class TestCircuitBreakerTripping:
    def test_trips_on_threshold(self):
        cb = CircuitBreaker(CircuitBreakerConfig(failure_threshold=3, cooldown_seconds=60))
        cb.record_failure()
        cb.record_failure()
        cb.record_failure()
        assert cb.is_open
        assert cb.total_trips == 1

    def test_blocks_signals_when_open(self):
        cb = CircuitBreaker(CircuitBreakerConfig(failure_threshold=1, cooldown_seconds=60))
        cb.record_failure()
        assert cb.is_open
        assert not cb.allow_signal()
        assert not cb.allow_signal()
        assert cb.total_blocks == 2


class TestCircuitBreakerRecovery:
    def test_transitions_to_half_open_after_cooldown(self):
        cb = CircuitBreaker(CircuitBreakerConfig(
            failure_threshold=1, cooldown_seconds=0.05, success_threshold=1
        ))
        cb.record_failure()
        assert cb.is_open
        time.sleep(0.06)
        assert cb.state == BreakerState.HALF_OPEN

    def test_half_open_allows_probe(self):
        cb = CircuitBreaker(CircuitBreakerConfig(
            failure_threshold=1, cooldown_seconds=0.05, half_open_max_probes=1
        ))
        cb.record_failure()
        time.sleep(0.06)
        assert cb.state == BreakerState.HALF_OPEN
        assert cb.allow_signal()
        assert not cb.allow_signal()

    def test_half_open_closes_on_success(self):
        cb = CircuitBreaker(CircuitBreakerConfig(
            failure_threshold=1, cooldown_seconds=0.05, success_threshold=2
        ))
        cb.record_failure()
        time.sleep(0.06)
        assert cb.state == BreakerState.HALF_OPEN
        cb.record_success()
        assert cb.state == BreakerState.HALF_OPEN
        cb.record_success()
        assert cb.is_closed

    def test_half_open_trips_again_on_failure(self):
        cb = CircuitBreaker(CircuitBreakerConfig(
            failure_threshold=1, cooldown_seconds=0.05
        ))
        cb.record_failure()
        time.sleep(0.06)
        assert cb.state == BreakerState.HALF_OPEN
        cb.record_failure()
        assert cb.is_open
        assert cb.total_trips == 2


class TestCircuitBreakerReset:
    def test_reset_to_closed(self):
        cb = CircuitBreaker(CircuitBreakerConfig(failure_threshold=1, cooldown_seconds=60))
        cb.record_failure()
        assert cb.is_open
        cb.reset()
        assert cb.is_closed
        assert cb.allow_signal()


class TestCircuitBreakerStatus:
    def test_status_dict(self):
        cb = CircuitBreaker(CircuitBreakerConfig(failure_threshold=3, cooldown_seconds=30))
        cb.record_failure()
        cb.record_failure()
        status = cb.get_status()
        assert status["state"] == "CLOSED"
        assert status["consecutive_failures"] == 2
        assert status["failure_threshold"] == 3
        assert status["cooldown_seconds"] == 30
        assert status["total_trips"] == 0


class TestMetricsCollector:
    def test_init(self):
        mc = MetricsCollector()
        assert mc._signals_sent == 0
        assert mc._signals_blocked == 0
        assert mc._backtests_run == 0

    def test_record_signal_sent(self):
        mc = MetricsCollector()
        mc.record_signal_sent()
        mc.record_signal_sent()
        assert mc._signals_sent == 2

    def test_record_signal_blocked(self):
        mc = MetricsCollector()
        mc.record_signal_blocked()
        assert mc._signals_blocked == 1

    def test_record_backtest(self):
        mc = MetricsCollector()
        mc.record_backtest()
        mc.record_backtest()
        mc.record_backtest()
        assert mc._backtests_run == 3

    def test_set_ws_clients(self):
        mc = MetricsCollector()
        mc.set_ws_clients(5)
        assert mc._ws_clients == 5

    def test_set_circuit_breaker_state(self):
        mc = MetricsCollector()
        mc.set_circuit_breaker_state(1)
        assert mc._cb_state == 1

    def test_record_circuit_breaker_trip(self):
        mc = MetricsCollector()
        mc.record_circuit_breaker_trip()
        mc.record_circuit_breaker_trip()
        assert mc._cb_trips == 2

    def test_render_contains_all_metrics(self):
        mc = MetricsCollector()
        mc.record_signal_sent()
        mc.record_signal_blocked()
        mc.record_backtest()
        mc.set_ws_clients(3)
        mc.record_circuit_breaker_trip()
        mc.set_circuit_breaker_state(1)
        output = mc.render()
        assert "ai_signal_bot_signals_sent_total 1" in output
        assert "ai_signal_bot_signals_blocked_total 1" in output
        assert "ai_signal_bot_ws_clients_connected 3" in output
        assert "ai_signal_bot_backtests_run_total 1" in output
        assert "ai_signal_bot_circuit_breaker_trips_total 1" in output
        assert "ai_signal_bot_circuit_breaker_state 1" in output
        assert "ai_signal_bot_uptime_seconds" in output

    def test_render_prometheus_format(self):
        mc = MetricsCollector()
        output = mc.render()
        assert "# HELP" in output
        assert "# TYPE" in output
        assert "counter" in output
        assert "gauge" in output


class TestMetricsServer:
    @pytest.mark.asyncio
    async def test_server_start_stop(self):
        mc = MetricsCollector()
        server = MetricsServer(mc, host="127.0.0.1", port=19091)
        await server.start()
        assert server._server is not None
        await server.stop()

    @pytest.mark.asyncio
    async def test_server_responds_with_metrics(self):
        mc = MetricsCollector()
        mc.record_signal_sent()
        server = MetricsServer(mc, host="127.0.0.1", port=19092)
        await server.start()

        try:
            reader, writer = await asyncio.open_connection("127.0.0.1", 19092)
            writer.write(b"GET /metrics HTTP/1.1\r\nHost: localhost\r\n\r\n")
            await writer.drain()

            response = await reader.read(4096)
            response_str = response.decode("utf-8")
            assert "200 OK" in response_str
            assert "ai_signal_bot_signals_sent_total 1" in response_str
            writer.close()
            await writer.wait_closed()
        finally:
            await server.stop()
