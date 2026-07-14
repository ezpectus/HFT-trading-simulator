"""Tests for ExchangeWebSocketServer — message handling, validation, metrics."""
import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from exchange_simulator.websocket_server import ExchangeWebSocketServer
from exchange_simulator.models import Side, OrderType


@pytest.fixture
def mock_market():
    market = MagicMock()
    market.symbols = ["BTC/USDT", "ETH/USDT"]
    market.exchanges = ["binance", "bybit", "okx"]
    market.current_timestamp = 1000000
    market._candle_count = 42
    market.is_weekend_mode = False
    market.get_latest_candles.return_value = []
    market.get_all_prices.return_value = {"binance": {"BTC/USDT": 65000}}
    market.generate_order_book.return_value = MagicMock(
        bids=[MagicMock(price=64900, quantity=0.5)],
        asks=[MagicMock(price=65100, quantity=0.3)],
    )
    market.get_funding_rates.return_value = {"binance": 0.0001}
    market.candles_to_next_funding = 50
    market.get_news_event.return_value = None
    market._volatility = {"BTC/USDT": 0.75}
    market.get_price.return_value = 65000.0
    return market


@pytest.fixture
def mock_exchange():
    ex = MagicMock()
    ex.fee_pct = 0.075
    ex.slippage_bps = 5.0
    ex.account = MagicMock()
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
        ws = AsyncMock()
        await server._handle_message(ws, {"type": "ping"})
        sent = ws.send.call_args[0][0]
        assert json.loads(sent)["type"] == "pong"

    @pytest.mark.asyncio
    async def test_unknown_exchange_error(self, server):
        ws = AsyncMock()
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
        ws = AsyncMock()
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
        ws = AsyncMock()
        await server._handle_message(ws, {"type": "subscribe"})
        assert ws.send.called
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "snapshot"

    @pytest.mark.asyncio
    async def test_set_speed(self, server):
        ws = AsyncMock()
        await server._handle_message(ws, {"type": "set_speed", "speed": 2})
        assert server._tick_interval == 0.5
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "speed_set"
        assert msg["speed"] == 2

    @pytest.mark.asyncio
    async def test_set_speed_pause(self, server):
        ws = AsyncMock()
        await server._handle_message(ws, {"type": "set_speed", "speed": 0})
        assert server._replay_paused is True
        assert server._speed_event.is_set() is False

    @pytest.mark.asyncio
    async def test_replay_pause(self, server):
        ws = AsyncMock()
        await server._handle_message(ws, {"type": "replay", "action": "pause"})
        assert server._replay_paused is True
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "replay_state"
        assert msg["paused"] is True

    @pytest.mark.asyncio
    async def test_replay_resume(self, server):
        server._replay_paused = True
        ws = AsyncMock()
        await server._handle_message(ws, {"type": "replay", "action": "resume"})
        assert server._replay_paused is False
        assert server._replay_offset == 0

    @pytest.mark.asyncio
    async def test_update_config_volatility(self, server, mock_market):
        ws = AsyncMock()
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
        ws = AsyncMock()
        await server._handle_message(ws, {
            "type": "update_config",
            "updates": {"fees": {"binance": 0.05}},
        })
        assert mock_exchange.fee_pct == 0.05

    @pytest.mark.asyncio
    async def test_update_config_slippage(self, server, mock_exchange):
        ws = AsyncMock()
        await server._handle_message(ws, {
            "type": "update_config",
            "updates": {"slippage": {"binance": 10}},
        })
        assert mock_exchange.slippage_bps == 10

    @pytest.mark.asyncio
    async def test_start_trading(self, server):
        server._trading_active = False
        ws = AsyncMock()
        await server._handle_message(ws, {"type": "start_trading"})
        assert server._trading_active is True
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "trading_state"
        assert msg["trading_active"] is True

    @pytest.mark.asyncio
    async def test_stop_trading(self, server):
        assert server._trading_active is True
        ws = AsyncMock()
        await server._handle_message(ws, {"type": "stop_trading"})
        assert server._trading_active is False
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "trading_state"
        assert msg["trading_active"] is False

    @pytest.mark.asyncio
    async def test_order_rejected_when_trading_stopped(self, server, mock_exchange):
        server._trading_active = False
        ws = AsyncMock()
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
        ws = AsyncMock()
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
        with patch('asyncio.sleep', new_callable=AsyncMock):
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
        server.clients.add(AsyncMock())
        with patch('asyncio.sleep', new_callable=AsyncMock):
            task = asyncio.create_task(server._broadcast_loop())
            await asyncio.sleep(0.01)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        mock_market.next_candle.assert_not_called()
