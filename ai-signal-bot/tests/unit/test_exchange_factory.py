"""Tests for ExchangeFactory — simulator/real/fallback modes, adapter lifecycle."""
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.data_collection.exchange_factory import (
    ExchangeFactory,
    ExchangeMode,
    RealExchangeAdapter,
    SimulatorAdapter,
)


class FakeWs:
    """Fake websocket connection — queue-fed async iterator + send spy."""

    def __init__(self):
        self.queue: asyncio.Queue = asyncio.Queue()
        self.sent: list[dict] = []
        self.closed = False

    def push(self, msg: dict) -> None:
        self.queue.put_nowait(json.dumps(msg))

    async def send(self, data) -> None:
        self.sent.append(json.loads(data))

    async def close(self) -> None:
        self.closed = True

    def __aiter__(self):
        return self

    async def __anext__(self):
        return await self.queue.get()


@pytest.fixture
def fake_ws():
    """Patch websockets.connect to return a queue-fed fake connection."""
    ws = FakeWs()

    async def fake_connect(*args, **kwargs):
        return ws

    with patch("websockets.connect", side_effect=fake_connect):
        yield ws


def _candles_msg(price=65000.0, exchange="binance", symbol="BTC/USDT"):
    return {
        "type": "candles",
        "seq": 1,
        "prices": {exchange: {symbol: price}},
        "candles": [
            {"timestamp": 1000, "open": price - 10, "high": price + 10,
             "low": price - 20, "close": price, "volume": 5.0,
             "symbol": symbol, "exchange": exchange},
        ],
        "orderbooks": {
            f"{exchange}|{symbol}": {
                "exchange": exchange, "symbol": symbol,
                "bids": [[price - 1, 0.5]], "asks": [[price + 1, 0.4]],
            },
        },
        "accounts": {
            exchange: {"exchange": exchange, "balance": 100000.0,
                       "equity": 101000.0, "currency": "USDT",
                       "positions": [{"symbol": symbol, "qty": 0.5}]},
        },
    }


async def _drain(ws: FakeWs, adapter: SimulatorAdapter):
    """Push a broadcast and let the recv loop consume it."""
    ws.push(_candles_msg())
    for _ in range(20):
        await asyncio.sleep(0.01)
        if adapter._prices:
            return


async def _next_sent(ws: FakeWs, timeout: float = 2.0) -> dict:
    """Wait for the adapter's next wire request."""
    for _ in range(int(timeout / 0.01)):
        if ws.sent:
            return ws.sent[-1]
        await asyncio.sleep(0.01)
    raise AssertionError("no wire request sent")


class TestExchangeMode:
    def test_values(self):
        assert ExchangeMode.SIMULATOR.value == "simulator"
        assert ExchangeMode.REAL.value == "real"
        assert ExchangeMode.FALLBACK.value == "fallback"


class TestSimulatorAdapter:
    """SimulatorAdapter is a WS client to the exchange simulator — these
    tests drive it with a fake connection fed by canned broadcasts."""

    @pytest.mark.asyncio
    async def test_initialize(self, fake_ws):
        adapter = SimulatorAdapter("ws://localhost:8765")
        await adapter.initialize()
        assert adapter._connected is True
        await adapter.close()

    @pytest.mark.asyncio
    async def test_close(self, fake_ws):
        adapter = SimulatorAdapter()
        await adapter.initialize()
        await adapter.close()
        assert adapter._connected is False
        assert fake_ws.closed is True

    @pytest.mark.asyncio
    async def test_get_ticker(self, fake_ws):
        adapter = SimulatorAdapter()
        await adapter.initialize()
        await _drain(fake_ws, adapter)
        ticker = await adapter.get_ticker("BTC/USDT")
        assert ticker["symbol"] == "BTC/USDT"
        assert ticker["price"] == 65000.0
        assert ticker["bid"] == 65000.0 - 0.5
        assert ticker["ask"] == 65000.0 + 0.5
        await adapter.close()

    @pytest.mark.asyncio
    async def test_get_ticker_no_feed_yet(self, fake_ws):
        adapter = SimulatorAdapter()
        await adapter.initialize()
        ticker = await adapter.get_ticker("BTC/USDT")
        assert ticker == {"symbol": "BTC/USDT"}  # honest empty, not a 50000 fake
        await adapter.close()

    @pytest.mark.asyncio
    async def test_get_orderbook(self, fake_ws):
        adapter = SimulatorAdapter()
        await adapter.initialize()
        await _drain(fake_ws, adapter)
        ob = await adapter.get_orderbook("BTC/USDT", depth=10)
        assert ob["symbol"] == "BTC/USDT"
        assert ob["bids"] == [[64999.0, 0.5]]
        assert ob["asks"] == [[65001.0, 0.4]]
        await adapter.close()

    @pytest.mark.asyncio
    async def test_get_candles(self, fake_ws):
        adapter = SimulatorAdapter()
        await adapter.initialize()
        await _drain(fake_ws, adapter)
        candles = await adapter.get_candles("BTC/USDT", "1m", 100)
        assert len(candles) == 1
        assert candles[0]["close"] == 65000.0
        await adapter.close()

    @pytest.mark.asyncio
    async def test_place_order_fill(self, fake_ws):
        adapter = SimulatorAdapter()
        await adapter.initialize()
        await _drain(fake_ws, adapter)  # sets _default_exchange
        task = asyncio.create_task(adapter.place_order("BTC/USDT", "BUY", 0.5))
        req = await _next_sent(fake_ws)
        fake_ws.push({"type": "fill", "order": {
            "id": "ord_1", "client_order_id": req["client_order_id"],
            "symbol": "BTC/USDT", "side": "BUY",
            "status": "FILLED", "filled_price": 65001.0, "filled_quantity": 0.5,
            "fee": 0.01,
        }})
        order = await task
        assert order["id"] == "ord_1"
        assert order["status"] == "FILLED"
        # verify the wire request
        assert req["type"] == "order"
        assert req["side"] == "BUY"
        assert req["quantity"] == 0.5
        await adapter.close()

    @pytest.mark.asyncio
    async def test_foreign_fill_does_not_resolve_pending_order(self, fake_ws):
        """S229 regression: the sim broadcasts every fill to all *other*
        clients — a stranger's fill must not resolve our pending order."""
        adapter = SimulatorAdapter()
        await adapter.initialize()
        await _drain(fake_ws, adapter)
        task = asyncio.create_task(adapter.place_order("BTC/USDT", "BUY", 0.5))
        req = await _next_sent(fake_ws)
        # Another bot's fill broadcast to us — different client_order_id.
        fake_ws.push({"type": "fill", "order": {
            "id": "ord_X", "client_order_id": "other-bot-1",
            "symbol": "ETH/USDT", "side": "SELL",
            "status": "FILLED", "filled_price": 3000.0,
            "filled_quantity": 9.0, "fee": 0.5,
        }})
        await asyncio.sleep(0.05)  # let the recv loop consume the broadcast
        assert not task.done()
        fake_ws.push({"type": "fill", "order": {
            "id": "ord_1", "client_order_id": req["client_order_id"],
            "symbol": "BTC/USDT", "side": "BUY",
            "status": "FILLED", "filled_price": 65001.0,
            "filled_quantity": 0.5, "fee": 0.01,
        }})
        order = await task
        assert order["id"] == "ord_1"
        assert order["symbol"] == "BTC/USDT"
        await adapter.close()

    @pytest.mark.asyncio
    async def test_place_order_rejected(self, fake_ws):
        adapter = SimulatorAdapter()
        await adapter.initialize()
        fake_ws.push({"type": "error", "message": "Insufficient margin"})
        order = await adapter.place_order("BTC/USDT", "BUY", 0.5)
        assert order is None
        await adapter.close()

    @pytest.mark.asyncio
    async def test_place_order_disconnected(self, fake_ws):
        adapter = SimulatorAdapter()
        # no initialize — no connection
        order = await adapter.place_order("BTC/USDT", "BUY", 0.5)
        assert order is None

    @pytest.mark.asyncio
    async def test_cancel_order_disconnected(self, fake_ws):
        adapter = SimulatorAdapter()
        # No connection — must not fake success
        assert await adapter.cancel_order("ord_1", "BTC/USDT") is False

    @pytest.mark.asyncio
    async def test_cancel_order_round_trip(self, fake_ws):
        """cancel_order sends the protocol message and resolves on the
        order_cancelled reply matched by order id."""
        adapter = SimulatorAdapter()
        await adapter.initialize()
        await _drain(fake_ws, adapter)  # sets _default_exchange
        task = asyncio.create_task(adapter.cancel_order("ord_9", "BTC/USDT"))
        sent = await _next_sent(fake_ws)
        # Real wire: {"type": "order_cancelled", "order": order.to_dict()}
        fake_ws.push({"type": "order_cancelled",
                      "order": {"id": "ord_9", "symbol": "BTC/USDT",
                                "status": "CANCELLED"}})
        assert await task is True
        assert sent["type"] == "cancel_order"
        assert sent["order_id"] == "ord_9"
        assert sent["exchange"] == "binance"
        await adapter.close()

    @pytest.mark.asyncio
    async def test_place_order_sends_client_order_id(self, fake_ws):
        adapter = SimulatorAdapter()
        await adapter.initialize()
        await _drain(fake_ws, adapter)
        task = asyncio.create_task(adapter.place_order(
            "BTC/USDT", "BUY", 0.1, client_order_id="sig_42"))
        req = await _next_sent(fake_ws)
        fake_ws.push({"type": "fill", "order": {
            "id": "ord_2", "client_order_id": "sig_42",
            "symbol": "BTC/USDT", "side": "BUY",
            "status": "FILLED", "filled_price": 65000.0,
            "filled_quantity": 0.1, "fee": 0.0,
        }})
        await task
        assert req["client_order_id"] == "sig_42"
        await adapter.close()

    @pytest.mark.asyncio
    async def test_get_balance(self, fake_ws):
        adapter = SimulatorAdapter()
        await adapter.initialize()
        await _drain(fake_ws, adapter)
        balance = await adapter.get_balance()
        assert balance == [{"asset": "USDT", "free": 100000.0,
                            "used": 0.0, "total": 101000.0}]
        await adapter.close()

    @pytest.mark.asyncio
    async def test_get_positions(self, fake_ws):
        adapter = SimulatorAdapter()
        await adapter.initialize()
        await _drain(fake_ws, adapter)
        positions = await adapter.get_positions()
        assert positions == [{"symbol": "BTC/USDT", "qty": 0.5}]
        await adapter.close()

    @pytest.mark.asyncio
    async def test_get_health(self, fake_ws):
        adapter = SimulatorAdapter()
        await adapter.initialize()
        health = await adapter.get_health()
        assert health["connected"] is True
        assert health["exchange"] == "simulator"
        await adapter.close()
        health = await adapter.get_health()
        assert health["connected"] is False


class TestRealExchangeAdapter:
    @pytest.mark.asyncio
    async def test_not_initialized_returns_empty(self):
        adapter = RealExchangeAdapter(exchange="binance")
        ticker = await adapter.get_ticker("BTC/USDT")
        assert ticker == {}

    @pytest.mark.asyncio
    async def test_not_initialized_orderbook(self):
        adapter = RealExchangeAdapter()
        ob = await adapter.get_orderbook("BTC/USDT")
        assert ob == {}

    @pytest.mark.asyncio
    async def test_not_initialized_candles(self):
        adapter = RealExchangeAdapter()
        candles = await adapter.get_candles("BTC/USDT")
        assert candles == []

    @pytest.mark.asyncio
    async def test_not_initialized_place_order(self):
        adapter = RealExchangeAdapter()
        order = await adapter.place_order("BTC/USDT", "BUY", 0.5)
        assert order is None

    @pytest.mark.asyncio
    async def test_not_initialized_cancel(self):
        adapter = RealExchangeAdapter()
        result = await adapter.cancel_order("1", "BTC/USDT")
        assert result is False

    @pytest.mark.asyncio
    async def test_not_initialized_balance(self):
        adapter = RealExchangeAdapter()
        balances = await adapter.get_balance()
        assert balances == []

    @pytest.mark.asyncio
    async def test_not_initialized_positions(self):
        adapter = RealExchangeAdapter()
        positions = await adapter.get_positions()
        assert positions == []

    @pytest.mark.asyncio
    async def test_not_initialized_health(self):
        adapter = RealExchangeAdapter()
        health = await adapter.get_health()
        assert health["connected"] is False

    @pytest.mark.asyncio
    async def test_name_attribute(self):
        adapter = RealExchangeAdapter(exchange="okx")
        assert adapter.name == "okx"

    @pytest.mark.asyncio
    async def test_rest_timeout_plumbs_to_account_manager(self):
        """Regression S117: network.rest_timeout must reach ccxt via the adapter chain."""
        adapter = RealExchangeAdapter(exchange="binance", rest_timeout=7.5)
        assert adapter._rest_timeout == 7.5

        captured = {}

        class _FakeAccount:
            def __init__(self, **kwargs):
                captured.update(kwargs)

            async def initialize(self):
                pass

        class _FakeMD:
            def __init__(self, **kwargs):
                pass

            async def initialize(self):
                pass

        with patch("src.data_collection.real_account.RealAccountManager", _FakeAccount), \
             patch("src.data_collection.real_market_data.RealMarketDataManager", _FakeMD):
            await adapter.initialize()

        assert captured["rest_timeout"] == 7.5


class TestExchangeFactorySimulator:
    @pytest.mark.asyncio
    async def test_create_simulator(self, fake_ws):
        factory = ExchangeFactory(mode=ExchangeMode.SIMULATOR)
        adapter = await factory.create()
        assert isinstance(adapter, SimulatorAdapter)
        assert adapter._connected is True
        await factory.close()

    @pytest.mark.asyncio
    async def test_simulator_health(self, fake_ws):
        factory = ExchangeFactory(mode=ExchangeMode.SIMULATOR)
        adapter = await factory.create()
        health = await adapter.get_health()
        assert health["connected"] is True
        await factory.close()


class TestExchangeFactoryFallback:
    @pytest.mark.asyncio
    async def test_fallback_to_simulator_on_failure(self, fake_ws):
        factory = ExchangeFactory(mode=ExchangeMode.FALLBACK, exchange="binance")
        # RealExchangeAdapter.initialize will fail because no real API keys
        adapter = await factory.create()
        # Should fall back to simulator
        assert isinstance(adapter, SimulatorAdapter)
        await factory.close()

    @pytest.mark.asyncio
    async def test_switch_to_simulator(self, fake_ws):
        factory = ExchangeFactory(mode=ExchangeMode.REAL)
        # Manually set adapter and switch
        factory._adapter = SimulatorAdapter()
        await factory._adapter.initialize()
        result = await factory.switch_to_simulator()
        assert isinstance(result, SimulatorAdapter)
        await factory.close()


class TestExchangeFactoryClose:
    @pytest.mark.asyncio
    async def test_close_no_adapter(self):
        factory = ExchangeFactory()
        await factory.close()  # Should not error

    @pytest.mark.asyncio
    async def test_close_with_adapter(self, fake_ws):
        factory = ExchangeFactory(mode=ExchangeMode.SIMULATOR)
        await factory.create()
        await factory.close()  # Should close adapter

    @pytest.mark.asyncio
    async def test_close_with_simulator_fallback(self, fake_ws):
        factory = ExchangeFactory(mode=ExchangeMode.SIMULATOR)
        await factory.create()
        await factory.get_or_create_simulator()
        await factory.close()  # Should close both
