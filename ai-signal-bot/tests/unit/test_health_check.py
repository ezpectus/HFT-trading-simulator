"""Tests for HealthAggregator — health check aggregation endpoint.

Tests cover: service health checks (healthy/degraded/unhealthy/timeout/error),
aggregation logic, overall status computation, and HTTP handler behavior.
"""
import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

import pytest

from src.communication.health_check import HealthAggregator


class TestHealthAggregatorInit:
    def test_default_services(self):
        ha = HealthAggregator()
        assert "ai-signal-bot" in ha.services
        assert "exchange-simulator" in ha.services
        assert "hft-trade-bot" in ha.services

    def test_custom_services(self):
        custom = {"svc1": "http://localhost:1111/health"}
        ha = HealthAggregator(services=custom)
        assert ha.services == custom

    def test_custom_port(self):
        ha = HealthAggregator(port=9999)
        assert ha.port == 9999


class TestCheckServiceHealthy:
    @pytest.mark.asyncio
    async def test_healthy_service(self):
        ha = HealthAggregator()
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value={"status": "ok"})
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_ctx.__aexit__ = AsyncMock(return_value=None)
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)
        mock_session.get = MagicMock(return_value=mock_ctx)
        with patch("aiohttp.ClientSession", return_value=mock_session):
            result = await ha._check_service("test", "http://localhost/health")
        assert result["status"] == "healthy"
        assert "latency_ms" in result
        assert result["details"] == {"status": "ok"}


class TestCheckServiceDegraded:
    @pytest.mark.asyncio
    async def test_degraded_service_non_200(self):
        ha = HealthAggregator()
        mock_resp = AsyncMock()
        mock_resp.status = 503
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_ctx.__aexit__ = AsyncMock(return_value=None)
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)
        mock_session.get = MagicMock(return_value=mock_ctx)
        with patch("aiohttp.ClientSession", return_value=mock_session):
            result = await ha._check_service("test", "http://localhost/health")
        assert result["status"] == "degraded"
        assert result["http_status"] == 503


class TestCheckServiceUnhealthy:
    @pytest.mark.asyncio
    async def test_timeout(self):
        ha = HealthAggregator()
        with patch("aiohttp.ClientSession", side_effect=TimeoutError()):
            result = await ha._check_service("test", "http://localhost/health")
        assert result["status"] == "unhealthy"
        assert result["error"] == "timeout"

    @pytest.mark.asyncio
    async def test_connection_refused(self):
        ha = HealthAggregator()
        with patch("aiohttp.ClientSession", side_effect=ConnectionRefusedError()):
            result = await ha._check_service("test", "http://localhost/health")
        assert result["status"] == "unhealthy"
        assert result["error"] == "connection refused"

    @pytest.mark.asyncio
    async def test_generic_exception(self):
        ha = HealthAggregator()
        with patch("aiohttp.ClientSession", side_effect=RuntimeError("boom")):
            result = await ha._check_service("test", "http://localhost/health")
        assert result["status"] == "unhealthy"
        assert "boom" in result["error"]


class TestAggregate:
    @pytest.mark.asyncio
    async def test_all_healthy(self):
        ha = HealthAggregator(services={"a": "http://a/health", "b": "http://b/health"})
        with patch.object(ha, "_check_service", new_callable=AsyncMock) as mock_check:
            mock_check.side_effect = [
                {"status": "healthy", "latency_ms": 1.0},
                {"status": "healthy", "latency_ms": 2.0},
            ]
            result = await ha._aggregate()
        assert result["status"] == "healthy"
        assert result["services"]["a"]["status"] == "healthy"
        assert result["services"]["b"]["status"] == "healthy"
        assert "timestamp" in result

    @pytest.mark.asyncio
    async def test_one_unhealthy(self):
        ha = HealthAggregator(services={"a": "http://a/health", "b": "http://b/health"})
        with patch.object(ha, "_check_service", new_callable=AsyncMock) as mock_check:
            mock_check.side_effect = [
                {"status": "healthy", "latency_ms": 1.0},
                {"status": "unhealthy", "error": "connection refused"},
            ]
            result = await ha._aggregate()
        assert result["status"] == "unhealthy"

    @pytest.mark.asyncio
    async def test_one_degraded_no_unhealthy(self):
        ha = HealthAggregator(services={"a": "http://a/health", "b": "http://b/health"})
        with patch.object(ha, "_check_service", new_callable=AsyncMock) as mock_check:
            mock_check.side_effect = [
                {"status": "healthy", "latency_ms": 1.0},
                {"status": "degraded", "http_status": 503},
            ]
            result = await ha._aggregate()
        assert result["status"] == "degraded"

    @pytest.mark.asyncio
    async def test_mixed_degraded_and_unhealthy(self):
        ha = HealthAggregator(services={"a": "http://a/health", "b": "http://b/health", "c": "http://c/health"})
        with patch.object(ha, "_check_service", new_callable=AsyncMock) as mock_check:
            mock_check.side_effect = [
                {"status": "degraded", "http_status": 503},
                {"status": "unhealthy", "error": "timeout"},
                {"status": "healthy", "latency_ms": 1.0},
            ]
            result = await ha._aggregate()
        # any_unhealthy → overall unhealthy
        assert result["status"] == "unhealthy"

    @pytest.mark.asyncio
    async def test_all_degraded(self):
        ha = HealthAggregator(services={"a": "http://a/health", "b": "http://b/health"})
        with patch.object(ha, "_check_service", new_callable=AsyncMock) as mock_check:
            mock_check.side_effect = [
                {"status": "degraded", "http_status": 503},
                {"status": "degraded", "http_status": 500},
            ]
            result = await ha._aggregate()
        assert result["status"] == "degraded"

    @pytest.mark.asyncio
    async def test_timestamp_is_int(self):
        ha = HealthAggregator(services={"a": "http://a/health"})
        with patch.object(ha, "_check_service", new_callable=AsyncMock) as mock_check:
            mock_check.side_effect = [{"status": "healthy", "latency_ms": 1.0}]
            result = await ha._aggregate()
        assert isinstance(result["timestamp"], int)

    @pytest.mark.asyncio
    async def test_empty_services(self):
        ha = HealthAggregator(services={})
        result = await ha._aggregate()
        # all() of empty → True, any() of empty → False → "healthy"
        assert result["status"] == "healthy"
        assert result["services"] == {}


class TestHandleHealth:
    @pytest.mark.asyncio
    async def test_handler_returns_200_when_healthy(self):
        ha = HealthAggregator(services={"a": "http://a/health"})
        with patch.object(ha, "_check_service", new_callable=AsyncMock) as mock_check:
            mock_check.side_effect = [{"status": "healthy", "latency_ms": 1.0}]
            mock_request = MagicMock()
            response = await ha._handle_health(mock_request)
        assert response.status == 200

    @pytest.mark.asyncio
    async def test_handler_returns_503_when_unhealthy(self):
        ha = HealthAggregator(services={"a": "http://a/health"})
        with patch.object(ha, "_check_service", new_callable=AsyncMock) as mock_check:
            mock_check.side_effect = [{"status": "unhealthy", "error": "timeout"}]
            mock_request = MagicMock()
            response = await ha._handle_health(mock_request)
        assert response.status == 503

    @pytest.mark.asyncio
    async def test_handler_returns_200_when_degraded(self):
        ha = HealthAggregator(services={"a": "http://a/health"})
        with patch.object(ha, "_check_service", new_callable=AsyncMock) as mock_check:
            mock_check.side_effect = [{"status": "degraded", "http_status": 503}]
            mock_request = MagicMock()
            response = await ha._handle_health(mock_request)
        # degraded → 200 (not 503)
        assert response.status == 200


class TestStartStop:
    @pytest.mark.asyncio
    async def test_start_and_stop(self):
        ha = HealthAggregator(port=19093)
        await ha.start()
        assert ha._runner is not None
        assert ha._site is not None
        await ha.stop()

    @pytest.mark.asyncio
    async def test_stop_without_start(self):
        ha = HealthAggregator()
        # Should not raise
        await ha.stop()
