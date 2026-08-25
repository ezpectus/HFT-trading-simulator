"""Tests for health checks."""
import pytest
from src.observability.health_checks import HealthStatus, ComponentHealth, HealthCheckManager


class TestHealthChecks:
    def test_health_status_enum(self):
        assert HealthStatus.HEALTHY.value == "healthy"
        assert HealthStatus.DEGRADED.value == "degraded"
        assert HealthStatus.UNHEALTHY.value == "unhealthy"

    def test_component_health_dataclass(self):
        comp = ComponentHealth(name="websocket", status=HealthStatus.HEALTHY, message="OK")
        assert comp.name == "websocket"
        assert comp.status == HealthStatus.HEALTHY

    def test_health_check_manager_creation(self):
        manager = HealthCheckManager()
        assert manager is not None
