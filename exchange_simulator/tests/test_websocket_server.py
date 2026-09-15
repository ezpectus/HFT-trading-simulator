"""Tests for ExchangeWebSocketServer — message handling, validation, metrics."""
import asyncio
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from websockets.asyncio.server import ServerConnection

from exchange_simulator.models import Account, OrderBookLevel, OrderType, Side

# spec-by-names: instance attrs aren't in dir(Class) — list catches method-name typos
_MARKET_SURFACE = [
    '_candle_count', '_volatility', 'candles_to_next_funding', 'current_timestamp',
    'exchanges', 'generate_order_book', 'get_all_prices', 'get_funding_rates',
    'get_latest_candles', 'get_news_event', 'get_price', 'is_weekend_mode',
    'next_candle', 'symbols',
]
_EXCHANGE_SURFACE = ['account', 'fee_pct', 'slippage_bps', 'get_account_status', 'submit_order', '_order_history', 'cancel_order', 'get_positions', 'get_pending_orders']
from exchange_simulator.websocket_server import ExchangeWebSocketServer


@pytest.fixture
def mock_market():
    market = MagicMock(spec=_MARKET_SURFACE)
    market.symbols = ["BTC/USDT", "ETH/USDT"]
    market.exchanges = ["binance", "bybit", "okx"]
    market.current_timestamp = 1000000
    market._candle_count = 42
    market.is_weekend_mode = False
    market.get_latest_candles.return_value = []
    market.get_all_prices.return_value = {"binance": {"BTC/USDT": 65000}}
    market.generate_order_book.return_value = MagicMock(
        spec=['bids', 'asks'],
        bids=[OrderBookLevel(price=64900, quantity=0.5)],
        asks=[OrderBookLevel(price=65100, quantity=0.3)],
    )
    market.get_funding_rates.return_value = {"binance": 0.0001}
    market.candles_to_next_funding = 50
    market.get_news_event.return_value = None
    market._volatility = {"BTC/USDT": 0.75}
    market.get_price.return_value = 65000.0
    return market


@pytest.fixture
def mock_exchange():
    ex = MagicMock(spec=_EXCHANGE_SURFACE)
    ex.fee_pct = 0.075
    ex.slippage_bps = 5.0
    ex.account = MagicMock(spec=Account)
    ex.account.balance = 100000.0
    ex.account.equity = 100000.0
    ex.account.total_pnl = 0.0
    ex.account.total_trades = 0
    ex.account.winning_trades = 0
    ex.account.total_fees = 0.0
    ex.account.leverage = 1
    ex.account.positions = []
    ex.get_account_status.return_value = {"balance": 100000, "equity": 100000}
    return ex


@pytest.fixture
def server(mock_market, mock_exchange):
    exchanges = {"binance": mock_exchange, "bybit": mock_exchange}
    return ExchangeWebSocketServer(
        exchanges=exchanges,
        market=mock_market,
        host="localhost",
        port=8765,
    )


class TestServerInit:
    def test_defaults(self, server):
        assert server.host == "localhost"
        assert server.port == 8765
        assert server._running is False
        assert server._tick_interval == 1.0
        assert server._replay_paused is False
        assert server._replay_offset == 0

    def test_clients_set(self, server):
        assert isinstance(server.clients, set)
        assert len(server.clients) == 0


class TestHandleMessage:
    @pytest.mark.asyncio
    async def test_ping_responds_pong(self, server):
        ws = AsyncMock(spec=ServerConnection)
        await server._handle_message(ws, {"type": "ping"})
        sent = ws.send.call_args[0][0]
        assert json.loads(sent)["type"] == "pong"

    @pytest.mark.asyncio
    async def test_unknown_exchange_error(self, server):
        ws = AsyncMock(spec=ServerConnection)
        await server._handle_message(ws, {
            "type": "order",
            "exchange": "nonexistent",
            "symbol": "BTC/USDT",
            "side": "BUY",
            "quantity": 0.1,
        })
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "error"
        assert "nonexistent" in msg["message"]

    @pytest.mark.asyncio
    async def test_missing_order_fields(self, server):
        ws = AsyncMock(spec=ServerConnection)
        await server._handle_message(ws, {
            "type": "order",
            "exchange": "binance",
            "side": "BUY",
            # Missing symbol and quantity
        })
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "error"
        assert "Missing" in msg["message"]

    @pytest.mark.asyncio
    async def test_subscribe_sends_snapshot(self, server):
        ws = AsyncMock(spec=ServerConnection)
        await server._handle_message(ws, {"type": "subscribe"})
        assert ws.send.called
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "snapshot"

    @pytest.mark.asyncio
    async def test_set_speed(self, server):
        ws = AsyncMock(spec=ServerConnection)
        await server._handle_message(ws, {"type": "set_speed", "speed": 2})
        assert server._tick_interval == 0.5
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "speed_set"
        assert msg["speed"] == 2

    @pytest.mark.asyncio
    async def test_set_speed_pause(self, server):
        ws = AsyncMock(spec=ServerConnection)
        await server._handle_message(ws, {"type": "set_speed", "speed": 0})
        assert server._replay_paused is True
        assert server._speed_event.is_set() is False
        # The replay_state push is the client's only pause-sync — it must be
        # delivered, not fire-and-forget (S348).
        msg = json.loads(ws.send.call_args[0][0])
        assert msg["type"] == "replay_state"
        assert msg["paused"] is True

    @pytest.mark.asyncio
    async def test_replay_pause(self, server):
        ws = AsyncMock(spec=ServerConnection)
        await server._handle_message(ws, {"type": "replay", "action": "pause"})
        assert server._replay_paused is True
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "replay_state"
        assert msg["paused"] is True

    @pytest.mark.asyncio
    async def test_replay_resume(self, server):
        server._replay_paused = True
        ws = AsyncMock(spec=ServerConnection)
        await server._handle_message(ws, {"type": "replay", "action": "resume"})
        assert server._replay_paused is False
        assert server._replay_offset == 0

    @pytest.mark.asyncio
    async def test_update_config_volatility(self, server, mock_market):
        ws = AsyncMock(spec=ServerConnection)
        await server._handle_message(ws, {
            "type": "update_config",
            "updates": {"volatility": {"BTC/USDT": 1.5}},
        })
        assert mock_market._volatility["BTC/USDT"] == 1.5
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "config_updated"

    @pytest.mark.asyncio
    async def test_update_config_fees(self, server, mock_exchange):
        ws = AsyncMock(spec=ServerConnection)
        await server._handle_message(ws, {
            "type": "update_config",
            "updates": {"fees": {"binance": 0.05}},
        })
        assert mock_exchange.fee_pct == 0.05

    @pytest.mark.asyncio
    async def test_update_config_slippage(self, server, mock_exchange):
        ws = AsyncMock(spec=ServerConnection)
        await server._handle_message(ws, {
            "type": "update_config",
            "updates": {"slippage": {"binance": 10}},
        })
        assert mock_exchange.slippage_bps == 10

    @pytest.mark.asyncio
    async def test_update_config_rejects_non_numeric(self, server, mock_market, mock_exchange):
        """A string volatility written to _volatility poisons the tick path —
        the write must be rejected at the boundary, not stored."""
        ws = AsyncMock(spec=ServerConnection)
        await server._handle_message(ws, {
            "type": "update_config",
            "updates": {
                "volatility": {"BTC/USDT": "abc"},
                "fees": {"binance": "high"},
                "leverage": {"binance": True},
            },
        })
        await asyncio.sleep(0)
        assert mock_market._volatility["BTC/USDT"] == 0.75
        assert mock_exchange.fee_pct == 0.075
        assert mock_exchange.account.leverage == 1
        msg = json.loads(ws.send.call_args[0][0])
        assert msg["type"] == "config_updated"
        assert "volatility.BTC/USDT" in msg["rejected"]
        assert "fees.binance" in msg["rejected"]
        assert "leverage.binance" in msg["rejected"]

    @pytest.mark.asyncio
    async def test_update_config_rejects_nan(self, server, mock_market):
        ws = AsyncMock(spec=ServerConnection)
        await server._handle_message(ws, {
            "type": "update_config",
            "updates": {"volatility": {"BTC/USDT": float("nan")}},
        })
        await asyncio.sleep(0)
        assert mock_market._volatility["BTC/USDT"] == 0.75
        msg = json.loads(ws.send.call_args[0][0])
        assert "volatility.BTC/USDT" in msg["rejected"]

    @pytest.mark.asyncio
    async def test_start_trading(self, server):
        server._trading_active = False
        ws = AsyncMock(spec=ServerConnection)
        await server._handle_message(ws, {"type": "start_trading"})
        assert server._trading_active is True
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "trading_state"
        assert msg["trading_active"] is True

    @pytest.mark.asyncio
    async def test_stop_trading(self, server):
        assert server._trading_active is True
        ws = AsyncMock(spec=ServerConnection)
        await server._handle_message(ws, {"type": "stop_trading"})
        assert server._trading_active is False
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "trading_state"
        assert msg["trading_active"] is False

    @pytest.mark.asyncio
    async def test_order_rejected_when_trading_stopped(self, server, mock_exchange):
        server._trading_active = False
        ws = AsyncMock(spec=ServerConnection)
        await server._handle_message(ws, {
            "type": "order",
            "exchange": "binance",
            "symbol": "BTC/USDT",
            "side": "BUY",
            "quantity": 0.1,
        })
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "error"
        assert "Trading is stopped" in msg["message"]
        mock_exchange.submit_order.assert_not_called()

    @pytest.mark.asyncio
    async def test_close_position_rejected_when_trading_stopped(self, server):
        server._trading_active = False
        ws = AsyncMock(spec=ServerConnection)
        await server._handle_message(ws, {
            "type": "close_position",
            "exchange": "binance",
            "symbol": "BTC/USDT",
        })
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "error"
        assert "Trading is stopped" in msg["message"]


class TestPrometheusMetrics:
    def test_metrics_format(self, server):
        metrics = server._get_prometheus_metrics()
        assert "exchange_connected_clients" in metrics
        assert "exchange_candle_count" in metrics
        assert "exchange_weekend_mode" in metrics
        assert "exchange_balance" in metrics
        assert "exchange_tick_interval_seconds" in metrics

    def test_metrics_contain_help_and_type(self, server):
        metrics = server._get_prometheus_metrics()
        assert "# HELP" in metrics
        assert "# TYPE" in metrics

    def test_metrics_client_count(self, server):
        metrics = server._get_prometheus_metrics()
        assert "exchange_connected_clients 0" in metrics

    def test_metrics_with_clients(self, server):
        server.clients.add(MagicMock())
        metrics = server._get_prometheus_metrics()
        assert "exchange_connected_clients 1" in metrics

    def test_metrics_contain_trading_active(self, server):
        metrics = server._get_prometheus_metrics()
        assert "exchange_trading_active" in metrics
        assert "exchange_trading_active 1" in metrics

    def test_metrics_trading_active_zero_when_stopped(self, server):
        server._trading_active = False
        metrics = server._get_prometheus_metrics()
        assert "exchange_trading_active 0" in metrics


class TestBroadcastLoop:
    @pytest.mark.asyncio
    async def test_no_clients_skips(self, server, mock_market):
        server._running = True
        # Should skip immediately with no clients
        with patch('asyncio.sleep', autospec=True):
            task = asyncio.create_task(server._broadcast_loop())
            await asyncio.sleep(0.01)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        mock_market.next_candle.assert_not_called()

    @pytest.mark.asyncio
    async def test_paused_skips(self, server, mock_market):
        server._running = True
        server._replay_paused = True
        server.clients.add(AsyncMock(spec=ServerConnection))
        with patch('asyncio.sleep', autospec=True):
            task = asyncio.create_task(server._broadcast_loop())
            await asyncio.sleep(0.01)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        mock_market.next_candle.assert_not_called()

    @pytest.mark.asyncio
    async def test_tick_exception_does_not_kill_loop(self, server, mock_market):
        """A failing tick must be contained — the loop logs and continues
        instead of silently dying with /health still green."""
        server._running = True
        server._tick_interval = 0.001
        server.clients.add(AsyncMock(spec=ServerConnection))
        mock_market.next_candle.side_effect = RuntimeError("poisoned config")
        real_sleep = asyncio.sleep

        async def _fast(delay):
            await real_sleep(min(delay, 0.001))

        with patch("asyncio.sleep", new=_fast):
            task = asyncio.create_task(server._broadcast_loop())
            for _ in range(200):
                await real_sleep(0.005)
                if mock_market.next_candle.call_count >= 2:
                    break
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        assert mock_market.next_candle.call_count >= 2


class TestWebSocketMetrics:
    def test_metrics_initialization(self, server):
        """Test that WebSocketMetrics is initialized correctly."""
        assert server.metrics is not None
        assert server.metrics.message_count == 0
        assert server.metrics.bytes_sent == 0

    def test_prometheus_exposes_ws_metrics(self, server):
        """WS-layer counters must appear in the /metrics exposition."""
        prom = server._get_prometheus_metrics()
        for name in (
            "exchange_simulator_messages_total",
            "exchange_simulator_bytes_sent_total",
            "exchange_simulator_clients_connected",
            "exchange_simulator_delta_update_ratio",
            "exchange_simulator_bandwidth_mbps",
            "exchange_simulator_broadcast_latency_p95_ms",
        ):
            assert name in prom, name
        # Wire compression (permessage-deflate) happens inside the websockets
        # transport — the app can never observe compressed size, so the old
        # eternal-zero compression_ratio gauge was removed (S347).
        assert "exchange_simulator_compression_ratio" not in prom

    def test_record_message(self, server):
        """Test that message recording works correctly."""
        server.metrics.record_message(1000)
        assert server.metrics.message_count == 1
        assert server.metrics.bytes_sent == 1000
        assert server.metrics.get_avg_message_size() == 1000.0

    @pytest.mark.asyncio
    async def test_broadcast_send_records_metrics(self, server, mock_market):
        """Production broadcast path must feed the metrics — previously
        client.send() was called directly and every counter stayed at 0 (S347)."""
        client = AsyncMock(spec=ServerConnection)
        server.clients = {client}
        server._client_subscriptions = {client: set(mock_market.symbols)}

        await server._broadcast_market_data([], {}, {}, None)

        payload = client.send.call_args[0][0]
        assert server.metrics.message_count == 1
        assert server.metrics.bytes_sent == len(payload.encode("utf-8"))
        assert len(server.metrics.broadcast_latencies) == 1

    @pytest.mark.asyncio
    async def test_fills_batch_records_metrics(self, server):
        """Fill broadcasts are real wire traffic — they must count too."""
        client = AsyncMock(spec=ServerConnection)
        server.clients = {client}

        await server._broadcast_fills_batch([{"id": "o1"}])

        assert server.metrics.message_count == 1
        assert server.metrics.bytes_sent > 0
        assert len(server.metrics.broadcast_latencies) == 1

    @pytest.mark.asyncio
    async def test_audit_broadcast_records_metrics(self, server):
        client = AsyncMock(spec=ServerConnection)
        server.clients = {client}
        server._audit_pending.append({"event_type": "x"})

        await server._broadcast_audit_events()

        assert server.metrics.message_count == 1
        assert len(server.metrics.broadcast_latencies) == 1

    def test_orderbook_delta_decisions_recorded(self, server, mock_market):
        """Each full-vs-delta orderbook decision feeds the EWMA ratio (S347)."""
        server._build_orderbook_data()  # first pass: all full snapshots
        assert server.metrics.delta_update_ratio == 0.0

        # Change every book — second pass sends deltas.
        mock_market.generate_order_book.return_value = MagicMock(
            spec=['bids', 'asks'],
            bids=[OrderBookLevel(price=64000, quantity=1.5)],
            asks=[OrderBookLevel(price=66000, quantity=0.7)],
        )
        server._build_orderbook_data()
        assert server.metrics.delta_update_ratio > 0.0

    @pytest.mark.asyncio
    async def test_send_json_counts_message(self, server):
        """Unicast sends stay counted on the shared counter (S347)."""
        ws = AsyncMock(spec=ServerConnection)
        await server._send_json(ws, {"type": "x"})
        assert server.metrics.message_count == 1

    def test_clients_connected_reads_live_set(self, server):
        """clients_connected is the live client count at scrape time —
        the old send-time copy could lag the real set (S347)."""
        server.clients.add(MagicMock())
        prom = server._get_prometheus_metrics()
        assert "exchange_simulator_clients_connected 1" in prom

    def test_record_delta_update(self, server):
        """Test that delta update ratio is calculated correctly."""
        # Record several delta updates
        for _ in range(10):
            server.metrics.record_delta_update(True)
        # Ratio should be close to 1.0
        assert server.metrics.delta_update_ratio > 0.5

    def test_record_broadcast_latency(self, server):
        """Test that broadcast latency is recorded correctly."""
        server.metrics.record_broadcast_latency(10.5)
        server.metrics.record_broadcast_latency(15.2)
        server.metrics.record_broadcast_latency(8.7)
        assert len(server.metrics.broadcast_latencies) == 3

    def test_p95_message_size(self, server):
        """Test p95 message size calculation."""
        sizes = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
        for size in sizes:
            server.metrics.record_message(size)
        p95 = server.metrics.get_p95_message_size()
        assert p95 > 900  # p95 should be close to max

    def test_p95_broadcast_latency(self, server):
        """Test p95 broadcast latency calculation."""
        latencies = [10.0, 20.0, 30.0, 40.0, 50.0]
        for latency in latencies:
            server.metrics.record_broadcast_latency(latency)
        p95 = server.metrics.get_p95_broadcast_latency()
        assert p95 > 40.0  # p95 should be close to max

    def test_bandwidth_calculation(self, server):
        """Test bandwidth calculation in Mbps."""
        # Simulate sending 1MB over 1 second
        for _ in range(1000):
            server.metrics.record_message(1000)  # 1KB per message
        # Force elapsed time to 1 second for test
        server.metrics._start_time = time.monotonic() - 1.0
        bandwidth = server.metrics.get_bandwidth_mbps()
        # 1MB/s = 8Mbps
        assert bandwidth > 7.0 and bandwidth < 9.0

    def test_max_samples_limit(self, server):
        """Test that message sizes are limited to max_samples."""
        # Add more messages than max_samples
        for i in range(15000):
            server.metrics.record_message(i)
        # Should be limited to max_samples
        assert len(server.metrics.message_sizes) == server.metrics.max_samples


class TestSequenceNumbers:
    """Tests for sequence number tracking in broadcast messages."""

    @pytest.mark.asyncio
    async def test_seq_increments(self, server, mock_market):
        """Test that sequence number increments with each broadcast."""
        mock_market.next_candle.return_value = []
        server._running = True
        server._tick_interval = 0.01

        client = AsyncMock(spec=ServerConnection)
        server.clients = {client}
        server._client_subscriptions = {client: set(mock_market.symbols)}

        initial_seq = server._sequence_number
        await server._broadcast_market_data([], {}, {}, None)
        assert server._sequence_number == initial_seq + 1

        await server._broadcast_market_data([], {}, {}, None)
        assert server._sequence_number == initial_seq + 2

    @pytest.mark.asyncio
    async def test_seq_in_message(self, server, mock_market):
        """Test that sequence number is included in broadcast message."""
        mock_market.next_candle.return_value = []
        server._running = True

        client = AsyncMock(spec=ServerConnection)
        server.clients = {client}
        server._client_subscriptions = {client: set(mock_market.symbols)}

        server._sequence_number = 42
        await server._broadcast_market_data([], {}, {}, None)

        sent_data = client.send.call_args[0][0]
        msg = json.loads(sent_data)
        assert msg["seq"] == 43


class TestSubscriptionFiltering:
    """Tests for selective subscription filtering in broadcast."""

    @pytest.mark.asyncio
    async def test_filtered_candles(self, server, mock_market):
        """Test that candles are filtered by client subscription."""
        from exchange_simulator.models import Candle

        candle_btc = Candle(
            symbol="BTC/USDT", timestamp=100, open=65000,
            high=65100, low=64900, close=65050, volume=10.0,
            exchange="binance",
        )
        candle_eth = Candle(
            symbol="ETH/USDT", timestamp=100, open=3500,
            high=3510, low=3490, close=3505, volume=50.0,
            exchange="binance",
        )
        mock_market.next_candle.return_value = [candle_btc, candle_eth]

        client = AsyncMock(spec=ServerConnection)
        server.clients = {client}
        server._client_subscriptions = {client: {"BTC/USDT"}}

        await server._broadcast_market_data(
            [candle_btc, candle_eth], {}, {}, None
        )

        sent_data = client.send.call_args[0][0]
        msg = json.loads(sent_data)
        symbols_in_msg = {c["symbol"] for c in msg["candles"]}
        assert symbols_in_msg == {"BTC/USDT"}

    @pytest.mark.asyncio
    async def test_unfiltered_for_all_symbols(self, server, mock_market):
        """Test that clients subscribed to all symbols get full data."""
        from exchange_simulator.models import Candle

        candle_btc = Candle(
            symbol="BTC/USDT", timestamp=100, open=65000,
            high=65100, low=64900, close=65050, volume=10.0,
            exchange="binance",
        )
        candle_eth = Candle(
            symbol="ETH/USDT", timestamp=100, open=3500,
            high=3510, low=3490, close=3505, volume=50.0,
            exchange="binance",
        )

        client = AsyncMock(spec=ServerConnection)
        server.clients = {client}
        server._client_subscriptions = {client: set(mock_market.symbols)}

        await server._broadcast_market_data(
            [candle_btc, candle_eth], {}, {}, None
        )

        sent_data = client.send.call_args[0][0]
        msg = json.loads(sent_data)
        assert len(msg["candles"]) == 2

    @pytest.mark.asyncio
    async def test_filtered_orderbooks(self, server, mock_market):
        """Test that orderbooks are filtered by subscription."""
        orderbooks = {
            "binance|BTC/USDT": {"exchange": "binance", "symbol": "BTC/USDT", "bids": [], "asks": []},
            "binance|ETH/USDT": {"exchange": "binance", "symbol": "ETH/USDT", "bids": [], "asks": []},
        }

        client = AsyncMock(spec=ServerConnection)
        server.clients = {client}
        server._client_subscriptions = {client: {"BTC/USDT"}}

        await server._broadcast_market_data([], orderbooks, {}, None)

        sent_data = client.send.call_args[0][0]
        msg = json.loads(sent_data)
        assert "binance|BTC/USDT" in msg["orderbooks"]
        assert "binance|ETH/USDT" not in msg["orderbooks"]


class TestUnsubscribeHandler:
    """Tests for the unsubscribe message handler."""

    @pytest.mark.asyncio
    async def test_unsubscribe_removes_symbols(self, server):
        """Test that unsubscribe removes symbols from client subscription."""
        ws = AsyncMock(spec=ServerConnection)
        server._client_subscriptions[ws] = {"BTC/USDT", "ETH/USDT", "SOL/USDT"}

        await server._handle_unsubscribe(ws, {
            "type": "unsubscribe",
            "symbols": ["ETH/USDT", "SOL/USDT"],
        })

        remaining = server._client_subscriptions[ws]
        assert remaining == {"BTC/USDT"}

    @pytest.mark.asyncio
    async def test_unsubscribe_empty_symbols(self, server):
        """Test that unsubscribe with no symbols is a no-op."""
        ws = AsyncMock(spec=ServerConnection)
        server._client_subscriptions[ws] = {"BTC/USDT", "ETH/USDT"}

        await server._handle_unsubscribe(ws, {
            "type": "unsubscribe",
            "symbols": [],
        })

        assert server._client_subscriptions[ws] == {"BTC/USDT", "ETH/USDT"}

    @pytest.mark.asyncio
    async def test_unsubscribe_not_subscribed(self, server):
        """Test that unsubscribing non-subscribed symbols is safe."""
        ws = AsyncMock(spec=ServerConnection)
        server._client_subscriptions[ws] = {"BTC/USDT"}

        await server._handle_unsubscribe(ws, {
            "type": "unsubscribe",
            "symbols": ["DOGE/USDT"],
        })

        assert server._client_subscriptions[ws] == {"BTC/USDT"}
