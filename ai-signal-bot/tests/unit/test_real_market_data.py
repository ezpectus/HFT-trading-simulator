"""Tests for RealMarketDataFeed — data normalization, callbacks, reconnection config."""
import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.data_collection.real_market_data import (
    NormalizedCandle,
    NormalizedOrderBook,
    NormalizedTicker,
    RealMarketDataFeed,
)


class TestNormalizedTicker:
    def test_dataclass(self):
        t = NormalizedTicker(
            exchange="binance", symbol="BTCUSDT", bid=50000, ask=50001,
            last=50000.5, volume=1000.5, timestamp=1700000000000,
        )
        assert t.exchange == "binance"
        assert t.symbol == "BTCUSDT"
        assert t.bid == 50000
        assert t.ask == 50001
        assert t.last == 50000.5
        assert t.volume == 1000.5
        assert t.timestamp == 1700000000000


class TestNormalizedCandle:
    def test_dataclass(self):
        c = NormalizedCandle(
            exchange="okx", symbol="BTC-USDT-SWAP", interval="1m",
            open=50000, high=50100, low=49900, close=50050,
            volume=250.5, time=1700000000000,
        )
        assert c.exchange == "okx"
        assert c.symbol == "BTC-USDT-SWAP"
        assert c.interval == "1m"
        assert c.high == 50100
        assert c.low == 49900
        assert c.close == 50050
        assert c.volume == 250.5


class TestNormalizedOrderBook:
    def test_dataclass(self):
        ob = NormalizedOrderBook(
            exchange="bybit", symbol="BTCUSDT",
            bids=[(50000, 1.5), (49999, 2.0)],
            asks=[(50001, 1.0), (50002, 3.0)],
            timestamp=1700000000000,
        )
        assert ob.exchange == "bybit"
        assert ob.symbol == "BTCUSDT"
        assert len(ob.bids) == 2
        assert len(ob.asks) == 2
        assert ob.bids[0] == (50000, 1.5)
        assert ob.asks[0] == (50001, 1.0)

    def test_empty_book(self):
        ob = NormalizedOrderBook(
            exchange="binance", symbol="BTCUSDT",
            bids=[], asks=[], timestamp=0,
        )
        assert ob.bids == []
        assert ob.asks == []


class TestRealMarketDataFeedInit:
    def test_defaults(self):
        feed = RealMarketDataFeed()
        assert feed.exchanges == ["binance"]
        assert feed._running is False
        assert feed._reconnect_delay == 1.0
        assert feed._max_reconnect_delay == 30.0

    def test_custom_exchanges(self):
        feed = RealMarketDataFeed(exchanges=["binance", "okx", "bybit"])
        assert len(feed.exchanges) == 3
        assert "binance" in feed.exchanges
        assert "okx" in feed.exchanges
        assert "bybit" in feed.exchanges

    def test_callbacks_none_by_default(self):
        feed = RealMarketDataFeed()
        assert feed.on_ticker is None
        assert feed.on_candle is None
        assert feed.on_orderbook is None

    def test_set_callbacks(self):
        feed = RealMarketDataFeed()
        cb_ticker = AsyncMock()
        cb_candle = AsyncMock()
        cb_ob = AsyncMock()
        feed.on_ticker = cb_ticker
        feed.on_candle = cb_candle
        feed.on_orderbook = cb_ob
        assert feed.on_ticker is cb_ticker
        assert feed.on_candle is cb_candle
        assert feed.on_orderbook is cb_ob


class TestRealMarketDataFeedStop:
    @pytest.mark.asyncio
    async def test_stop_sets_running_false(self):
        feed = RealMarketDataFeed()
        feed._running = True
        await feed.stop()
        assert feed._running is False

    @pytest.mark.asyncio
    async def test_stop_no_connections(self):
        feed = RealMarketDataFeed()
        await feed.stop()  # Should not error with no connections


class TestBinanceMessageHandling:
    @pytest.mark.asyncio
    async def test_book_ticker_normalization(self):
        feed = RealMarketDataFeed(exchanges=["binance"])
        received = []
        feed.on_ticker = AsyncMock(side_effect=lambda t: received.append(t))

        msg = {
            "stream": "btcusdt@bookTicker",
            "data": {
                "s": "BTCUSDT",
                "b": "50000.10",
                "a": "50000.20",
                "T": 1700000000000,
            },
        }
        await feed._handle_binance_msg(msg)

        assert len(received) == 1
        ticker = received[0]
        assert ticker.exchange == "binance"
        assert ticker.symbol == "BTCUSDT"
        assert ticker.bid == pytest.approx(50000.10)
        assert ticker.ask == pytest.approx(50000.20)
        assert ticker.timestamp == 1700000000000

    @pytest.mark.asyncio
    async def test_kline_normalization(self):
        feed = RealMarketDataFeed(exchanges=["binance"])
        received = []
        feed.on_candle = AsyncMock(side_effect=lambda c: received.append(c))

        msg = {
            "stream": "btcusdt@kline_1m",
            "data": {
                "s": "BTCUSDT",
                "k": {
                    "o": "50000.0",
                    "h": "50100.0",
                    "l": "49900.0",
                    "c": "50050.0",
                    "v": "250.5",
                    "t": 1700000000000,
                },
            },
        }
        await feed._handle_binance_msg(msg)

        assert len(received) == 1
        candle = received[0]
        assert candle.exchange == "binance"
        assert candle.symbol == "BTCUSDT"
        assert candle.interval == "1m"
        assert candle.open == 50000.0
        assert candle.high == 50100.0
        assert candle.low == 49900.0
        assert candle.close == 50050.0
        assert candle.volume == 250.5

    @pytest.mark.asyncio
    async def test_unknown_stream_ignored(self):
        feed = RealMarketDataFeed(exchanges=["binance"])
        feed.on_ticker = AsyncMock()
        feed.on_candle = AsyncMock()

        msg = {"stream": "unknown_stream", "data": {}}
        await feed._handle_binance_msg(msg)

        feed.on_ticker.assert_not_called()
        feed.on_candle.assert_not_called()


class TestOKXMessageHandling:
    @pytest.mark.asyncio
    async def test_ticker_normalization(self):
        feed = RealMarketDataFeed(exchanges=["okx"])
        received = []
        feed.on_ticker = AsyncMock(side_effect=lambda t: received.append(t))

        msg = {
            "arg": {"channel": "tickers", "instId": "BTC-USDT-SWAP"},
            "data": [{
                "instId": "BTC-USDT-SWAP",
                "bidPx": "50000.5",
                "askPx": "50001.0",
                "last": "50000.8",
                "vol24h": "1500.2",
                "ts": "1700000000000",
            }],
        }
        await feed._handle_okx_msg(msg)

        assert len(received) == 1
        ticker = received[0]
        assert ticker.exchange == "okx"
        assert ticker.symbol == "BTC-USDT-SWAP"
        assert ticker.bid == pytest.approx(50000.5)
        assert ticker.ask == pytest.approx(50001.0)
        assert ticker.last == pytest.approx(50000.8)
        assert ticker.volume == pytest.approx(1500.2)

    @pytest.mark.asyncio
    async def test_candle_normalization(self):
        feed = RealMarketDataFeed(exchanges=["okx"])
        received = []
        feed.on_candle = AsyncMock(side_effect=lambda c: received.append(c))

        msg = {
            "arg": {"channel": "candle1M", "instId": "BTC-USDT-SWAP"},
            "data": [["1700000000000", "50000", "50100", "49900", "50050", "250.5"]],
        }
        await feed._handle_okx_msg(msg)

        assert len(received) == 1
        candle = received[0]
        assert candle.exchange == "okx"
        assert candle.symbol == "BTC-USDT-SWAP"
        assert candle.interval == "1m"
        assert candle.open == 50000.0
        assert candle.high == 50100.0
        assert candle.close == 50050.0
        assert candle.volume == 250.5


class TestBybitMessageHandling:
    @pytest.mark.asyncio
    async def test_ticker_normalization(self):
        feed = RealMarketDataFeed(exchanges=["bybit"])
        received = []
        feed.on_ticker = AsyncMock(side_effect=lambda t: received.append(t))

        msg = {
            "topic": "tickers.BTCUSDT",
            "data": {
                "bid1Price": "50000.1",
                "ask1Price": "50000.2",
                "lastPrice": "50000.15",
                "volume24h": "1200.5",
                "ts": "1700000000000",
            },
        }
        await feed._handle_bybit_msg(msg)

        assert len(received) == 1
        ticker = received[0]
        assert ticker.exchange == "bybit"
        assert ticker.symbol == "BTCUSDT"
        assert ticker.bid == pytest.approx(50000.1)
        assert ticker.ask == pytest.approx(50000.2)

    @pytest.mark.asyncio
    async def test_orderbook_normalization(self):
        feed = RealMarketDataFeed(exchanges=["bybit"])
        received = []
        feed.on_orderbook = AsyncMock(side_effect=lambda ob: received.append(ob))

        msg = {
            "topic": "orderbook.50.BTCUSDT",
            "data": {
                "b": [["50000", "1.5"], ["49999", "2.0"]],
                "a": [["50001", "1.0"], ["50002", "3.0"]],
            },
            "ts": "1700000000000",
        }
        await feed._handle_bybit_msg(msg)

        assert len(received) == 1
        ob = received[0]
        assert ob.exchange == "bybit"
        assert ob.symbol == "BTCUSDT"
        assert len(ob.bids) == 2
        assert ob.bids[0] == (50000.0, 1.5)
        assert ob.asks[0] == (50001.0, 1.0)

    @pytest.mark.asyncio
    async def test_kline_normalization(self):
        feed = RealMarketDataFeed(exchanges=["bybit"])
        received = []
        feed.on_candle = AsyncMock(side_effect=lambda c: received.append(c))

        msg = {
            "topic": "kline.1m.BTCUSDT",
            "data": [{
                "open": "50000",
                "high": "50100",
                "low": "49900",
                "close": "50050",
                "volume": "250.5",
                "start": "1700000000000",
            }],
        }
        await feed._handle_bybit_msg(msg)

        assert len(received) == 1
        candle = received[0]
        assert candle.exchange == "bybit"
        assert candle.symbol == "BTCUSDT"
        assert candle.interval == "1m"
        assert candle.open == 50000.0
        assert candle.high == 50100.0
        assert candle.close == 50050.0


class TestOKXSymbolConversion:
    def test_usdt_to_swap(self):
        assert RealMarketDataFeed._to_okx_inst_id("BTCUSDT") == "BTC-USDT-SWAP"

    def test_eth_usdt(self):
        assert RealMarketDataFeed._to_okx_inst_id("ETHUSDT") == "ETH-USDT-SWAP"

    def test_non_usdt_passthrough(self):
        assert RealMarketDataFeed._to_okx_inst_id("BTC-USDT-SWAP") == "BTC-USDT-SWAP"
