"""
Prometheus metrics exporter — signal count, fill count, PnL, drawdown, latency.

Exposes /metrics endpoint for Prometheus scraping.
Uses prometheus_client for standard metric types (Counter, Gauge, Histogram).
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

try:
    from prometheus_client import (
        Counter, Gauge, Histogram, Summary,
        CollectorRegistry, generate_latest, CONTENT_TYPE_LATEST,
    )
    from prometheus_client.core import GaugeHistogramMetricFamily
    HAS_PROMETHEUS = True
except ImportError:
    HAS_PROMETHEUS = False
    logger.warning("prometheus_client not installed — metrics exporter disabled")

try:
    from aiohttp import web
    HAS_AIOHTTP = True
except ImportError:
    HAS_AIOHTTP = False


class MetricsExporter:
    """Prometheus metrics exporter for the trading system."""

    def __init__(self, registry_name: str = "trading_system"):
        if not HAS_PROMETHEUS:
            logger.warning("prometheus_client not available")
            return

        self.registry = CollectorRegistry()
        self._init_metrics()

    def _init_metrics(self):
        """Initialize all Prometheus metrics."""

        # ── Counters ──
        self.signals_total = Counter(
            "trading_signals_total",
            "Total signals generated",
            ["symbol", "direction"],
            registry=self.registry,
        )

        self.fills_total = Counter(
            "trading_fills_total",
            "Total order fills",
            ["exchange", "symbol", "side"],
            registry=self.registry,
        )

        self.orders_sent_total = Counter(
            "trading_orders_sent_total",
            "Total orders sent to exchanges",
            ["exchange", "symbol", "side", "type"],
            registry=self.registry,
        )

        self.orders_rejected_total = Counter(
            "trading_orders_rejected_total",
            "Total orders rejected by exchange or risk manager",
            ["exchange", "reason"],
            registry=self.registry,
        )

        self.kill_switch_activations = Counter(
            "trading_kill_switch_activations_total",
            "Kill switch activation count",
            ["reason"],
            registry=self.registry,
        )

        # ── Gauges ──
        self.current_pnl = Gauge(
            "trading_current_pnl",
            "Current unrealized PnL (USD)",
            registry=self.registry,
        )

        self.daily_pnl = Gauge(
            "trading_daily_pnl",
            "Daily realized PnL (USD)",
            registry=self.registry,
        )

        self.total_equity = Gauge(
            "trading_total_equity",
            "Total account equity (USD)",
            registry=self.registry,
        )

        self.drawdown_pct = Gauge(
            "trading_drawdown_pct",
            "Current drawdown percentage from peak equity",
            registry=self.registry,
        )

        self.open_positions = Gauge(
            "trading_open_positions",
            "Number of currently open positions",
            registry=self.registry,
        )

        self.total_exposure = Gauge(
            "trading_total_exposure",
            "Total notional exposure (USD)",
            registry=self.registry,
        )

        self.websocket_connected = Gauge(
            "trading_websocket_connected",
            "WebSocket connection status (1=connected, 0=disconnected)",
            ["endpoint"],
            registry=self.registry,
        )

        self.signal_confidence = Gauge(
            "trading_signal_confidence",
            "Latest signal confidence",
            ["symbol"],
            registry=self.registry,
        )

        self.kill_switch_active = Gauge(
            "trading_kill_switch_active",
            "Kill switch active status (1=active, 0=inactive)",
            registry=self.registry,
        )

        self.shm_buffer_size = Gauge(
            "trading_shm_buffer_size",
            "SHM ring buffer current size",
            ["channel"],
            registry=self.registry,
        )

        # ── Histograms ──
        self.signal_latency = Histogram(
            "trading_signal_latency_seconds",
            "Signal generation latency",
            buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
            registry=self.registry,
        )

        self.order_latency = Histogram(
            "trading_order_latency_seconds",
            "Order submission to fill latency",
            ["exchange"],
            buckets=(0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0),
            registry=self.registry,
        )

        self.shm_round_trip_latency = Histogram(
            "trading_shm_round_trip_seconds",
            "SHM signal→fill round-trip latency",
            buckets=(0.00001, 0.00005, 0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05),
            registry=self.registry,
        )

        # ── Summaries ──
        self.position_hold_time = Summary(
            "trading_position_hold_time_seconds",
            "Position hold time",
            registry=self.registry,
        )

    # ── Update methods ──

    def record_signal(self, symbol: str, direction: str, confidence: float):
        if not HAS_PROMETHEUS:
            return
        self.signals_total.labels(symbol=symbol, direction=direction).inc()
        self.signal_confidence.labels(symbol=symbol).set(confidence)

    def record_fill(self, exchange: str, symbol: str, side: str):
        if not HAS_PROMETHEUS:
            return
        self.fills_total.labels(exchange=exchange, symbol=symbol, side=side).inc()

    def record_order_sent(self, exchange: str, symbol: str, side: str, order_type: str):
        if not HAS_PROMETHEUS:
            return
        self.orders_sent_total.labels(
            exchange=exchange, symbol=symbol, side=side, type=order_type
        ).inc()

    def record_order_rejected(self, exchange: str, reason: str):
        if not HAS_PROMETHEUS:
            return
        self.orders_rejected_total.labels(exchange=exchange, reason=reason).inc()

    def record_kill_switch(self, reason: str):
        if not HAS_PROMETHEUS:
            return
        self.kill_switch_activations.labels(reason=reason).inc()
        self.kill_switch_active.set(1)

    def update_pnl(self, current: float, daily: float, equity: float, drawdown: float):
        if not HAS_PROMETHEUS:
            return
        self.current_pnl.set(current)
        self.daily_pnl.set(daily)
        self.total_equity.set(equity)
        self.drawdown_pct.set(drawdown)

    def update_positions(self, count: int, exposure: float):
        if not HAS_PROMETHEUS:
            return
        self.open_positions.set(count)
        self.total_exposure.set(exposure)

    def update_ws_status(self, endpoint: str, connected: bool):
        if not HAS_PROMETHEUS:
            return
        self.websocket_connected.labels(endpoint=endpoint).set(1 if connected else 0)

    def update_shm_buffer(self, channel: str, size: int):
        if not HAS_PROMETHEUS:
            return
        self.shm_buffer_size.labels(channel=channel).set(size)

    def observe_signal_latency(self, seconds: float):
        if not HAS_PROMETHEUS:
            return
        self.signal_latency.observe(seconds)

    def observe_order_latency(self, exchange: str, seconds: float):
        if not HAS_PROMETHEUS:
            return
        self.order_latency.labels(exchange=exchange).observe(seconds)

    def observe_shm_round_trip(self, seconds: float):
        if not HAS_PROMETHEUS:
            return
        self.shm_round_trip_latency.observe(seconds)

    def observe_position_hold_time(self, seconds: float):
        if not HAS_PROMETHEUS:
            return
        self.position_hold_time.observe(seconds)

    def reset_kill_switch(self):
        if not HAS_PROMETHEUS:
            return
        self.kill_switch_active.set(0)

    # ── HTTP endpoint ──

    async def start_server(self, host: str = "0.0.0.0", port: int = 9090):
        """Start Prometheus metrics HTTP server."""
        if not HAS_PROMETHEUS or not HAS_AIOHTTP:
            logger.warning("Cannot start metrics server — missing dependencies")
            return

        app = web.Application()
        app.router.add_get("/metrics", self._metrics_handler)
        app.router.add_get("/health", self._health_handler)
        self._runner = web.AppRunner(app)
        await self._runner.setup()
        site = web.TCPSite(self._runner, host, port)
        await site.start()
        logger.info(f"Prometheus metrics server started on {host}:{port}")

    async def stop_server(self):
        """Stop metrics server."""
        if hasattr(self, "_runner"):
            await self._runner.cleanup()

    async def _metrics_handler(self, request):
        """Handle /metrics endpoint."""
        data = generate_latest(self.registry)
        return web.Response(body=data, content_type=CONTENT_TYPE_LATEST)

    async def _health_handler(self, request):
        """Handle /health endpoint."""
        return web.json_response({"status": "ok", "timestamp": time.time()})
