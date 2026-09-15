"""Tests for RealMarketDataFeed venue runners (S322 — shared _run_feed loop).

The three venue runners are thin wrappers over one loop; these tests pin
what each wrapper feeds it (URL + subscribe payload) and the loop's shared
behavior (subscribe frame sent post-connect, messages enqueued, import
guard logs for every venue — previously silent on okx/bybit).
"""
import json

import pytest

from src.data_collection.market_data_feed import RealMarketDataFeed


class _FakeWs:
    """Fake websocket connection: records sent frames, yields preset messages,
    then stops the feed on exit."""

    def __init__(self, messages, feed):
        self._messages = messages
        self._feed = feed
        self.sent = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        self._feed._running = False  # prevent the outer reconnect loop
        return False

    async def send(self, payload):
        self.sent.append(payload)

    def __aiter__(self):
        async def gen():
            for m in self._messages:
                yield m
        return gen()


class TestSharedFeedLoop:
    @pytest.mark.asyncio
    async def test_binance_combined_stream_url(self):
        from unittest.mock import patch

        feed = RealMarketDataFeed(exchanges=["binance"])
        feed._running = True
        fake = _FakeWs([], feed)

        with patch("websockets.connect", return_value=fake) as connect:
            await feed._run_binance(["BTCUSDT"], ["1m"])

        url = connect.call_args[0][0]
        assert url.startswith("wss://fstream.binance.com/stream?streams=")
        assert "btcusdt@bookTicker" in url
        assert "btcusdt@kline_1m" in url
        # combined-stream URL carries the subs — no subscribe frame is sent
        assert fake.sent == []

    @pytest.mark.asyncio
    async def test_binance_testnet_url(self):
        from unittest.mock import patch

        feed = RealMarketDataFeed(exchanges=["binance"], testnet=True)
        feed._running = True
        with patch("websockets.connect", return_value=_FakeWs([], feed)) as connect:
            await feed._run_binance(["BTCUSDT"], ["1m"])
        assert connect.call_args[0][0].startswith("wss://stream.binancefuture.com/")

    @pytest.mark.asyncio
    async def test_okx_sends_subscribe_frame(self):
        from unittest.mock import patch

        feed = RealMarketDataFeed(exchanges=["okx"])
        feed._running = True
        fake = _FakeWs([], feed)

        with patch("websockets.connect", return_value=fake) as connect:
            await feed._run_okx(["BTC/USDT"], ["1m"])

        assert connect.call_args[0][0] == "wss://ws.okx.com:8443/ws/v5/public"
        assert len(fake.sent) == 1
        payload = json.loads(fake.sent[0])
        assert payload["op"] == "subscribe"
        channels = {a["channel"] for a in payload["args"]}
        assert channels == {"tickers", "candle1m"}
        assert payload["args"][0]["instId"] == "BTC-USDT-SWAP"

    @pytest.mark.asyncio
    async def test_bybit_sends_subscribe_frame(self):
        from unittest.mock import patch

        feed = RealMarketDataFeed(exchanges=["bybit"])
        feed._running = True
        fake = _FakeWs([], feed)

        with patch("websockets.connect", return_value=fake) as connect:
            await feed._run_bybit(["BTCUSDT"], ["5m"])

        assert connect.call_args[0][0] == "wss://stream.bybit.com/v5/public/linear"
        payload = json.loads(fake.sent[0])
        assert payload["op"] == "subscribe"
        assert "orderbook.50.BTCUSDT" in payload["args"]
        assert "kline.5m.BTCUSDT" in payload["args"]

    @pytest.mark.asyncio
    async def test_import_guard_logs_for_every_venue(self):
        import builtins
        from unittest.mock import patch

        real_import = builtins.__import__

        def no_websockets(name, *args, **kwargs):
            if name == "websockets":
                raise ImportError("blocked")
            return real_import(name, *args, **kwargs)

        feed = RealMarketDataFeed(exchanges=["okx"])
        feed._running = True
        with patch("builtins.__import__", side_effect=no_websockets), \
                patch("src.data_collection.market_data_feed.logger") as mock_log:
            await feed._run_okx(["BTC/USDT"], ["1m"])
        mock_log.error.assert_called_once()
        assert "okx" in mock_log.error.call_args[0][-1]

    @pytest.mark.asyncio
    async def test_messages_reach_queue_with_venue_tag(self):
        from unittest.mock import patch

        feed = RealMarketDataFeed(exchanges=["bybit"])
        feed._running = True
        raw = json.dumps({"topic": "tickers.BTCUSDT", "data": {}})
        fake = _FakeWs([raw], feed)

        with patch("websockets.connect", return_value=fake):
            await feed._run_bybit(["BTCUSDT"], ["1m"])

        exch, msg = feed._msg_queue.get_nowait()
        assert exch == "bybit"
        assert msg["topic"] == "tickers.BTCUSDT"
