"""Prometheus metrics endpoint for AI Signal Bot.

Exposes metrics on a separate HTTP server (default :9091/metrics) for
Prometheus scraping. Uses a lightweight text format — no external deps.

Metrics exposed:
  ai_signal_bot_signals_sent_total          — counter
  ai_signal_bot_signals_blocked_total       — counter (circuit breaker)
  ai_signal_bot_ws_clients_connected        — gauge
  ai_signal_bot_backtests_run_total         — counter
  ai_signal_bot_circuit_breaker_trips_total — counter
  ai_signal_bot_circuit_breaker_state       — gauge (0=closed, 1=open, 2=half_open)
  ai_signal_bot_uptime_seconds              — gauge
  ai_signal_bot_pnl_total                   — gauge (cumulative PnL)
  ai_signal_bot_drawdown                    — gauge (current drawdown fraction)
  ai_signal_bot_win_rate                    — gauge (win rate 0-1)
  ai_signal_bot_errors_total                — counter
"""
import asyncio
from src.observability.logging import get_logger
import time

logger = get_logger("ai_signal_bot.metrics")


class MetricsCollector:
    """Lightweight metrics collector with Prometheus text exposition format."""

    def __init__(self):
        self._start_time = time.time()
        self._signals_sent = 0
        self._signals_blocked = 0
        self._backtests_run = 0
        self._cb_trips = 0
        self._ws_clients = 0
        self._cb_state = 0  # 0=closed, 1=open, 2=half_open
        self._pnl_total = 0.0
        self._drawdown = 0.0
        self._win_rate = 0.0
        self._errors_total = 0

    def record_signal_sent(self) -> None:
        self._signals_sent += 1

    def record_signal_blocked(self) -> None:
        self._signals_blocked += 1

    def record_backtest(self) -> None:
        self._backtests_run += 1

    def record_circuit_breaker_trip(self) -> None:
        self._cb_trips += 1

    def set_ws_clients(self, count: int) -> None:
        self._ws_clients = count

    def set_circuit_breaker_state(self, state: int) -> None:
        self._cb_state = state

    def set_pnl_total(self, pnl: float) -> None:
        self._pnl_total = pnl

    def set_drawdown(self, drawdown: float) -> None:
        self._drawdown = drawdown

    def set_win_rate(self, win_rate: float) -> None:
        self._win_rate = win_rate

    def record_error(self) -> None:
        self._errors_total += 1

    def render(self) -> str:
        """Render metrics in Prometheus text exposition format."""
        uptime = time.time() - self._start_time
        lines = [
            "# HELP ai_signal_bot_signals_sent_total Total signals broadcast",
            "# TYPE ai_signal_bot_signals_sent_total counter",
            f"ai_signal_bot_signals_sent_total {self._signals_sent}",
            "",
            "# HELP ai_signal_bot_signals_blocked_total Signals blocked by circuit breaker",
            "# TYPE ai_signal_bot_signals_blocked_total counter",
            f"ai_signal_bot_signals_blocked_total {self._signals_blocked}",
            "",
            "# HELP ai_signal_bot_ws_clients_connected Currently connected WebSocket clients",
            "# TYPE ai_signal_bot_ws_clients_connected gauge",
            f"ai_signal_bot_ws_clients_connected {self._ws_clients}",
            "",
            "# HELP ai_signal_bot_backtests_run_total Total backtests executed",
            "# TYPE ai_signal_bot_backtests_run_total counter",
            f"ai_signal_bot_backtests_run_total {self._backtests_run}",
            "",
            "# HELP ai_signal_bot_circuit_breaker_trips_total Total circuit breaker trips",
            "# TYPE ai_signal_bot_circuit_breaker_trips_total counter",
            f"ai_signal_bot_circuit_breaker_trips_total {self._cb_trips}",
            "",
            "# HELP ai_signal_bot_circuit_breaker_state Current breaker state (0=closed,1=open,2=half_open)",
            "# TYPE ai_signal_bot_circuit_breaker_state gauge",
            f"ai_signal_bot_circuit_breaker_state {self._cb_state}",
            "",
            "# HELP ai_signal_bot_uptime_seconds Uptime in seconds",
            "# TYPE ai_signal_bot_uptime_seconds gauge",
            f"ai_signal_bot_uptime_seconds {uptime:.2f}",
            "",
            "# HELP ai_signal_bot_pnl_total Cumulative PnL",
            "# TYPE ai_signal_bot_pnl_total gauge",
            f"ai_signal_bot_pnl_total {self._pnl_total:.2f}",
            "",
            "# HELP ai_signal_bot_drawdown Current drawdown fraction",
            "# TYPE ai_signal_bot_drawdown gauge",
            f"ai_signal_bot_drawdown {self._drawdown:.4f}",
            "",
            "# HELP ai_signal_bot_win_rate Win rate (0-1)",
            "# TYPE ai_signal_bot_win_rate gauge",
            f"ai_signal_bot_win_rate {self._win_rate:.4f}",
            "",
            "# HELP ai_signal_bot_errors_total Total errors",
            "# TYPE ai_signal_bot_errors_total counter",
            f"ai_signal_bot_errors_total {self._errors_total}",
            "",
        ]
        return "\n".join(lines)


class MetricsServer:
    """HTTP server that serves Prometheus metrics on /metrics endpoint."""

    def __init__(self, collector: MetricsCollector, host: str = "0.0.0.0", port: int = 9091):  # nosec: B104
        self.collector = collector
        self.host = host
        self.port = port
        self._server: asyncio.AbstractServer | None = None

    async def start(self) -> None:
        self._server = await asyncio.start_server(
            self._handle_connection, self.host, self.port
        )
        logger.info("Metrics server started on http://%s:%s/metrics", self.host, self.port)

    async def stop(self) -> None:
        if self._server:
            self._server.close()
            await self._server.wait_closed()
        logger.info("Metrics server stopped")

    async def _handle_connection(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            request_line = await reader.readline()
            while True:
                line = await reader.readline()
                if line in (b"\r\n", b"\n", b""):
                    break

            path = request_line.decode("ascii", errors="replace").split(" ")[1] if b" " in request_line else "/"

            if path != "/metrics":
                body = b"Not Found"
                response = (
                    f"HTTP/1.1 404 Not Found\r\n"
                    f"Content-Type: text/plain; charset=utf-8\r\n"
                    f"Content-Length: {len(body)}\r\n"
                    f"Connection: close\r\n"
                    f"\r\n"
                ).encode() + body
                writer.write(response)
                await writer.drain()
                return

            body = self.collector.render().encode("utf-8")
            response = (
                f"HTTP/1.1 200 OK\r\n"
                f"Content-Type: text/plain; version=0.0.4; charset=utf-8\r\n"
                f"Content-Length: {len(body)}\r\n"
                f"Connection: close\r\n"
                f"\r\n"
            ).encode() + body

            writer.write(response)
            await writer.drain()
        except (ConnectionError, OSError) as e:
            logger.error("Metrics server error: %s", e)
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except (ConnectionError, OSError) as e:
                logger.debug("Writer close error: %s", e)
