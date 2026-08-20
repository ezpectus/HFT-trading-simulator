"""Unit tests for HealthServer — health check HTTP server.

Tests cover: check registration, sync/async check execution,
failing checks, endpoint responses, readiness/liveness probes.
"""
import asyncio
import time

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.monitoring.health_server import HealthServer

# ─── Fixtures ───


@pytest.fixture
async def server() -> HealthServer:
    """Create a HealthServer instance without starting it."""
    return HealthServer(port=0, host="127.0.0.1")


@pytest.fixture
async def client(server: HealthServer) -> TestClient:
    """Create a test client for the HealthServer app."""
    app = server._create_app()
    test_server = TestServer(app)
    client = TestClient(test_server)
    await client.start_server()
    yield client
    await client.close()


# ─── Test: Registration ───


class TestRegistration:
    """Test health check registration."""

    def test_register_check(self, server: HealthServer):
        """Test registering a health check function."""
        def check_fn():
            return {"healthy": True}

        server.register_check("exchange", check_fn)
        assert "exchange" in server._checks
        assert server._checks["exchange"] is check_fn

    def test_register_multiple_checks(self, server: HealthServer):
        """Test registering multiple health checks."""
        server.register_check("exchange", lambda: {"healthy": True})
        server.register_check("database", lambda: {"healthy": True})
        server.register_check("shm", lambda: {"healthy": True})
        assert len(server._checks) == 3


# ─── Test: Check Execution ───


class TestCheckExecution:
    """Test health check execution."""

    @pytest.mark.asyncio
    async def test_check_no_registered(self, server: HealthServer):
        """Test check when no check is registered returns healthy default."""
        result = await server._check_exchange()
        assert result["healthy"] is True
        assert "message" in result

    @pytest.mark.asyncio
    async def test_check_sync_function(self, server: HealthServer):
        """Test sync check function."""
        server.register_check("exchange", lambda: {"healthy": True, "latency": 10})
        result = await server._check_exchange()
        assert result["healthy"] is True
        assert result["latency"] == 10

    @pytest.mark.asyncio
    async def test_check_async_function(self, server: HealthServer):
        """Test async check function."""
        async def async_check():
            await asyncio.sleep(0.001)
            return {"healthy": True, "async": True}

        server.register_check("database", async_check)
        result = await server._check_database()
        assert result["healthy"] is True
        assert result["async"] is True

    @pytest.mark.asyncio
    async def test_check_failing_function(self, server: HealthServer):
        """Test check function that raises an exception."""
        def bad_check():
            raise RuntimeError("connection refused")

        server.register_check("shm", bad_check)
        result = await server._check_shm()
        assert result["healthy"] is False
        assert "connection refused" in result["error"]

    @pytest.mark.asyncio
    async def test_check_all_healthy(self, server: HealthServer):
        """Test _check_all when all checks are healthy."""
        server.register_check("exchange", lambda: {"healthy": True})
        server.register_check("database", lambda: {"healthy": True})
        server.register_check("shm", lambda: {"healthy": True})
        result = await server._check_all()
        assert result["healthy"] is True
        assert "uptime_seconds" in result
        assert "timestamp" in result
        assert "components" in result

    @pytest.mark.asyncio
    async def test_check_all_unhealthy(self, server: HealthServer):
        """Test _check_all when one check is unhealthy."""
        server.register_check("exchange", lambda: {"healthy": True})
        server.register_check("database", lambda: {"healthy": False, "error": "timeout"})
        server.register_check("shm", lambda: {"healthy": True})
        result = await server._check_all()
        assert result["healthy"] is False
        assert result["components"]["database"]["healthy"] is False

    @pytest.mark.asyncio
    async def test_check_all_no_checks(self, server: HealthServer):
        """Test _check_all when no checks are registered — defaults to healthy."""
        result = await server._check_all()
        assert result["healthy"] is True
        assert result["components"]["exchange"]["healthy"] is True
        assert result["components"]["database"]["healthy"] is True
        assert result["components"]["shm"]["healthy"] is True


# ─── Test: HTTP Endpoints ───


class TestEndpoints:
    """Test HTTP endpoint responses."""

    @pytest.mark.asyncio
    async def test_health_endpoint_healthy(self, client: TestClient):
        """Test GET /health returns 200 when healthy."""
        resp = await client.get("/health")
        assert resp.status == 200
        data = await resp.json()
        assert data["healthy"] is True

    @pytest.mark.asyncio
    async def test_health_endpoint_unhealthy(self, client: TestClient, server: HealthServer):
        """Test GET /health returns 503 when unhealthy."""
        server.register_check("exchange", lambda: {"healthy": False, "error": "down"})
        # Rebuild app with the registered check
        app = server._create_app()
        test_server = TestServer(app)
        client2 = TestClient(test_server)
        await client2.start_server()
        try:
            resp = await client2.get("/health")
            assert resp.status == 503
            data = await resp.json()
            assert data["healthy"] is False
        finally:
            await client2.close()

    @pytest.mark.asyncio
    async def test_health_exchange_endpoint(self, client: TestClient):
        """Test GET /health/exchange."""
        resp = await client.get("/health/exchange")
        assert resp.status == 200
        data = await resp.json()
        assert data["healthy"] is True

    @pytest.mark.asyncio
    async def test_health_database_endpoint(self, client: TestClient):
        """Test GET /health/database."""
        resp = await client.get("/health/database")
        assert resp.status == 200
        data = await resp.json()
        assert data["healthy"] is True

    @pytest.mark.asyncio
    async def test_health_shm_endpoint(self, client: TestClient):
        """Test GET /health/shm."""
        resp = await client.get("/health/shm")
        assert resp.status == 200
        data = await resp.json()
        assert data["healthy"] is True

    @pytest.mark.asyncio
    async def test_ready_endpoint(self, client: TestClient):
        """Test GET /ready returns readiness status."""
        resp = await client.get("/ready")
        assert resp.status == 200
        data = await resp.json()
        assert data["ready"] is True

    @pytest.mark.asyncio
    async def test_live_endpoint(self, client: TestClient):
        """Test GET /live returns liveness status."""
        resp = await client.get("/live")
        assert resp.status == 200
        data = await resp.json()
        assert data["alive"] is True
        assert "uptime" in data


# ─── Test: Edge Cases ───


class TestEdgeCases:
    """Test edge cases."""

    @pytest.mark.asyncio
    async def test_uptime_increases(self, server: HealthServer):
        """Test that uptime increases over time."""
        result1 = await server._check_all()
        await asyncio.sleep(0.05)
        result2 = await server._check_all()
        assert result2["uptime_seconds"] > result1["uptime_seconds"]

    @pytest.mark.asyncio
    async def test_check_with_type_error(self, server: HealthServer):
        """Test check function that raises TypeError."""
        server.register_check("exchange", lambda: None["key"])
        result = await server._check_exchange()
        assert result["healthy"] is False
        assert "error" in result

    @pytest.mark.asyncio
    async def test_check_with_os_error(self, server: HealthServer):
        """Test check function that raises OSError."""
        def os_check():
            raise OSError("network unreachable")

        server.register_check("database", os_check)
        result = await server._check_database()
        assert result["healthy"] is False
        assert "network unreachable" in result["error"]

    def test_default_port(self):
        """Test default port is 8080."""
        hs = HealthServer()
        assert hs.port == 8080

    def test_custom_port(self):
        """Test custom port."""
        hs = HealthServer(port=9999)
        assert hs.port == 9999

    def test_default_host(self):
        """Test default host."""
        hs = HealthServer()
        assert hs.host == "0.0.0.0"

    def test_custom_host(self):
        """Test custom host."""
        hs = HealthServer(host="127.0.0.1")
        assert hs.host == "127.0.0.1"
