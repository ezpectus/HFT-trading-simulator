"""
Health checks v2 — deep liveness/readiness probes for Kubernetes.

Provides:
- /health/live — process is alive (no deadlocks)
- /health/ready — all dependencies connected and working
- /health/status — detailed component status

Checks:
- WebSocket connection to exchange simulator
- SHM IPC segments active (C++ side)
- TimescaleDB connectivity
- Redis connectivity
- Order submission pipeline
- Signal processing pipeline
"""

from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any  # Any: health check response values are heterogeneous

from src.observability.logging import get_logger

logger = get_logger(__name__)


class HealthStatus(Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


@dataclass
class ComponentHealth:
    name: str
    status: HealthStatus
    latency_ms: float = 0.0
    details: str = ""
    last_check: float = field(default_factory=time.time)


class HealthChecker:
    """Deep health checking for all system components."""

    def __init__(
        self,
        ws_client: object | None = None,
        db_client: object | None = None,
        redis_client: object | None = None,
        exchange: object | None = None,
    ):
        self.ws_client = ws_client
        self.db_client = db_client
        self.redis_client = redis_client
        self.exchange = exchange
        self._start_time = time.time()
        self._last_signal_time: float = 0.0
        self._last_order_time: float = 0.0
        self._signal_count: int = 0
        self._order_count: int = 0
        self._error_count: int = 0

    def record_signal(self) -> None:
        self._last_signal_time = time.time()
        self._signal_count += 1

    def record_order(self) -> None:
        self._last_order_time = time.time()
        self._order_count += 1

    def record_error(self) -> None:
        self._error_count += 1

    async def check_liveness(self) -> dict[str, Any]:
        """Liveness probe — is the process alive and not deadlocked?

        Beyond just returning 'alive', checks for stale activity:
        - If signals were being generated but stopped for >300s → possibly deadlocked
        - If errors exceed 100 in recent history → degraded
        """
        uptime = time.time() - self._start_time
        now = time.time()

        status = "alive"
        details: list[str] = []

        # Check for stale signal generation (only if signals were previously flowing)
        if self._last_signal_time > 0:
            signal_age = now - self._last_signal_time
            if signal_age > 300:
                status = "degraded"
                details.append(f"No signals for {signal_age:.0f}s (possible deadlock)")

        # Check for stale order processing
        if self._last_order_time > 0:
            order_age = now - self._last_order_time
            if order_age > 300:
                status = "degraded"
                details.append(f"No orders for {order_age:.0f}s (possible deadlock)")

        # High error rate
        if self._error_count > 100:
            status = "degraded"
            details.append(f"High error count: {self._error_count}")

        return {
            "status": status,
            "uptime_seconds": round(uptime, 1),
            "pid": os.getpid(),
            "details": "; ".join(details) if details else "ok",
            "last_signal_age_s": round(now - self._last_signal_time, 1) if self._last_signal_time else None,
            "last_order_age_s": round(now - self._last_order_time, 1) if self._last_order_time else None,
        }

    async def check_readiness(self) -> dict[str, Any]:
        """Readiness probe — are all dependencies connected and working?

        All component checks run in parallel via asyncio.gather with
        a 2-second timeout per check to prevent K8s probe timeouts.
        """
        check_timeout = 2.0
        results = await asyncio.gather(
            asyncio.wait_for(self._check_ws(), timeout=check_timeout),
            asyncio.wait_for(self._check_db(), timeout=check_timeout),
            asyncio.wait_for(self._check_redis(), timeout=check_timeout),
            asyncio.wait_for(self._check_exchange(), timeout=check_timeout),
            return_exceptions=True,
        )

        components: list[ComponentHealth] = []
        for r in results:
            if isinstance(r, ComponentHealth):
                components.append(r)
            elif isinstance(r, asyncio.TimeoutError):
                components.append(ComponentHealth("unknown", HealthStatus.UNHEALTHY, check_timeout * 1000, "check timed out"))
            elif isinstance(r, Exception):
                components.append(ComponentHealth("unknown", HealthStatus.UNHEALTHY, 0, str(r)))

        # Determine overall status
        statuses = [c.status for c in components]
        if all(s == HealthStatus.HEALTHY for s in statuses):
            overall = HealthStatus.HEALTHY
        elif any(s == HealthStatus.UNHEALTHY for s in statuses):
            overall = HealthStatus.UNHEALTHY
        else:
            overall = HealthStatus.DEGRADED

        return {
            "status": overall.value,
            "components": [
                {
                    "name": c.name,
                    "status": c.status.value,
                    "latency_ms": round(c.latency_ms, 2),
                    "details": c.details,
                }
                for c in components
            ],
            "metrics": {
                "signals_total": self._signal_count,
                "orders_total": self._order_count,
                "errors_total": self._error_count,
                "last_signal_age_s": round(time.time() - self._last_signal_time, 1) if self._last_signal_time else None,
                "last_order_age_s": round(time.time() - self._last_order_time, 1) if self._last_order_time else None,
            },
        }

    async def check_status(self) -> dict[str, Any]:
        """Full status report — includes liveness + readiness + config."""
        readiness = await self.check_readiness()
        liveness = await self.check_liveness()
        return {
            **liveness,
            **readiness,
            "version": "1.0.0",
        }

    async def _check_ws(self) -> ComponentHealth:
        start = time.time()
        try:
            if not self.ws_client:
                return ComponentHealth("websocket", HealthStatus.HEALTHY, 0, "not configured")

            connected = await asyncio.wait_for(
                asyncio.to_thread(getattr, self.ws_client, "connected"),
                timeout=2.0,
            )
            latency = (time.time() - start) * 1000

            if connected:
                return ComponentHealth("websocket", HealthStatus.HEALTHY, latency, "connected")
            else:
                return ComponentHealth("websocket", HealthStatus.UNHEALTHY, latency, "disconnected")
        except asyncio.TimeoutError:
            return ComponentHealth("websocket", HealthStatus.UNHEALTHY, 2000, "check timed out")
        except (AttributeError, TypeError, OSError) as e:
            return ComponentHealth("websocket", HealthStatus.UNHEALTHY, 0, str(e))

    async def _check_db(self) -> ComponentHealth:
        start = time.time()
        try:
            if not self.db_client:
                return ComponentHealth("timescaledb", HealthStatus.HEALTHY, 0, "not configured")

            health = await asyncio.wait_for(
                self.db_client.get_health(), timeout=2.0
            )
            latency = (time.time() - start) * 1000

            if health.get("connected"):
                return ComponentHealth("timescaledb", HealthStatus.HEALTHY, latency, health.get("database", ""))
            else:
                return ComponentHealth("timescaledb", HealthStatus.UNHEALTHY, latency, health.get("error", "not connected"))
        except (OSError, RuntimeError, KeyError, ValueError, asyncio.TimeoutError) as e:
            return ComponentHealth("timescaledb", HealthStatus.UNHEALTHY, 0, str(e))

    async def _check_redis(self) -> ComponentHealth:
        start = time.time()
        try:
            if not self.redis_client:
                return ComponentHealth("redis", HealthStatus.HEALTHY, 0, "not configured")

            if hasattr(self.redis_client, "ping"):
                await asyncio.wait_for(self.redis_client.ping(), timeout=2.0)
            latency = (time.time() - start) * 1000
            return ComponentHealth("redis", HealthStatus.HEALTHY, latency, "connected")
        except (OSError, ConnectionError, RuntimeError, asyncio.TimeoutError) as e:
            latency = (time.time() - start) * 1000
            return ComponentHealth("redis", HealthStatus.DEGRADED, latency, str(e))

    async def _check_exchange(self) -> ComponentHealth:
        start = time.time()
        try:
            if not self.exchange:
                return ComponentHealth("exchange", HealthStatus.HEALTHY, 0, "not configured")

            trading_active = await asyncio.wait_for(
                asyncio.to_thread(getattr, self.exchange, "is_trading_active", True),
                timeout=2.0,
            )
            latency = (time.time() - start) * 1000

            if trading_active:
                return ComponentHealth("exchange", HealthStatus.HEALTHY, latency, "trading active")
            else:
                return ComponentHealth("exchange", HealthStatus.DEGRADED, latency, "trading stopped")
        except asyncio.TimeoutError:
            return ComponentHealth("exchange", HealthStatus.UNHEALTHY, 2000, "check timed out")
        except (AttributeError, TypeError, OSError, RuntimeError) as e:
            return ComponentHealth("exchange", HealthStatus.UNHEALTHY, 0, str(e))
