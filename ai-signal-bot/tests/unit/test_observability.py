"""Tests for observability modules — health_checks, tracing, logging."""
import logging
import os
import time
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.observability.health_checks import (
    ComponentHealth,
    HealthChecker,
    HealthStatus,
)
from src.observability.tracing import get_tracer, shutdown_tracing
from src.observability.logging import get_logger, bind_context, clear_context


class TestHealthStatus:
    def test_values(self):
        assert HealthStatus.HEALTHY.value == "healthy"
        assert HealthStatus.DEGRADED.value == "degraded"
        assert HealthStatus.UNHEALTHY.value == "unhealthy"


class TestComponentHealth:
    def test_defaults(self):
        comp = ComponentHealth("ws", HealthStatus.HEALTHY)
        assert comp.name == "ws"
        assert comp.status == HealthStatus.HEALTHY
        assert comp.latency_ms == 0.0
        assert comp.details == ""
        assert comp.last_check > 0

    def test_with_values(self):
        comp = ComponentHealth("db", HealthStatus.UNHEALTHY, latency_ms=5.5, details="timeout")
        assert comp.latency_ms == 5.5
        assert comp.details == "timeout"


class TestHealthChecker:
    def test_init_no_clients(self):
        checker = HealthChecker()
        assert checker.ws_client is None
        assert checker.db_client is None
        assert checker.redis_client is None
        assert checker.exchange is None
        assert checker._signal_count == 0
        assert checker._order_count == 0
        assert checker._error_count == 0

    def test_record_signal(self):
        checker = HealthChecker()
        checker.record_signal()
        assert checker._signal_count == 1
        assert checker._last_signal_time > 0

    def test_record_order(self):
        checker = HealthChecker()
        checker.record_order()
        assert checker._order_count == 1
        assert checker._last_order_time > 0

    def test_record_error(self):
        checker = HealthChecker()
        checker.record_error()
        assert checker._error_count == 1

    @pytest.mark.asyncio
    async def test_check_liveness(self):
        checker = HealthChecker()
        result = await checker.check_liveness()
        assert result["status"] == "alive"
        assert result["uptime_seconds"] >= 0
        assert "pid" in result

    @pytest.mark.asyncio
    async def test_check_readiness_no_clients(self):
        checker = HealthChecker()
        result = await checker.check_readiness()
        assert result["status"] == "healthy"
        assert len(result["components"]) == 4
        for comp in result["components"]:
            assert comp["status"] == "healthy"

    @pytest.mark.asyncio
    async def test_check_readiness_unhealthy_ws(self):
        ws_client = MagicMock()
        ws_client.connected = False
        checker = HealthChecker(ws_client=ws_client)
        result = await checker.check_readiness()
        assert result["status"] == "unhealthy"

    @pytest.mark.asyncio
    async def test_check_readiness_healthy_ws(self):
        ws_client = MagicMock()
        ws_client.connected = True
        checker = HealthChecker(ws_client=ws_client)
        result = await checker.check_readiness()
        ws_comp = [c for c in result["components"] if c["name"] == "websocket"][0]
        assert ws_comp["status"] == "healthy"

    @pytest.mark.asyncio
    async def test_check_readiness_with_metrics(self):
        checker = HealthChecker()
        checker.record_signal()
        checker.record_order()
        checker.record_error()
        result = await checker.check_readiness()
        assert result["metrics"]["signals_total"] == 1
        assert result["metrics"]["orders_total"] == 1
        assert result["metrics"]["errors_total"] == 1
        assert result["metrics"]["last_signal_age_s"] is not None
        assert result["metrics"]["last_order_age_s"] is not None

    @pytest.mark.asyncio
    async def test_check_status(self):
        checker = HealthChecker()
        result = await checker.check_status()
        assert result["status"] == "healthy"
        assert "uptime_seconds" in result
        assert "pid" in result
        assert result["version"] == "1.0.0"

    @pytest.mark.asyncio
    async def test_check_readiness_degraded_exchange(self):
        exchange = MagicMock()
        exchange.is_trading_active = False
        checker = HealthChecker(exchange=exchange)
        result = await checker.check_readiness()
        assert result["status"] == "degraded"


class TestTracing:
    def test_get_tracer_noop(self):
        tracer = get_tracer("test")
        assert tracer is not None

    def test_noop_tracer_span(self):
        tracer = get_tracer("test")
        with tracer.start_as_current_span("test_span") as span:
            span.set_attribute("key", "value")
            span.set_status("ok")
            span.record_exception(Exception("test"))
            span.add_event("event")

    def test_shutdown_without_init(self):
        shutdown_tracing()


class TestLogging:
    def test_get_logger(self):
        log = get_logger("test_module")
        assert log is not None

    def test_bind_context_no_crash(self):
        bind_context(symbol="BTC/USDT", strategy="trend")

    def test_clear_context_no_crash(self):
        clear_context()
