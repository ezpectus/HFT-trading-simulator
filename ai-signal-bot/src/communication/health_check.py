"""Health check aggregation endpoint for the trading system.

Provides a single HTTP endpoint that aggregates health status from all services.
Each service exposes its own /health endpoint; this module aggregates them.

Usage:
    from src.communication.health_check import HealthAggregator
    health = HealthAggregator()
    await health.start()  # starts HTTP server on :9092/health

Response format:
    {
        "status": "healthy" | "degraded" | "unhealthy",
        "services": {
            "ai-signal-bot": {"status": "healthy", "latency_ms": 2.3},
            "exchange-simulator": {"status": "healthy", "latency_ms": 1.1},
            "hft-trade-bot": {"status": "unhealthy", "error": "connection refused"}
        },
        "timestamp": 1704067200
    }
"""
import asyncio
import logging
import time

import aiohttp
from aiohttp import web

logger = logging.getLogger("ai_signal_bot.health_check")


class HealthAggregator:
    """Aggregates health status from all trading system services."""

    def __init__(
        self,
        services: dict[str, str] | None = None,
        port: int = 9092,
    ):
        self.services = services if services is not None else {
            "ai-signal-bot": "http://localhost:9090/health",
            "exchange-simulator": "http://localhost:8775/health",
            "hft-trade-bot": "http://localhost:9091/health",
        }
        self.port = port
        self._runner: web.AppRunner | None = None
        self._site: web.TCPSite | None = None

    async def _check_service(self, name: str, url: str) -> dict:
        """Check a single service health endpoint."""
        try:
            start = time.monotonic()
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3.0)) as session:
                async with session.get(url) as resp:
                    latency_ms = (time.monotonic() - start) * 1000
                    if resp.status == 200:
                        data = await resp.json()
                        return {
                            "status": "healthy",
                            "latency_ms": round(latency_ms, 2),
                            "details": data,
                        }
                    else:
                        return {
                            "status": "degraded",
                            "latency_ms": round(latency_ms, 2),
                            "http_status": resp.status,
                        }
        except TimeoutError:
            return {"status": "unhealthy", "error": "timeout"}
        except ConnectionRefusedError:
            return {"status": "unhealthy", "error": "connection refused"}
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}

    async def _aggregate(self) -> dict:
        """Aggregate health from all services."""
        if not self.services:
            return {
                "status": "healthy",
                "services": {},
                "timestamp": int(time.time()),
            }

        tasks = [
            self._check_service(name, url)
            for name, url in self.services.items()
        ]
        results = await asyncio.gather(*tasks)
        service_status = dict(zip(self.services.keys(), results, strict=False))

        all_healthy = all(s["status"] == "healthy" for s in service_status.values())
        any_unhealthy = any(s["status"] == "unhealthy" for s in service_status.values())

        overall = "healthy" if all_healthy else ("unhealthy" if any_unhealthy else "degraded")

        return {
            "status": overall,
            "services": service_status,
            "timestamp": int(time.time()),
        }

    async def _handle_health(self, request: web.Request) -> web.Response:
        """HTTP handler for /health endpoint."""
        result = await self._aggregate()
        status_code = 503 if result["status"] == "unhealthy" else 200
        return web.json_response(result, status=status_code)

    async def start(self) -> None:
        """Start the health check HTTP server."""
        app = web.Application()
        app.router.add_get("/health", self._handle_health)
        app.router.add_get("/healthz", self._handle_health)
        self._runner = web.AppRunner(app)
        await self._runner.setup()
        self._site = web.TCPSite(self._runner, "0.0.0.0", self.port)
        await self._site.start()
        logger.info(f"Health aggregator started on :{self.port}/health")

    async def stop(self) -> None:
        """Stop the health check HTTP server."""
        if self._site:
            await self._site.stop()
        if self._runner:
            await self._runner.cleanup()
        logger.info("Health aggregator stopped")
