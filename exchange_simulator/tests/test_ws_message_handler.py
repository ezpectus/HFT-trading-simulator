"""Tests for MessageHandlerMixin order submission — especially advanced-order
param forwarding, which was silently dropped for a long time (S083): the WS
API accepted stop_price/oco_group_id etc. but never passed them to the
exchange, so external clients could not submit advanced orders at all."""
import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from exchange_simulator.websocket_server import ExchangeWebSocketServer


@pytest.fixture
def mock_market():
    market = MagicMock()
    market.symbols = ["BTC/USDT"]
    market.exchanges = ["binance"]
    market.current_timestamp = 1000000
    market._volatility = {"BTC/USDT": 0.75}
    market.get_all_prices.return_value = {"binance": {"BTC/USDT": 65000}}
    market.get_price.return_value = 65000.0
    return market


@pytest.fixture
def capturing_exchange():
    """Exchange whose submit_order records kwargs and returns a filled order."""
    ex = MagicMock()
    ex.submit_calls = []

    def _submit(**kwargs):
        ex.submit_calls.append(kwargs)
        order = MagicMock()
        order.status.value = "FILLED"
        order.filled_price = 65000.0
        order.filled_quantity = kwargs["quantity"]
        order.fee = 0.05
        order.id = "ord-1"
        order.to_dict.return_value = {"id": "ord-1", "status": "FILLED"}
        return order

    ex.submit_order.side_effect = _submit
    return ex


@pytest.fixture
def server(mock_market, capturing_exchange):
    return ExchangeWebSocketServer(
        exchanges={"binance": capturing_exchange},
        market=mock_market,
        host="localhost",
        port=8765,
    )


class TestOrderSubmission:
    @pytest.mark.asyncio
    async def test_trading_stopped_rejects(self, server, capturing_exchange):
        server._trading_active = False
        ws = AsyncMock()
        await server._handle_message(ws, {
            "type": "order", "exchange": "binance", "symbol": "BTC/USDT",
            "side": "BUY", "quantity": 0.1,
        })
        msg = json.loads(ws.send.call_args[0][0])
        assert msg["type"] == "error"
        assert "start_trading" in msg["message"]
        assert capturing_exchange.submit_calls == []

    @pytest.mark.asyncio
    async def test_forwards_all_advanced_params(self, server, capturing_exchange):
        """Regression for S083: stop/limit/trail/iceberg/oco params must reach
        exchange.submit_order — previously every one of them was dropped."""
        server._trading_active = True
        ws = AsyncMock()
        await server._handle_message(ws, {
            "type": "order", "exchange": "binance", "symbol": "BTC/USDT",
            "side": "SELL", "quantity": 0.5, "order_type": "STOP_LIMIT",
            "price": 64000, "stop_price": 63000, "limit_price": 62900,
            "trail_amount": 100, "trail_percentage": False,
            "iceberg_visible_qty": 0.1, "oco_group_id": "grp-7",
            "stop_loss": 62000, "take_profit": 66000,
        })
        assert len(capturing_exchange.submit_calls) == 1
        kw = capturing_exchange.submit_calls[0]
        assert kw["stop_price"] == 63000
        assert kw["limit_price"] == 62900
        assert kw["trail_amount"] == 100
        assert kw["trail_percentage"] is False
        assert kw["iceberg_visible_qty"] == 0.1
        assert kw["oco_group_id"] == "grp-7"
        assert kw["stop_loss"] == 62000
        assert kw["take_profit"] == 66000
        assert kw["quantity"] == 0.5

    @pytest.mark.asyncio
    async def test_defaults_for_absent_advanced_params(self, server, capturing_exchange):
        server._trading_active = True
        ws = AsyncMock()
        await server._handle_message(ws, {
            "type": "order", "exchange": "binance", "symbol": "BTC/USDT",
            "side": "BUY", "quantity": 0.1,
        })
        kw = capturing_exchange.submit_calls[0]
        assert kw["stop_price"] is None
        assert kw["oco_group_id"] is None
        assert kw["trail_percentage"] is True

    @pytest.mark.asyncio
    async def test_rejects_nan_quantity(self, server, capturing_exchange):
        server._trading_active = True
        ws = AsyncMock()
        await server._handle_message(ws, {
            "type": "order", "exchange": "binance", "symbol": "BTC/USDT",
            "side": "BUY", "quantity": "NaN",
        })
        msg = json.loads(ws.send.call_args[0][0])
        assert msg["type"] == "error"
        assert capturing_exchange.submit_calls == []

    @pytest.mark.asyncio
    async def test_fill_broadcast_to_other_clients(self, server):
        server._trading_active = True
        ws, other = AsyncMock(), AsyncMock()
        server.clients.add(other)
        await server._handle_message(ws, {
            "type": "order", "exchange": "binance", "symbol": "BTC/USDT",
            "side": "BUY", "quantity": 0.1,
        })
        assert ws.send.called
        assert other.send.called  # fill broadcast reaches other clients
