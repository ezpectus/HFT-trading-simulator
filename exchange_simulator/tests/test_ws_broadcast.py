"""Audit-log feed: AuditLogger callback -> server queue -> WS broadcast -> client."""
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from websockets.asyncio.server import ServerConnection

from exchange_simulator.audit_logger import AuditLogger
from exchange_simulator.models import Account, AuditEventType, OrderBookLevel
from exchange_simulator.websocket_server import ExchangeWebSocketServer

_MARKET_SURFACE = [
    '_candle_count', '_volatility', 'candles_to_next_funding', 'current_timestamp',
    'exchanges', 'generate_order_book', 'get_all_prices', 'get_funding_rates',
    'get_latest_candles', 'get_news_event', 'get_price', 'is_weekend_mode',
    'next_candle', 'symbols',
]
_EXCHANGE_SURFACE = ['account', 'fee_pct', 'slippage_bps', 'get_account_status', 'submit_order', '_order_history', 'cancel_order', 'get_positions', 'get_pending_orders']


@pytest.fixture
def mock_market():
    market = MagicMock(spec=_MARKET_SURFACE)
    market.symbols = ["BTC/USDT"]
    market.exchanges = ["binance"]
    market.current_timestamp = 1000000
    market.get_latest_candles.return_value = []
    market.get_all_prices.return_value = {}
    market.generate_order_book.return_value = MagicMock(spec=['bids', 'asks'], bids=[], asks=[])
    market.get_funding_rates.return_value = {}
    market.get_news_event.return_value = None
    market._volatility = {}
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
    srv = ExchangeWebSocketServer(
        exchanges={"binance": mock_exchange},
        market=mock_market,
        host="localhost",
        port=8765,
    )
    # swap in a file-disabled logger: production path minus the log-file side effect
    srv._audit_logger = AuditLogger(enable_file_logging=False)
    return srv


class TestAuditCallbackQueue:
    def test_log_event_reaches_server_queue(self, server):
        server._audit_logger.register_callback(server._on_audit_event)
        server._audit_logger.log(
            AuditEventType.ORDER_FILLED,
            exchange="binance", symbol="BTC/USDT", order_id="o1",
        )
        assert len(server._audit_pending) == 1
        entry = server._audit_pending[0]
        assert entry["event_type"] == AuditEventType.ORDER_FILLED.value
        assert entry["exchange"] == "binance"
        assert entry["order_id"] == "o1"
        assert entry["id"]
        assert isinstance(entry["timestamp"], int)

    def test_unregister_stops_events(self, server):
        server._audit_logger.register_callback(server._on_audit_event)
        server._audit_logger.unregister_callback(server._on_audit_event)
        server._audit_logger.log(AuditEventType.ORDER_FILLED)
        assert len(server._audit_pending) == 0

    def test_double_register_does_not_duplicate(self, server):
        server._audit_logger.register_callback(server._on_audit_event)
        server._audit_logger.register_callback(server._on_audit_event)
        server._audit_logger.log(AuditEventType.ORDER_FILLED)
        assert len(server._audit_pending) == 1

    def test_queue_is_bounded(self, server):
        server._audit_logger.register_callback(server._on_audit_event)
        for _ in range(server._audit_pending.maxlen + 10):
            server._audit_logger.log(AuditEventType.ORDER_FILLED)
        assert len(server._audit_pending) == server._audit_pending.maxlen


class TestAuditDrainBroadcast:
    @pytest.mark.asyncio
    async def test_drain_broadcasts_audit_log_payload(self, server):
        ws = AsyncMock(spec=ServerConnection)
        server.clients.add(ws)
        server._audit_logger.register_callback(server._on_audit_event)
        server._audit_logger.log(
            AuditEventType.POSITION_CLOSED,
            exchange="binance", symbol="ETH/USDT", position_id="p9",
        )
        await server._broadcast_audit_events()
        sent = json.loads(ws.send.call_args[0][0])
        assert sent["type"] == "audit_logs"
        assert len(sent["logs"]) == 1
        assert sent["logs"][0]["position_id"] == "p9"
        assert len(server._audit_pending) == 0

    @pytest.mark.asyncio
    async def test_drain_no_clients_still_clears(self, server):
        server._audit_pending.append({"event_type": "x"})
        await server._broadcast_audit_events()
        assert len(server._audit_pending) == 0


class TestNegotiatedEncodingBroadcast:
    """S212: broadcast must send TEXT frames to JSON clients and binary
    frames to msgpack clients — never orjson bytes to a JSON client (clients
    discriminate on frame type and would parse bytes as msgpack)."""

    @pytest.mark.asyncio
    async def test_json_client_gets_text_frame(self, server):
        ws = AsyncMock(spec=ServerConnection)
        server.clients.add(ws)
        server._client_encodings[ws] = 'json'
        await server._broadcast_fills_batch([{'order_id': 'o1'}])
        payload = ws.send.call_args[0][0]
        assert isinstance(payload, str)
        assert json.loads(payload)['type'] == 'fills_batch'

    @pytest.mark.asyncio
    async def test_msgpack_client_gets_binary_frame(self, server):
        msgpack = pytest.importorskip('msgpack')
        ws = AsyncMock(spec=ServerConnection)
        server.clients.add(ws)
        server._client_encodings[ws] = 'msgpack'
        await server._broadcast_fills_batch([{'order_id': 'o1'}])
        payload = ws.send.call_args[0][0]
        assert isinstance(payload, (bytes, bytearray))
        assert msgpack.unpackb(payload)['type'] == 'fills_batch'

    @pytest.mark.asyncio
    async def test_mixed_clients_get_respective_frames(self, server):
        msgpack = pytest.importorskip('msgpack')
        ws_json = AsyncMock(spec=ServerConnection)
        ws_pack = AsyncMock(spec=ServerConnection)
        server.clients.update({ws_json, ws_pack})
        server._client_encodings[ws_json] = 'json'
        server._client_encodings[ws_pack] = 'msgpack'
        await server._broadcast_fills_batch([{'order_id': 'o1'}])
        assert isinstance(ws_json.send.call_args[0][0], str)
        assert isinstance(ws_pack.send.call_args[0][0], (bytes, bytearray))

    @pytest.mark.asyncio
    async def test_send_json_honors_negotiated_encoding(self, server):
        msgpack = pytest.importorskip('msgpack')
        ws = AsyncMock(spec=ServerConnection)
        server.clients.add(ws)
        server._client_encodings[ws] = 'msgpack'
        await server._send_json(ws, {'type': 'x'})
        assert isinstance(ws.send.call_args[0][0], (bytes, bytearray))


class _FakeServeCtx:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class TestStartLifecycle:
    @pytest.mark.asyncio
    async def test_start_registers_and_shutdown_unregisters(self, server):
        """Regression: 'await Event' TypeError'd on startup — must reach shutdown cleanly."""
        async def metrics_stub(*_a, **_kw):
            await asyncio.Future()

        with (
            patch("websockets.asyncio.server.serve", return_value=_FakeServeCtx()),
            patch.object(server, "_run_metrics_server", metrics_stub),
        ):
            task = asyncio.create_task(server.start())
            await asyncio.sleep(0.05)
            assert not task.done()  # no TypeError crash on startup
            assert server._on_audit_event in server._audit_logger._callbacks

            server._shutdown_event.set()
            await asyncio.wait_for(task, timeout=2)

            assert server._on_audit_event not in server._audit_logger._callbacks

    @pytest.mark.asyncio
    async def test_serve_failure_still_unregisters(self, server):
        async def metrics_stub(*_a, **_kw):
            await asyncio.Future()

        class _BoomServe:
            async def __aenter__(self):
                raise OSError("port in use")

            async def __aexit__(self, *exc):
                return False

        with (
            patch("websockets.asyncio.server.serve", return_value=_BoomServe()),
            patch.object(server, "_run_metrics_server", metrics_stub),
            pytest.raises(OSError),
        ):
            await server.start()

        # registration happens only after a successful bind — nothing to leak
        assert server._on_audit_event not in server._audit_logger._callbacks
