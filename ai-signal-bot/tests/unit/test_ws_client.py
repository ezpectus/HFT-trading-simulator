"""Tests for ExchangeClient WebSocket client — message processing, order submission, state management."""
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import websockets

from src.communication.ws_client import ExchangeClient


@pytest.fixture
def client():
    return ExchangeClient(url="ws://localhost:8765", encoding="json")


class TestExchangeClientInit:
    def test_defaults(self, client):
        assert client.url == "ws://localhost:8765"
        assert client._encoding == "json"
        assert client._connected is False
        assert client._trading_active is True

    def test_msgpack_fallback_to_json(self):
        c = ExchangeClient(encoding="msgpack")
        assert c._encoding in ("msgpack", "json")

    def test_properties_initial_state(self, client):
        assert client.connected is False
        assert client.is_trading_active is True
        assert client.latest_candles == {}
        assert client.candle_history == {}
        assert client.latest_prices == {}
        assert client.accounts == {}


class TestTimeoutConfig:
    """Regression S117: network.* timeouts must reach the websockets client."""

    @pytest.mark.asyncio
    async def test_connect_passes_open_timeout(self):
        c = ExchangeClient(url="ws://localhost:1", connect_timeout=4, recv_timeout=12)
        assert c._connect_timeout == 4
        assert c._recv_timeout == 12
        with patch("src.communication.ws_client.websockets.connect", new_callable=AsyncMock) as mock_connect:
            mock_connect.return_value.send = AsyncMock()
            await c.connect()
        assert mock_connect.call_args.kwargs["open_timeout"] == 4

    @pytest.mark.asyncio
    async def test_recv_watchdog_reconnects_on_idle_socket(self):
        """A silent dead connection must hit recv_timeout, drop state, and retry connect."""
        c = ExchangeClient(url="ws://localhost:1", connect_timeout=1, recv_timeout=0.05)
        dead_ws = AsyncMock(spec=websockets.WebSocketClientProtocol)

        async def _hang():
            await asyncio.sleep(60)

        dead_ws.recv = _hang  # a real coroutine fn — AsyncMock side_effect returns instantly
        c._ws = dead_ws
        c._connected = True
        # Break the infinite listen loop deterministically at the reconnect step —
        # task.cancel() during wait_for would be eaten by the TimeoutError handler.
        c.connect = AsyncMock(side_effect=asyncio.CancelledError)

        try:
            await c.listen()
        except asyncio.CancelledError:
            pass

        assert c._connected is False
        assert c._ws is None
        c.connect.assert_awaited()


class TestProcessMessage:
    def test_welcome_message(self, client):
        data = {"type": "welcome", "protocol_version": 2, "trading_active": False}
        client._process_message(data)
        assert client._trading_active is False

    def test_trading_state_active(self, client):
        data = {"type": "trading_state", "trading_active": True}
        client._process_message(data)
        assert client._trading_active is True

    def test_trading_state_stopped(self, client):
        data = {"type": "trading_state", "trading_active": False}
        client._process_message(data)
        assert client._trading_active is False

    def test_candle_snapshot(self, client):
        candle = {"symbol": "BTC/USDT", "open": 50000, "high": 50100, "low": 49900, "close": 50050, "volume": 10.5}
        data = {"type": "snapshot", "candles": [candle], "prices": {"binance": {"BTC/USDT": 50050}}, "accounts": {"binance": {"balance": 100000}}}
        client._process_message(data)
        assert "BTC/USDT" in client._latest_candles
        assert client._latest_candles["BTC/USDT"]["close"] == 50050
        assert "BTC/USDT" in client._candle_history
        assert len(client._candle_history["BTC/USDT"]) == 1
        assert client._latest_prices["binance"]["BTC/USDT"] == 50050
        assert client._accounts["binance"]["balance"] == 100000

    def test_candle_accumulation(self, client):
        for i in range(5):
            candle = {"symbol": "ETH/USDT", "close": 3000 + i, "open": 0, "high": 0, "low": 0, "volume": 0}
            client._process_message({"type": "candles", "candles": [candle]})
        assert len(client._candle_history["ETH/USDT"]) == 5
        assert client._latest_candles["ETH/USDT"]["close"] == 3004

    def test_candle_history_maxlen(self, client):
        for i in range(250):
            candle = {"symbol": "SOL/USDT", "close": float(i), "open": 0, "high": 0, "low": 0, "volume": 0}
            client._process_message({"type": "candles", "candles": [candle]})
        assert len(client._candle_history["SOL/USDT"]) == 200

    def test_trading_active_from_snapshot(self, client):
        data = {"type": "snapshot", "candles": [], "trading_active": False}
        client._process_message(data)
        assert client._trading_active is False

    def test_error_message_no_crash(self, client):
        data = {"type": "error", "message": "something went wrong"}
        client._process_message(data)

    def test_unknown_type_no_crash(self, client):
        data = {"type": "unknown_type"}
        client._process_message(data)


class TestSetMessageHandler:
    def test_set_handler(self, client):
        handler = MagicMock()
        client.set_message_handler(handler)
        assert client._on_message is handler


class TestSubmitOrder:
    @pytest.mark.asyncio
    async def test_not_connected(self, client):
        await client.submit_order("BTC/USDT", "buy", 1.0)
        assert client._ws is None

    @pytest.mark.asyncio
    async def test_trading_stopped(self, client):
        client._ws = AsyncMock(spec=websockets.WebSocketClientProtocol)
        client._connected = True
        client._trading_active = False
        await client.submit_order("BTC/USDT", "buy", 1.0)
        client._ws.send.assert_not_called()

    @pytest.mark.asyncio
    async def test_order_sent(self, client):
        client._ws = AsyncMock(spec=websockets.WebSocketClientProtocol)
        client._connected = True
        client._trading_active = True
        await client.submit_order("BTC/USDT", "buy", 1.0, exchange="binance", stop_loss=49000, take_profit=51000)
        client._ws.send.assert_called_once()
        sent = json.loads(client._ws.send.call_args[0][0])
        assert sent["type"] == "order"
        assert sent["symbol"] == "BTC/USDT"
        assert sent["side"] == "buy"
        assert sent["quantity"] == 1.0
        assert sent["stop_loss"] == 49000
        assert sent["take_profit"] == 51000


class TestClosePosition:
    @pytest.mark.asyncio
    async def test_not_connected(self, client):
        await client.close_position("BTC/USDT")
        assert client._ws is None

    @pytest.mark.asyncio
    async def test_close_sent(self, client):
        client._ws = AsyncMock(spec=websockets.WebSocketClientProtocol)
        await client.close_position("ETH/USDT", exchange="okx")
        client._ws.send.assert_called_once()
        sent = json.loads(client._ws.send.call_args[0][0])
        assert sent["type"] == "close_position"
        assert sent["symbol"] == "ETH/USDT"
        assert sent["exchange"] == "okx"


class TestDisconnect:
    @pytest.mark.asyncio
    async def test_disconnect_clears_state(self, client):
        client._ws = AsyncMock(spec=websockets.WebSocketClientProtocol)
        ws_mock = client._ws
        client._connected = True
        await client.disconnect()
        ws_mock.close.assert_called_once()
        assert client._ws is None
        assert client._connected is False

    @pytest.mark.asyncio
    async def test_disconnect_no_ws(self, client):
        await client.disconnect()
        assert client._connected is False


class TestSeqGapDetection:
    """S151 — seq was write-only; a dropped broadcast must trigger sync_state."""

    @pytest.mark.asyncio
    async def test_seq_gap_requests_sync_state(self, client):
        client._ws = AsyncMock(spec=websockets.WebSocketClientProtocol)
        client._connected = True
        client._process_message({"type": "candles", "seq": 5, "timestamp": 100,
                                 "candles": []})
        client._process_message({"type": "candles", "seq": 8, "timestamp": 110,
                                 "candles": []})
        await asyncio.sleep(0)
        client._ws.send.assert_awaited_once()
        sent = json.loads(client._ws.send.call_args[0][0])
        assert sent["type"] == "sync_state"
        # Cursor must be the pre-gap ts (100), not the gapped message's (110)
        assert sent["last_timestamp"] == 100

    @pytest.mark.asyncio
    async def test_contiguous_seq_no_resync(self, client):
        client._ws = AsyncMock(spec=websockets.WebSocketClientProtocol)
        client._connected = True
        for seq in (1, 2, 3):
            client._process_message({"type": "candles", "seq": seq, "candles": []})
        await asyncio.sleep(0)
        client._ws.send.assert_not_called()

    @pytest.mark.asyncio
    async def test_resync_cooldown(self, client):
        client._ws = AsyncMock(spec=websockets.WebSocketClientProtocol)
        client._connected = True
        for seq in (1, 5, 10):  # two gaps inside the cooldown window
            client._process_message({"type": "candles", "seq": seq, "candles": []})
        await asyncio.sleep(0)
        assert client._ws.send.await_count == 1

    def test_welcome_resets_seq_baseline(self, client):
        client._last_seq = 99
        client._process_message({"type": "welcome", "protocol_version": 2})
        assert client._last_seq == 0
