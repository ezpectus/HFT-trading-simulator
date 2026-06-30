"""Health check HTTP server — endpoints for system health monitoring.

GET /health — overall system health
GET /health/exchange — exchange connectivity
GET /health/database — DB connection
GET /health/shm — SHM status
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Optional, Callable, Any
from aiohttp import web, ClientSession

import logging
logger = logging.getLogger(__name__)


class HealthServer:
    """HTTP health check server."""

    def __init__(self, port: int = 8080, host: str = "0.0.0.0"):
        self.port = port
        self.host = host
        self._app: Optional[web.Application] = None
        self._runner: Optional[web.AppRunner] = None
        self._site: Optional[web.TCPSite] = None
        self._start_time = time.time()
        self._checks: dict[str, Callable] = {}
        self._status: dict[str, dict] = {}

    def register_check(self, name: str, check_fn: Callable) -> None:
        """Register a health check function. Should return dict with 'healthy' bool."""
        self._checks[name] = check_fn

    async def _check_exchange(self) -> dict:
        """Check exchange connectivity."""
        if "exchange" in self._checks:
            try:
                result = self._checks["exchange"]()
                if asyncio.iscoroutine(result):
                    result = await result
                return result
            except Exception as e:
                return {"healthy": False, "error": str(e)}
        return {"healthy": True, "message": "No exchange check registered"}

    async def _check_database(self) -> dict:
        """Check database connectivity."""
        if "database" in self._checks:
            try:
                result = self._checks["database"]()
                if asyncio.iscoroutine(result):
                    result = await result
                return result
            except Exception as e:
                return {"healthy": False, "error": str(e)}
        return {"healthy": True, "message": "No database check registered"}

    async def _check_shm(self) -> dict:
        """Check SHM status."""
        if "shm" in self._checks:
            try:
                result = self._checks["shm"]()
                if asyncio.iscoroutine(result):
                    result = await result
                return result
            except Exception as e:
                return {"healthy": False, "error": str(e)}
        return {"healthy": True, "message": "No SHM check registered"}

    async def _check_all(self) -> dict:
        """Run all health checks."""
        exchange = await self._check_exchange()
        database = await self._check_database()
        shm = await self._check_shm()

        all_healthy = (
            exchange.get("healthy", False) and
            database.get("healthy", False) and
            shm.get("healthy", False)
        )

        return {
            "healthy": all_healthy,
            "uptime_seconds": time.time() - self._start_time,
            "timestamp": time.time(),
            "components": {
                "exchange": exchange,
                "database": database,
                "shm": shm,
            },
        }

    async def _handle_health(self, request: web.Request) -> web.Response:
        result = await self._check_all()
        status = 200 if result["healthy"] else 503
        return web.json_response(result, status=status)

    async def _handle_health_exchange(self, request: web.Request) -> web.Response:
        result = await self._check_exchange()
        status = 200 if result.get("healthy") else 503
        return web.json_response(result, status=status)

    async def _handle_health_database(self, request: web.Request) -> web.Response:
        result = await self._check_database()
        status = 200 if result.get("healthy") else 503
        return web.json_response(result, status=status)

    async def _handle_health_shm(self, request: web.Request) -> web.Response:
        result = await self._check_shm()
        status = 200 if result.get("healthy") else 503
        return web.json_response(result, status=status)

    async def _handle_ready(self, request: web.Request) -> web.Response:
        """Kubernetes readiness probe endpoint."""
        result = await self._check_all()
        ready = result["healthy"]
        return web.json_response({"ready": ready}, status=200 if ready else 503)

    async def _handle_live(self, request: web.Request) -> web.Response:
        """Kubernetes liveness probe endpoint."""
        return web.json_response({"alive": True, "uptime": time.time() - self._start_time})

    def _create_app(self) -> web.Application:
        app = web.Application()
        app.router.add_get("/health", self._handle_health)
        app.router.add_get("/health/exchange", self._handle_health_exchange)
        app.router.add_get("/health/database", self._handle_health_database)
        app.router.add_get("/health/shm", self._handle_health_shm)
        app.router.add_get("/ready", self._handle_ready)
        app.router.add_get("/live", self._handle_live)
        return app

    async def start(self) -> None:
        """Start the health server."""
        self._app = self._create_app()
        self._runner = web.AppRunner(self._app)
        await self._runner.setup()
        self._site = web.TCPSite(self._runner, self.host, self.port)
        await self._site.start()
        logger.info(f"[HealthServer] Listening on {self.host}:{self.port}")

    async def stop(self) -> None:
        """Stop the health server."""
        if self._site:
            await self._site.stop()
        if self._runner:
            await self._runner.cleanup()
        logger.info("[HealthServer] Stopped")
