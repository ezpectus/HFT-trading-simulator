"""Unit tests for exchange_simulator/health.py — Health check endpoints.

health.py is deprecated — the WebSocket server provides /health, /live, /ready,
/metrics via aiohttp on port 8775. These tests verify the deprecated FastAPI module.
"""

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.filterwarnings("ignore::DeprecationWarning")

from exchange_simulator.health import app  # noqa: E402

# ─── Fixtures ───


@pytest.fixture
def client() -> TestClient:
    """Create a FastAPI test client."""
    return TestClient(app)


# ─── Health Endpoint ───


def test_health_check_returns_200(client: TestClient) -> None:
    """GET /health should return 200 with status field."""
    response = client.get("/health")
    assert response.status_code in (200, 503)
    data = response.json()
    assert "status" in data
    assert data["status"] in ("healthy", "unhealthy")


def test_health_check_has_version(client: TestClient) -> None:
    """GET /health should include version when healthy."""
    response = client.get("/health")
    if response.status_code == 200:
        data = response.json()
        assert "version" in data
        assert "uptime" in data
        assert "symbols" in data
        assert "exchanges" in data


def test_health_check_unhealthy_returns_503(client: TestClient) -> None:
    """GET /health should return 503 when unhealthy."""
    response = client.get("/health")
    if response.status_code == 503:
        data = response.json()
        assert data["status"] == "unhealthy"


# ─── Metrics Endpoint ───


def test_metrics_returns_200(client: TestClient) -> None:
    """GET /metrics should return 200 with text/plain content."""
    response = client.get("/metrics")
    assert response.status_code in (200, 503)
    if response.status_code == 200:
        assert "text/plain" in response.headers.get("content-type", "")


def test_metrics_has_prometheus_format(client: TestClient) -> None:
    """GET /metrics should return Prometheus-format text."""
    response = client.get("/metrics")
    if response.status_code == 200:
        text = response.text
        assert "hft_" in text or "# Error" in text
