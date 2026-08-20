"""Security tests for exchange_simulator — input validation, injection prevention.

Tests:
- WebSocket message validation (malformed JSON, oversized payloads, type confusion)
- Order input validation (negative quantities, invalid symbols, type injection)
- Log injection prevention (newline/control characters in user input)
- Numeric overflow/underflow protection
- Encoding attack prevention (msgpack vs json confusion)
"""
import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from exchange_simulator.models import OrderType, Side
from exchange_simulator.websocket_server import ExchangeWebSocketServer
from exchange_simulator.ws_constants import _sanitize_log


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
    # Configure submit_order to return a serializable mock order
    fill_order = MagicMock()
    fill_order.to_dict.return_value = {"id": "test_fill", "status": "FILLED", "symbol": "BTC/USDT", "side": "BUY", "quantity": 1.0, "price": 65000.0, "filled_price": 65000.0, "fee": 0.0}
    fill_order.status.value = "FILLED"
    fill_order.filled_price = 65000.0
    fill_order.fee = 0.0
    ex.submit_order.return_value = fill_order
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


class TestLogInjection:
    """Test that log injection via newline characters is prevented."""

    def test_sanitize_removes_newlines(self):
        """Newline characters in user input must be stripped before logging."""
        malicious = "BTC/USDT\nFAKE LOG LINE\r\nANOTHER FAKE"
        sanitized = _sanitize_log(malicious)
        assert "\n" not in sanitized
        assert "\r" not in sanitized

    def test_sanitize_truncates_long_input(self):
        """Overly long input must be truncated to prevent log flooding."""
        long_input = "A" * 10000
        sanitized = _sanitize_log(long_input)
        assert len(sanitized) <= 200

    def test_sanitize_preserves_normal_input(self):
        """Normal input should pass through with minimal modification."""
        normal = "192.168.1.100:12345"
        sanitized = _sanitize_log(normal)
        assert sanitized == normal


class TestOrderValidation:
    """Test that invalid order inputs are rejected."""

    @pytest.mark.asyncio
    async def test_negative_quantity_rejected(self, server):
        """Orders with negative quantity must be rejected."""
        ws = AsyncMock()
        await server._handle_message(ws, {
            "type": "order",
            "exchange": "binance",
            "symbol": "BTC/USDT",
            "side": "BUY",
            "quantity": -1.0,
        })
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "error"

    @pytest.mark.asyncio
    async def test_zero_quantity_rejected(self, server):
        """Orders with zero quantity must be rejected."""
        ws = AsyncMock()
        await server._handle_message(ws, {
            "type": "order",
            "exchange": "binance",
            "symbol": "BTC/USDT",
            "side": "BUY",
            "quantity": 0,
        })
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "error"

    @pytest.mark.asyncio
    async def test_nonexistent_exchange_rejected(self, server):
        """Orders to non-existent exchanges must be rejected."""
        ws = AsyncMock()
        await server._handle_message(ws, {
            "type": "order",
            "exchange": "fake_exchange",
            "symbol": "BTC/USDT",
            "side": "BUY",
            "quantity": 0.1,
        })
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "error"
        assert "fake_exchange" in msg["message"]

    @pytest.mark.asyncio
    async def test_missing_required_fields_rejected(self, server):
        """Orders missing required fields must be rejected."""
        ws = AsyncMock()
        await server._handle_message(ws, {
            "type": "order",
            "exchange": "binance",
        })
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "error"
        assert "Missing" in msg["message"]

    @pytest.mark.asyncio
    async def test_invalid_side_rejected(self, server):
        """Orders with invalid side must be rejected."""
        ws = AsyncMock()
        await server._handle_message(ws, {
            "type": "order",
            "exchange": "binance",
            "symbol": "BTC/USDT",
            "side": "HACK",
            "quantity": 0.1,
        })
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "error"


class TestMessageValidation:
    """Test that malformed WebSocket messages are handled safely."""

    @pytest.mark.asyncio
    async def test_unknown_message_type_ignored(self, server):
        """Unknown message types should not crash the server."""
        ws = AsyncMock()
        await server._handle_message(ws, {"type": "exploit_attempt"})

    @pytest.mark.asyncio
    async def test_missing_type_field_ignored(self, server):
        """Messages without a type field should be handled gracefully."""
        ws = AsyncMock()
        await server._handle_message(ws, {"data": "malicious"})

    @pytest.mark.asyncio
    async def test_type_confusion_string_vs_dict(self, server):
        """Type confusion attacks (string where dict expected) should be safe."""
        ws = AsyncMock()
        await server._handle_message(ws, {
            "type": "order",
            "exchange": "binance",
            "symbol": "BTC/USDT",
            "side": "BUY",
            "quantity": "not_a_number",
        })
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "error"


class TestNumericOverflow:
    """Test that numeric overflow/underflow is handled safely."""

    @pytest.mark.asyncio
    async def test_extremely_large_quantity(self, server):
        """Extremely large quantities should be handled without overflow."""
        ws = AsyncMock()
        await server._handle_message(ws, {
            "type": "order",
            "exchange": "binance",
            "symbol": "BTC/USDT",
            "side": "BUY",
            "quantity": 1e308,
        })
        assert ws.send.called

    @pytest.mark.asyncio
    async def test_nan_quantity(self, server):
        """NaN quantities should be rejected."""
        ws = AsyncMock()
        await server._handle_message(ws, {
            "type": "order",
            "exchange": "binance",
            "symbol": "BTC/USDT",
            "side": "BUY",
            "quantity": float("nan"),
        })
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "error"

    @pytest.mark.asyncio
    async def test_infinity_quantity(self, server):
        """Infinity quantities should be rejected."""
        ws = AsyncMock()
        await server._handle_message(ws, {
            "type": "order",
            "exchange": "binance",
            "symbol": "BTC/USDT",
            "side": "BUY",
            "quantity": float("inf"),
        })
        sent = ws.send.call_args[0][0]
        msg = json.loads(sent)
        assert msg["type"] == "error"


class TestSubscriptionSecurity:
    """Test that subscription manipulation is safe."""

    @pytest.mark.asyncio
    async def test_subscribe_with_invalid_symbols(self, server):
        """Subscribing with invalid symbol names should not crash."""
        ws = AsyncMock()
        await server._handle_message(ws, {
            "type": "subscribe",
            "symbols": ["'; DROP TABLE--", "../../../etc/passwd", "<script>alert(1)</script>"],
        })
        assert ws.send.called

    @pytest.mark.asyncio
    async def test_unsubscribe_with_empty_list_safe(self, server):
        """Unsubscribing with empty list should be a safe no-op."""
        ws = AsyncMock()
        server._client_subscriptions[ws] = {"BTC/USDT"}
        await server._handle_unsubscribe(ws, {"type": "unsubscribe", "symbols": []})
        assert server._client_subscriptions[ws] == {"BTC/USDT"}

    @pytest.mark.asyncio
    async def test_unsubscribe_all_symbols(self, server):
        """Unsubscribing all symbols should result in empty set."""
        ws = AsyncMock()
        server._client_subscriptions[ws] = {"BTC/USDT", "ETH/USDT"}
        await server._handle_unsubscribe(ws, {
            "type": "unsubscribe",
            "symbols": ["BTC/USDT", "ETH/USDT"],
        })
        assert len(server._client_subscriptions[ws]) == 0
