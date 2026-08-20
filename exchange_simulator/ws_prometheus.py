"""Prometheus metrics generation mixin for ExchangeWebSocketServer.

Extracted from websocket_server.py for file-size compliance.
Generates Prometheus-format metrics string for /metrics endpoint.
"""


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

        return "\n".join(lines) + "\n"

    def _append_exchange_metrics(self, lines: list[str]) -> None:
        """Append per-exchange account metrics."""
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

            for pos in acc.positions:
                pos_labels = f'exchange="{ex_id}",symbol="{pos.symbol}",side="{pos.side.value}"'
                lines.append(f'exchange_position_unrealized_pnl{{{pos_labels}}} {pos.unrealized_pnl:.2f}')
                lines.append(f'exchange_position_quantity{{{pos_labels}}} {pos.quantity:.4f}')

    def _append_price_metrics(self, lines: list[str]) -> None:
        """Append per-symbol price metrics."""
        for symbol in self.market.symbols:
            price = self.market.get_price(symbol, self.market.exchanges[0])
            lines.append(f'exchange_price{{symbol="{symbol}"}} {price:.2f}')
