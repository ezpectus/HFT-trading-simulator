"""Tests for health checks."""
import pytest

from src.observability.health_checks import ComponentHealth, HealthChecker, HealthStatus


class TestHealthChecks:
    def test_health_status_enum(self):
        assert HealthStatus.HEALTHY.value == "healthy"
        assert HealthStatus.DEGRADED.value == "degraded"
        assert HealthStatus.UNHEALTHY.value == "unhealthy"

    def test_component_health_dataclass(self):
        comp = ComponentHealth(name="websocket", status=HealthStatus.HEALTHY, details="OK")
        assert comp.name == "websocket"
        assert comp.status == HealthStatus.HEALTHY

    def test_health_checker_creation(self):
        checker = HealthChecker()
        assert checker is not None
