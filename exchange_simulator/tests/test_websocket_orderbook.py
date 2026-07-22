"""Tests for WebSocket server order book broadcast."""
import asyncio
import json

import pytest

from exchange_simulator.exchange import SimulatedExchange
from exchange_simulator.market_simulator import MarketSimulator
from exchange_simulator.websocket_server import ExchangeWebSocketServer


@pytest.fixture
def market():
    return MarketSimulator(
        symbols=["BTC/USDT", "ETH/USDT"],
        exchanges=["binance", "bybit"],
        initial_prices={"BTC/USDT": 65000, "ETH/USDT": 3500},
        volatility={"BTC/USDT": 0.75, "ETH/USDT": 0.85},
        seed=42,
        warmup_candles=50,
        order_book_depth=10,
    )


@pytest.fixture
def exchanges(market):
    return {
        "binance": SimulatedExchange(
            exchange_id="binance", name="Binance",
            fee_pct=0.1, slippage_bps=1.0, market=market,
        ),
        "bybit": SimulatedExchange(
            exchange_id="bybit", name="Bybit",
            fee_pct=0.08, slippage_bps=1.5, market=market,
        ),
    }


@pytest.fixture
def ws_server(exchanges, market):
    return ExchangeWebSocketServer(exchanges=exchanges, market=market)


class TestOrderBookBroadcast:
    """Test that order book snapshots are included in WebSocket messages."""

    @pytest.mark.asyncio
    async def test_snapshot_includes_orderbooks(self, ws_server):
        """Test that _send_market_snapshot includes order book data."""
        class FakeWS:
            def __init__(self):
                self.sent = []

            async def send(self, data):
                self.sent.append(json.loads(data))

        fake_ws = FakeWS()
        await ws_server._send_market_snapshot(fake_ws)

        assert len(fake_ws.sent) == 1
        msg = fake_ws.sent[0]
        assert msg["type"] == "snapshot"
        assert "orderbooks" in msg
        assert len(msg["orderbooks"]) == 4  # 2 exchanges x 2 symbols

        # Check structure of one order book
        key = "binance|BTC/USDT"
        assert key in msg["orderbooks"]
        ob = msg["orderbooks"][key]
        assert ob["exchange"] == "binance"
        assert ob["symbol"] == "BTC/USDT"
        assert len(ob["bids"]) > 0
        assert len(ob["asks"]) > 0
        assert ob["bids"][0]["price"] < ob["asks"][0]["price"]

    @pytest.mark.asyncio
    async def test_broadcast_includes_orderbooks(self, ws_server):
        """Test that _broadcast_loop includes order book data."""
        class FakeWS:
            def __init__(self):
                self.sent = []

            async def send(self, data):
                self.sent.append(json.loads(data))

        fake_ws = FakeWS()
        ws_server.clients.add(fake_ws)

        # Run one iteration of broadcast loop
        ws_server._running = True

        async def stop_after_one():
            await asyncio.sleep(1.5)
            ws_server._running = False

        await asyncio.gather(
            ws_server._broadcast_loop(),
            stop_after_one(),
        )

        assert len(fake_ws.sent) > 0
        msg = fake_ws.sent[0]
        assert msg["type"] == "candles"
        assert "orderbooks" in msg
        assert len(msg["orderbooks"]) == 4

    @pytest.mark.asyncio
    async def test_orderbook_keys_format(self, ws_server):
        """Test that order book keys are in exchange|symbol format."""
        class FakeWS:
            def __init__(self):
                self.sent = []

            async def send(self, data):
                self.sent.append(json.loads(data))

        fake_ws = FakeWS()
        await ws_server._send_market_snapshot(fake_ws)

        msg = fake_ws.sent[0]
        for key in msg["orderbooks"]:
            assert "|" in key
            exchange, symbol = key.split("|")
            assert exchange in ("binance", "bybit")
            assert symbol in ("BTC/USDT", "ETH/USDT")
