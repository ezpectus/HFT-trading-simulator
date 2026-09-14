"""Tests for S131 — simulator service-level Prometheus metrics.

Covers: new emitted names, histogram exposition, error/latency instrumentation.
"""
import re
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from exchange_simulator.models import Account, OrderStatus
from exchange_simulator.websocket_server import ExchangeWebSocketServer
from exchange_simulator.ws_metrics import LatencyHistogram

_MARKET_SURFACE = [
    '_candle_count', '_volatility', 'candles_to_next_funding', 'current_timestamp',
    'exchanges', 'generate_order_book', 'get_all_prices', 'get_funding_rates',
    'get_latest_candles', 'get_news_event', 'get_price', 'is_weekend_mode',
    'next_candle', 'symbols',
]
_EXCHANGE_SURFACE = ['account', 'fee_pct', 'slippage_bps', 'get_account_status',
                   'submit_order', '_order_history', 'cancel_order', 'get_positions', 'get_pending_orders']


@pytest.fixture
def mock_market():
    market = MagicMock(spec=_MARKET_SURFACE)
    market.symbols = ["BTC/USDT"]
    market.exchanges = ["binance"]
    market._candle_count = 10
    market.is_weekend_mode = False
    market.get_news_event.return_value = None
    market.get_price.return_value = 65000.0
    return market


@pytest.fixture
def mock_exchange():
    ex = MagicMock(spec=_EXCHANGE_SURFACE)
    ex.account = MagicMock(spec=Account)
    ex.account.balance = 100000.0
    ex.account.equity = 100000.0
    ex.account.total_pnl = 0.0
    ex.account.total_trades = 0
    ex.account.winning_trades = 0
    ex.account.total_fees = 0.0
    ex.account.leverage = 1
    ex.account.positions = []
    ex._order_history = []
    return ex


@pytest.fixture
def server(mock_market, mock_exchange):
    return ExchangeWebSocketServer(
        exchanges={"binance": mock_exchange},
        market=mock_market,
        host="localhost",
        port=8765,
    )


class TestSimMetricNames:
    def test_new_metric_names_present(self, server):
        prom = server._get_prometheus_metrics()
        for name in (
            "exchange_simulator_errors_total",
            "exchange_simulator_price_updates_total",
            "exchange_simulator_order_latency_seconds",
            "exchange_simulator_price_feed_latency_seconds",
            "exchange_simulator_websocket_latency_seconds",
        ):
            assert name in prom, name

    def test_help_type_lines(self, server):
        prom = server._get_prometheus_metrics()
        assert "# HELP exchange_simulator_errors_total" in prom
        assert "# TYPE exchange_simulator_errors_total counter" in prom
        assert "# TYPE exchange_simulator_order_latency_seconds histogram" in prom

    def test_histogram_exposition_shape(self, server):
        server.metrics.order_latency.observe(0.004)
        server.metrics.order_latency.observe(0.2)
        prom = server._get_prometheus_metrics()
        assert 'exchange_simulator_order_latency_seconds_bucket{le="0.005"} 1' in prom
        assert 'exchange_simulator_order_latency_seconds_bucket{le="0.25"} 2' in prom
        assert 'exchange_simulator_order_latency_seconds_bucket{le="+Inf"} 2' in prom
        assert re.search(r"exchange_simulator_order_latency_seconds_sum [\d.]+", prom)
        assert "exchange_simulator_order_latency_seconds_count 2" in prom

    def test_counters_reflect_state(self, server):
        server.metrics.errors_total = 5
        server.metrics.price_updates_total = 123
        prom = server._get_prometheus_metrics()
        assert "exchange_simulator_errors_total 5" in prom
        assert "exchange_simulator_price_updates_total 123" in prom

    def test_order_status_counters_count_real_enum_values(self, server):
        """S281 regression: FILLED/REJECTED enum values are uppercase — the
        counters must match, not lowercase literals that can never hit."""
        ex = server.exchanges["binance"]
        ex._order_history = [
            SimpleNamespace(status=OrderStatus.FILLED),
            SimpleNamespace(status=OrderStatus.FILLED),
            SimpleNamespace(status=OrderStatus.REJECTED),
            SimpleNamespace(status=OrderStatus.PENDING),
        ]
        prom = server._get_prometheus_metrics()
        assert 'exchange_orders_submitted_total{exchange="binance"} 4' in prom
        assert 'exchange_orders_filled_total{exchange="binance"} 2' in prom
        assert 'exchange_orders_rejected_total{exchange="binance"} 1' in prom


class TestInstrumentation:
    @pytest.mark.asyncio
    async def test_process_message_records_ws_latency_and_errors(self, server):
        ws = AsyncMock()
        ws.remote_address = ("127.0.0.1", 1)
        await server._process_message(ws, "not-json{{{{", ws.remote_address)
        assert server.metrics.errors_total == 1
        assert server.metrics.ws_latency.count == 1

    @pytest.mark.asyncio
    async def test_handle_order_records_order_latency(self, server):
        server._trading_active = False  # early-return path still timed
        ws = AsyncMock()
        await server._handle_order(
            ws, {"symbol": "BTC/USDT", "side": "buy", "quantity": 1})
        assert server.metrics.order_latency.count == 1
