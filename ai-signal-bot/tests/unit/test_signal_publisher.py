"""Tests for SignalPublisher — broadcast, history, client management, backtest."""
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.communication.signal_publisher import SignalPublisher


@pytest.fixture
def publisher():
    return SignalPublisher(host="localhost", port=8766)


class TestSignalPublisherInit:
    def test_defaults(self, publisher):
        assert publisher.host == "localhost"
        assert publisher.port == 8766
        assert publisher._running is False
        assert publisher._max_history == 100
        assert len(publisher._signal_history) == 0

    def test_client_count(self, publisher):
        assert publisher.client_count == 0

    def test_signals_sent(self, publisher):
        assert publisher.signals_sent == 0


class TestBroadcastSignal:
    @pytest.mark.asyncio
    async def test_no_clients_no_error(self, publisher):
        signal = {"symbol": "BTC/USDT", "direction": "LONG", "confidence": 75}
        await publisher.broadcast_signal(signal)
        assert len(publisher._signal_history) == 1
        assert publisher._signal_history[0]["direction"] == "LONG"

    @pytest.mark.asyncio
    async def test_broadcast_to_clients(self, publisher):
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        publisher._clients.add(ws1)
        publisher._clients.add(ws2)

        signal = {"symbol": "BTC/USDT", "direction": "LONG", "confidence": 75}
        await publisher.broadcast_signal(signal)

        ws1.send.assert_called_once()
        ws2.send.assert_called_once()
        msg = json.loads(ws1.send.call_args[0][0])
        assert msg["type"] == "signal"
        assert msg["symbol"] == "BTC/USDT"
        assert msg["direction"] == "LONG"
        assert "timestamp" in msg

    @pytest.mark.asyncio
    async def test_broadcast_removes_disconnected(self, publisher):
        ws_good = AsyncMock()
        ws_bad = AsyncMock()
        ws_bad.send.side_effect = Exception("Connection closed")
        publisher._clients.add(ws_good)
        publisher._clients.add(ws_bad)

        await publisher.broadcast_signal({"symbol": "ETH/USDT", "direction": "SHORT"})
        assert ws_good in publisher._clients
        assert ws_bad not in publisher._clients

    @pytest.mark.asyncio
    async def test_history_capped(self, publisher):
        publisher._max_history = 3
        for i in range(5):
            await publisher.broadcast_signal({"symbol": f"SYM{i}", "direction": "LONG"})
        assert len(publisher._signal_history) == 3
        assert publisher._signal_history[0]["symbol"] == "SYM2"
        assert publisher._signal_history[-1]["symbol"] == "SYM4"

    @pytest.mark.asyncio
    async def test_timestamp_added(self, publisher):
        signal = {"symbol": "BTC/USDT", "direction": "LONG", "confidence": 80}
        await publisher.broadcast_signal(signal)
        assert "timestamp" in publisher._signal_history[0]
        assert isinstance(publisher._signal_history[0]["timestamp"], int)

    @pytest.mark.asyncio
    async def test_signal_dict_not_mutated(self, publisher):
        """Regression: broadcast_signal should not mutate the caller's dict."""
        signal = {"symbol": "BTC/USDT", "direction": "LONG", "confidence": 80}
        await publisher.broadcast_signal(signal)
        assert "timestamp" not in signal  # caller's dict should be unchanged

    @pytest.mark.asyncio
    async def test_signal_history_independent_of_caller(self, publisher):
        """Regression: history should not be corrupted if caller modifies dict after broadcast."""
        signal = {"symbol": "BTC/USDT", "direction": "LONG", "confidence": 80}
        await publisher.broadcast_signal(signal)
        # Caller modifies the dict after broadcast
        signal["direction"] = "SHORT"
        signal["symbol"] = "ETH/USDT"
        # History should still have the original values
        assert publisher._signal_history[0]["direction"] == "LONG"
        assert publisher._signal_history[0]["symbol"] == "BTC/USDT"

    @pytest.mark.asyncio
    async def test_circuit_breaker_blocks_signal(self, publisher):
        """Signal should be blocked when circuit breaker is open."""
        publisher.circuit_breaker = MagicMock()
        publisher.circuit_breaker.allow_signal.return_value = False
        publisher.circuit_breaker.state.value = "open"
        signal = {"symbol": "BTC/USDT", "direction": "LONG", "confidence": 80}
        await publisher.broadcast_signal(signal)
        assert len(publisher._signal_history) == 0
        publisher.circuit_breaker.allow_signal.assert_called_once()

    @pytest.mark.asyncio
    async def test_circuit_breaker_records_blocked_metric(self, publisher):
        """Blocked signals should increment the metrics counter."""
        publisher.circuit_breaker = MagicMock()
        publisher.circuit_breaker.allow_signal.return_value = False
        publisher.circuit_breaker.state.value = "open"
        await publisher.broadcast_signal({"symbol": "BTC/USDT", "direction": "LONG"})
        # Check that record_signal_blocked was called
        rendered = publisher.metrics.render()
        assert "ai_signal_bot_signals_blocked_total 1" in rendered

    @pytest.mark.asyncio
    async def test_broadcast_records_sent_metric(self, publisher):
        """Successful broadcast should increment the metrics counter."""
        await publisher.broadcast_signal({"symbol": "BTC/USDT", "direction": "LONG"})
        rendered = publisher.metrics.render()
        assert "ai_signal_bot_signals_sent_total 1" in rendered


class TestBroadcastMarketRegime:
    @pytest.mark.asyncio
    async def test_no_clients(self, publisher):
        await publisher.broadcast_market_regime("BTC/USDT", "trending", 0.8, 0.6)
        # Should not error

    @pytest.mark.asyncio
    async def test_broadcast_to_clients(self, publisher):
        ws = AsyncMock()
        publisher._clients.add(ws)
        await publisher.broadcast_market_regime("BTC/USDT", "trending", 0.85, 0.62)
        msg = json.loads(ws.send.call_args[0][0])
        assert msg["type"] == "market_regime"
        assert msg["symbol"] == "BTC/USDT"
        assert msg["regime"] == "trending"
        assert msg["trend_score"] == 0.85
        assert msg["cycle_strength"] == 0.62

    @pytest.mark.asyncio
    async def test_removes_disconnected(self, publisher):
        ws = AsyncMock()
        ws.send.side_effect = Exception("closed")
        publisher._clients.add(ws)
        await publisher.broadcast_market_regime("BTC/USDT", "ranging", 0.2, 0.3)
        assert len(publisher._clients) == 0


class TestHandleClient:
    @pytest.mark.asyncio
    async def test_client_added_on_connect(self, publisher):
        ws = MagicMock()
        ws.remote_address = ("127.0.0.1", 12345)
        ws.__aiter__ = MagicMock(return_value=iter([]))
        await publisher._handle_client(ws)
        # After disconnect, client should be removed
        assert ws not in publisher._clients

    @pytest.mark.asyncio
    async def test_subscribe_message(self, publisher):
        ws = MagicMock()
        ws.remote_address = ("127.0.0.1", 12345)

        async def msg_iter():
            yield json.dumps({"type": "subscribe", "client": "hft_trade_bot"})

        ws.__aiter__ = MagicMock(return_value=msg_iter())
        await publisher._handle_client(ws)
        assert ws not in publisher._clients  # Removed after disconnect

    @pytest.mark.asyncio
    async def test_invalid_json_handled(self, publisher):
        ws = MagicMock()
        ws.remote_address = ("127.0.0.1", 12345)

        async def msg_iter():
            yield "not valid json"

        ws.__aiter__ = MagicMock(return_value=msg_iter())
        await publisher._handle_client(ws)
        # Should not crash

    @pytest.mark.asyncio
    async def test_signal_history_sent_on_connect(self, publisher):
        publisher._signal_history = [{"symbol": "BTC", "direction": "LONG"}]
        ws = MagicMock()
        ws.remote_address = ("127.0.0.1", 12345)
        ws.send = AsyncMock()

        async def msg_iter():
            return
            yield  # Make it an async generator

        ws.__aiter__ = MagicMock(return_value=msg_iter())
        await publisher._handle_client(ws)
        # History should have been sent
        ws.send.assert_called()


class TestStartStop:
    @pytest.mark.asyncio
    async def test_start(self, publisher):
        with patch('websockets.serve', new_callable=AsyncMock) as mock_serve:
            mock_server = MagicMock()
            mock_serve.return_value = mock_server
            await publisher.start()
            assert publisher._running is True
            assert publisher._server is not None

    @pytest.mark.asyncio
    async def test_stop(self, publisher):
        publisher._server = MagicMock()
        publisher._server.close = MagicMock()
        publisher._server.wait_closed = AsyncMock()
        await publisher.stop()
        assert publisher._running is False
        publisher._server.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_stop_no_server(self, publisher):
        await publisher.stop()
        assert publisher._running is False
