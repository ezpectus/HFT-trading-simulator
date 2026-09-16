"""Prometheus metrics generation mixin for ExchangeWebSocketServer.

Extracted from websocket_server.py for file-size compliance.
Generates Prometheus-format metrics string for /metrics endpoint.
"""
import os
import time

try:
    import resource
    _HAS_RESOURCE = True
except ImportError:  # Windows — process metrics unavailable
    _HAS_RESOURCE = False


def _process_metrics() -> tuple[float | None, int | None]:
    """Return (cpu_percent, rss_bytes) for this process, or (None, None)."""
    if not _HAS_RESOURCE:
        return None, None
    usage = resource.getrusage(resource.RUSAGE_SELF)
    cpu_time = usage.ru_utime + usage.ru_stime
    now = _process_metrics._last_wall
    cpu_pct = None
    if _process_metrics._last_cpu is not None:
        wall_delta = time.monotonic() - now
        if wall_delta > 0:
            ncpu = os.cpu_count() or 1
            cpu_pct = max(0.0, (cpu_time - _process_metrics._last_cpu) / wall_delta) * 100.0 / ncpu
    _process_metrics._last_cpu = cpu_time
    _process_metrics._last_wall = time.monotonic()
    rss = usage.ru_maxrss * (1024 if os.uname().sysname == "Linux" else 1)
    return cpu_pct, int(rss)


_process_metrics._last_cpu = None
_process_metrics._last_wall = time.monotonic()


class PrometheusMixin:
    """Mixin providing Prometheus metrics generation for ExchangeWebSocketServer."""

    def _get_prometheus_metrics(self) -> str:
        """Generate Prometheus-format metrics string."""
        lines = []
        lines.append("# HELP exchange_connected_clients Number of connected WebSocket clients")
        lines.append("# TYPE exchange_connected_clients gauge")
        lines.append(f"exchange_connected_clients {len(self.clients)}")

        lines.append("# HELP exchange_candle_count Total candles generated")
        lines.append("# TYPE exchange_candle_count counter")
        lines.append(f"exchange_candle_count {self.market._candle_count}")

        lines.append("# HELP exchange_weekend_mode Weekend mode active (1=yes, 0=no)")
        lines.append("# TYPE exchange_weekend_mode gauge")
        lines.append(f"exchange_weekend_mode {1 if self.market.is_weekend_mode else 0}")

        lines.append("# HELP exchange_news_event_active News event active (1=yes, 0=no)")
        lines.append("# TYPE exchange_news_event_active gauge")
        lines.append(f"exchange_news_event_active {1 if self.market.get_news_event() else 0}")

        lines.append("# HELP exchange_tick_interval_seconds Current tick interval in seconds")
        lines.append("# TYPE exchange_tick_interval_seconds gauge")
        lines.append(f"exchange_tick_interval_seconds {self._tick_interval}")

        lines.append("# HELP exchange_trading_active Trading is active (1=yes, 0=stopped)")
        lines.append("# TYPE exchange_trading_active gauge")
        lines.append(f"exchange_trading_active {1 if self._trading_active else 0}")

        lines.append("# HELP exchange_ws_connections_total Total WebSocket client connections")
        lines.append("# TYPE exchange_ws_connections_total counter")
        lines.append(f"exchange_ws_connections_total {self._total_connections}")

        lines.append("# HELP exchange_ws_disconnections_total Total WebSocket client disconnections")
        lines.append("# TYPE exchange_ws_disconnections_total counter")
        lines.append(f"exchange_ws_disconnections_total {self._total_disconnections}")

        self._append_exchange_metrics(lines)
        self._append_price_metrics(lines)
        self._append_sim_metrics(lines)

        return "\n".join(lines) + "\n"

    def _append_sim_metrics(self, lines: list[str]) -> None:
        """Append simulator service-level metrics."""
        m = self.metrics
        lines.append("# HELP exchange_simulator_errors_total Message handling errors")
        lines.append("# TYPE exchange_simulator_errors_total counter")
        lines.append(f"exchange_simulator_errors_total {m.errors_total}")

        lines.append("# HELP exchange_simulator_price_updates_total Per-symbol price updates generated")
        lines.append("# TYPE exchange_simulator_price_updates_total counter")
        lines.append(f"exchange_simulator_price_updates_total {m.price_updates_total}")

        lines.extend(m.order_latency.prometheus_lines(
            "exchange_simulator_order_latency_seconds", "Order handling latency (seconds)"))
        lines.extend(m.feed_latency.prometheus_lines(
            "exchange_simulator_price_feed_latency_seconds",
            "Market tick generation-to-broadcast latency (seconds)"))
        lines.extend(m.ws_latency.prometheus_lines(
            "exchange_simulator_websocket_latency_seconds",
            "Client message handling latency (seconds)"))

        # WebSocket-layer counters — previously reachable only via the
        # test-consumed get_metrics() dict; expose them on /metrics.
        lines.append("# HELP exchange_simulator_messages_total Messages broadcast to clients")
        lines.append("# TYPE exchange_simulator_messages_total counter")
        lines.append(f"exchange_simulator_messages_total {m.message_count}")
        lines.append("# HELP exchange_simulator_bytes_sent_total Bytes sent to clients")
        lines.append("# TYPE exchange_simulator_bytes_sent_total counter")
        lines.append(f"exchange_simulator_bytes_sent_total {m.bytes_sent}")
        lines.append("# HELP exchange_simulator_clients_connected Current WS client count")
        lines.append("# TYPE exchange_simulator_clients_connected gauge")
        lines.append(f"exchange_simulator_clients_connected {len(self.clients)}")
        lines.append("# HELP exchange_simulator_delta_update_ratio EWMA delta-vs-full update ratio")
        lines.append("# TYPE exchange_simulator_delta_update_ratio gauge")
        lines.append(f"exchange_simulator_delta_update_ratio {m.delta_update_ratio:.4f}")
        lines.append("# HELP exchange_simulator_bandwidth_mbps Send bandwidth (Mbps)")
        lines.append("# TYPE exchange_simulator_bandwidth_mbps gauge")
        lines.append(f"exchange_simulator_bandwidth_mbps {m.get_bandwidth_mbps():.4f}")
        lines.append("# HELP exchange_simulator_broadcast_latency_p95_ms p95 broadcast latency (ms)")
        lines.append("# TYPE exchange_simulator_broadcast_latency_p95_ms gauge")
        lines.append(
            f"exchange_simulator_broadcast_latency_p95_ms {m.get_p95_broadcast_latency():.4f}")
        lines.append("# HELP exchange_simulator_message_size_bytes_avg Average message size (bytes)")
        lines.append("# TYPE exchange_simulator_message_size_bytes_avg gauge")
        lines.append(f"exchange_simulator_message_size_bytes_avg {m.get_avg_message_size():.2f}")
        lines.append("# HELP exchange_simulator_message_size_bytes_p95 p95 message size (bytes)")
        lines.append("# TYPE exchange_simulator_message_size_bytes_p95 gauge")
        lines.append(f"exchange_simulator_message_size_bytes_p95 {m.get_p95_message_size():.2f}")

        cpu_pct, rss = _process_metrics()
        if cpu_pct is not None:
            lines.append("# HELP exchange_simulator_cpu_usage_percent Process CPU usage (percent)")
            lines.append("# TYPE exchange_simulator_cpu_usage_percent gauge")
            lines.append(f"exchange_simulator_cpu_usage_percent {cpu_pct:.2f}")
        if rss is not None:
            lines.append("# HELP exchange_simulator_memory_usage_bytes Process resident memory (bytes)")
            lines.append("# TYPE exchange_simulator_memory_usage_bytes gauge")
            lines.append(f"exchange_simulator_memory_usage_bytes {rss}")

    def _append_exchange_metrics(self, lines: list[str]) -> None:
        """Append per-exchange account and order metrics."""
        for ex_id, ex in self.exchanges.items():
            acc = ex.account
            labels = f'exchange="{ex_id}"'
            lines.append(f'exchange_balance{{{labels}}} {acc.balance:.2f}')
            lines.append(f'exchange_equity{{{labels}}} {acc.equity:.2f}')
            lines.append(f'exchange_total_pnl{{{labels}}} {acc.total_pnl:.2f}')
            lines.append(f'exchange_total_trades{{{labels}}} {acc.total_trades}')
            lines.append(f'exchange_winning_trades{{{labels}}} {acc.winning_trades}')
            lines.append(f'exchange_open_positions{{{labels}}} {len(acc.positions)}')
            lines.append(f'exchange_total_fees{{{labels}}} {acc.total_fees:.4f}')
            lines.append(f'exchange_leverage{{{labels}}} {acc.leverage}')

            # Cumulative order counters — the history deque is windowed
            # (maxlen=10000), so _total must come from the counting listener,
            # not len()/window sums which pin or regress on eviction.
            counters = getattr(ex._order_history, "counters", None) or {}
            lines.append("# HELP exchange_orders_submitted_total Total orders submitted")
            lines.append("# TYPE exchange_orders_submitted_total counter")
            lines.append(
                f'exchange_orders_submitted_total{{{labels}}} {counters.get("submitted", 0)}'
            )
            lines.append("# HELP exchange_orders_filled_total Total orders filled")
            lines.append("# TYPE exchange_orders_filled_total counter")
            lines.append(
                f'exchange_orders_filled_total{{{labels}}} {counters.get("filled", 0)}'
            )
            lines.append("# HELP exchange_orders_rejected_total Total orders rejected")
            lines.append("# TYPE exchange_orders_rejected_total counter")
            lines.append(
                f'exchange_orders_rejected_total{{{labels}}} {counters.get("rejected", 0)}'
            )

            for pos in acc.positions:
                pos_labels = f'exchange="{ex_id}",symbol="{pos.symbol}",side="{pos.side.value}"'
                lines.append(f'exchange_position_unrealized_pnl{{{pos_labels}}} {pos.unrealized_pnl:.2f}')
                lines.append(f'exchange_position_quantity{{{pos_labels}}} {pos.quantity:.4f}')

    def _append_price_metrics(self, lines: list[str]) -> None:
        """Append per-symbol price metrics."""
        for symbol in self.market.symbols:
            price = self.market.get_price(symbol, self.market.exchanges[0])
            lines.append(f'exchange_price{{symbol="{symbol}"}} {price:.2f}')
