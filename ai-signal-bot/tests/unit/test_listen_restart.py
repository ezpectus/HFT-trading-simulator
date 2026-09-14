"""Regression tests for S291: a crashed market-data listener must restart —
before the fix, any non-IO exception killed _listen_loop permanently while
health stayed green and the bot traded on frozen candles forever."""
import asyncio
import logging
from types import SimpleNamespace

import pytest

from run import AISignalBot
from src.communication.ws_client import ExchangeClient


def _bot(**over):
    bot = SimpleNamespace(
        logger=logging.getLogger("t"),
        _background_tasks=set(),
        _running=True,
        _listen_task=None,
        _listen_loop=lambda: asyncio.sleep(60),
    )
    bot._on_task_done = lambda t: AISignalBot._on_task_done(bot, t)
    for k, v in over.items():
        setattr(bot, k, v)
    return bot


class TestListenRestart:
    @pytest.mark.asyncio
    async def test_listen_task_restarts_on_crash(self):
        bot = _bot()

        async def boom():
            raise KeyError("symbol")

        crashed = asyncio.create_task(boom())
        crashed.add_done_callback(lambda t: AISignalBot._on_task_done(bot, t))
        bot._listen_task = crashed
        await asyncio.sleep(0.05)  # let it crash + callback fire

        assert bot._listen_task is not crashed
        assert bot._listen_task in bot._background_tasks
        bot._listen_task.cancel()

    @pytest.mark.asyncio
    async def test_no_restart_when_stopping(self):
        bot = _bot(_running=False)

        async def boom():
            raise RuntimeError("x")

        crashed = asyncio.create_task(boom())
        crashed.add_done_callback(lambda t: AISignalBot._on_task_done(bot, t))
        bot._listen_task = crashed
        await asyncio.sleep(0.05)

        assert bot._listen_task is crashed
        assert len(bot._background_tasks) == 0

    @pytest.mark.asyncio
    async def test_cancelled_task_not_restarted(self):
        bot = _bot()
        t = asyncio.create_task(asyncio.sleep(60))
        t.add_done_callback(lambda x: AISignalBot._on_task_done(bot, x))
        bot._listen_task = t
        t.cancel()
        await asyncio.sleep(0.05)

        assert bot._listen_task is t

    @pytest.mark.asyncio
    async def test_unrelated_task_crash_does_not_touch_listener(self):
        bot = _bot()
        keep = asyncio.create_task(asyncio.sleep(60))
        bot._listen_task = keep

        async def boom():
            raise ValueError("x")

        crashed = asyncio.create_task(boom())
        crashed.add_done_callback(lambda t: AISignalBot._on_task_done(bot, t))
        await asyncio.sleep(0.05)

        assert bot._listen_task is keep
        keep.cancel()


class TestWsClientResilience:
    def test_candle_without_symbol_is_dropped(self):
        c = ExchangeClient("ws://x")
        c._process_message({
            "type": "candles",
            "candles": [{"symbol": "BTC/USDT", "close": 1}, {"close": 2}],
            "prices": {},
            "accounts": {},
        })
        assert "BTC/USDT" in c._latest_candles
        assert len(c._candle_history["BTC/USDT"]) == 1
