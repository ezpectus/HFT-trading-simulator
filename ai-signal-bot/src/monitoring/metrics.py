"""
Prometheus metrics exporter — signal count, fill count, PnL, drawdown, latency.

Exposes /metrics endpoint for Prometheus scraping.
Uses prometheus_client for standard metric types (Counter, Gauge, Histogram).
"""

from __future__ import annotations

import logging
import time

logger = logging.getLogger(__name__)

try:
    from prometheus_client import (
        CONTENT_TYPE_LATEST,
        CollectorRegistry,
        Counter,
        Gauge,
        Histogram,
        Summary,
        generate_latest,
    )
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
            self.registry = None
            self.signals_total = None
            self.fills_total = None
            self.orders_sent_total = None
            self.orders_rejected_total = None
            self.kill_switch_activations = None
            self.current_pnl = None
            self.daily_pnl = None
            self.total_equity = None
            self.drawdown_pct = None
            self.open_positions = None
            self.total_exposure = None
            self.websocket_connected = None
            self.signal_confidence = None
            self.kill_switch_active = None
            self.shm_buffer_size = None
            self.signal_latency = None
            self.order_latency = None
            self.shm_round_trip_latency = None
            self.position_hold_time = None
            self.signals_sent_total = None
            self.signals_blocked_total = None
            self.circuit_breaker_state = None
            self.circuit_breaker_trips_total = None
            self.ws_clients_connected = None
            self.errors_total = None
            self.bot_drawdown = None
            self.bot_win_rate = None
            self.bot_pnl_total = None
            self.bot_uptime_seconds = None
            self.ws_reconnects_total = None
            return

        self.registry = CollectorRegistry()
        self._init_metrics()

    def _init_metrics(self):
        """Initialize all Prometheus metrics."""
        self._init_counters()
        self._init_gauges()
        self._init_histograms()
        self._init_summaries()
        self._init_alert_metrics()

    def _init_counters(self):
        """Initialize counter metrics."""
        self.signals_total = Counter(
            "trading_signals_total", "Total signals generated",
            ["symbol", "direction"], registry=self.registry,
        )
        self.fills_total = Counter(
            "trading_fills_total", "Total order fills",
            ["exchange", "symbol", "side"], registry=self.registry,
        )
        self.orders_sent_total = Counter(
            "trading_orders_sent_total", "Total orders sent to exchanges",
            ["exchange", "symbol", "side", "type"], registry=self.registry,
        )
        self.orders_rejected_total = Counter(
            "trading_orders_rejected_total", "Total orders rejected by exchange or risk manager",
            ["exchange", "reason"], registry=self.registry,
        )
        self.kill_switch_activations = Counter(
            "trading_kill_switch_activations_total", "Kill switch activation count",
            ["reason"], registry=self.registry,
        )

    def _init_gauges(self):
        """Initialize gauge metrics."""
        self.current_pnl = Gauge("trading_current_pnl", "Current unrealized PnL (USD)", registry=self.registry)
        self.daily_pnl = Gauge("trading_daily_pnl", "Daily realized PnL (USD)", registry=self.registry)
        self.total_equity = Gauge("trading_total_equity", "Total account equity (USD)", registry=self.registry)
        self.drawdown_pct = Gauge("trading_drawdown_pct", "Current drawdown percentage from peak equity", registry=self.registry)
        self.open_positions = Gauge("trading_open_positions", "Number of currently open positions", registry=self.registry)
        self.total_exposure = Gauge("trading_total_exposure", "Total notional exposure (USD)", registry=self.registry)
        self.websocket_connected = Gauge(
            "trading_websocket_connected", "WebSocket connection status (1=connected, 0=disconnected)",
            ["endpoint"], registry=self.registry,
        )
        self.signal_confidence = Gauge(
            "trading_signal_confidence", "Latest signal confidence",
            ["symbol"], registry=self.registry,
        )
        self.kill_switch_active = Gauge(
            "trading_kill_switch_active", "Kill switch active status (1=active, 0=inactive)",
            registry=self.registry,
        )
        self.shm_buffer_size = Gauge(
            "trading_shm_buffer_size", "SHM ring buffer current size",
            ["channel"], registry=self.registry,
        )

    def _init_histograms(self):
        """Initialize histogram metrics."""
        self.signal_latency = Histogram(
            "trading_signal_latency_seconds", "Signal generation latency",
            buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
            registry=self.registry,
        )
        self.order_latency = Histogram(
            "trading_order_latency_seconds", "Order submission to fill latency",
            ["exchange"],
            buckets=(0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0),
            registry=self.registry,
        )
        self.shm_round_trip_latency = Histogram(
            "trading_shm_round_trip_seconds", "SHM signal→fill round-trip latency",
            buckets=(0.00001, 0.00005, 0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05),
            registry=self.registry,
        )

    def _init_summaries(self):
        """Initialize summary metrics."""
        self.position_hold_time = Summary(
            "trading_position_hold_time_seconds", "Position hold time",
            registry=self.registry,
        )

    def _init_alert_metrics(self):
        """Initialize ai_signal_bot_* metrics used by Prometheus alert rules."""
        self.signals_sent_total = Counter(
            "ai_signal_bot_signals_sent_total", "Total signals broadcast",
            registry=self.registry,
        )
        self.signals_blocked_total = Counter(
            "ai_signal_bot_signals_blocked_total", "Signals blocked by circuit breaker",
            registry=self.registry,
        )
        self.circuit_breaker_state = Gauge(
            "ai_signal_bot_circuit_breaker_state", "Circuit breaker state (0=closed, 1=open, 2=half_open)",
            registry=self.registry,
        )
        self.circuit_breaker_trips_total = Counter(
            "ai_signal_bot_circuit_breaker_trips_total", "Total circuit breaker trips",
            registry=self.registry,
        )
        self.ws_clients_connected = Gauge(
            "ai_signal_bot_ws_clients_connected", "Connected WebSocket clients",
            registry=self.registry,
        )
        self.errors_total = Counter(
            "ai_signal_bot_errors_total", "Total errors",
            registry=self.registry,
        )
        self.bot_drawdown = Gauge(
            "ai_signal_bot_drawdown", "Current drawdown fraction",
            registry=self.registry,
        )
        self.bot_win_rate = Gauge(
            "ai_signal_bot_win_rate", "Win rate (0-1)",
            registry=self.registry,
        )
        self.bot_pnl_total = Gauge(
            "ai_signal_bot_pnl_total", "Cumulative PnL",
            registry=self.registry,
        )
        self.bot_uptime_seconds = Gauge(
            "ai_signal_bot_uptime_seconds", "Uptime in seconds",
            registry=self.registry,
        )
        self.ws_reconnects_total = Counter(
            "trading_ws_reconnects_total", "Total WebSocket reconnections",
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

    # ── Alert metric update methods ──

    def record_signal_sent(self):
        if not HAS_PROMETHEUS:
            return
        self.signals_sent_total.inc()

    def record_signal_blocked(self):
        if not HAS_PROMETHEUS:
            return
        self.signals_blocked_total.inc()

    def set_circuit_breaker_state(self, state: int):
        if not HAS_PROMETHEUS:
            return
        self.circuit_breaker_state.set(state)

    def record_circuit_breaker_trip(self):
        if not HAS_PROMETHEUS:
            return
        self.circuit_breaker_trips_total.inc()

    def set_ws_clients(self, count: int):
        if not HAS_PROMETHEUS:
            return
        self.ws_clients_connected.set(count)

    def record_error(self):
        if not HAS_PROMETHEUS:
            return
        self.errors_total.inc()

    def set_bot_drawdown(self, fraction: float):
        if not HAS_PROMETHEUS:
            return
        self.bot_drawdown.set(fraction)

    def set_bot_win_rate(self, win_rate: float):
        if not HAS_PROMETHEUS:
            return
        self.bot_win_rate.set(win_rate)

    def set_bot_pnl_total(self, pnl: float):
        if not HAS_PROMETHEUS:
            return
        self.bot_pnl_total.set(pnl)

    def set_bot_uptime(self, seconds: float):
        if not HAS_PROMETHEUS:
            return
        self.bot_uptime_seconds.set(seconds)

    def record_ws_reconnect(self):
        if not HAS_PROMETHEUS:
            return
        self.ws_reconnects_total.inc()

    # ── HTTP endpoint ──

    async def start_server(self, host: str = "0.0.0.0", port: int = 9090):  # nosec: B104
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
        logger.info("Prometheus metrics server started on %s:%s", host, port)

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
