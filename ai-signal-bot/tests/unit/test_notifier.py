"""Tests for notification/notifier.py — AlertEvent, TelegramNotifier, DiscordNotifier, NotifierManager."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.notification.notifier import (
    AlertEvent,
    DiscordNotifier,
    NotifierManager,
    TelegramNotifier,
    create_notifier_from_env,
)


class TestAlertEvent:
    def test_defaults(self):
        event = AlertEvent(type="fill", symbol="BTC/USDT", message="Test fill")
        assert event.type == "fill"
        assert event.symbol == "BTC/USDT"
        assert event.message == "Test fill"
        assert event.timestamp > 0
        assert event.data == {}

    def test_custom_timestamp(self):
        event = AlertEvent(type="error", symbol="", message="err", timestamp=12345.0)
        assert event.timestamp == 12345.0

    def test_custom_data(self):
        event = AlertEvent(type="fill", symbol="ETH/USDT", message="fill", data={"price": 3000})
        assert event.data["price"] == 3000


class TestTelegramNotifier:
    def test_init(self):
        n = TelegramNotifier(token="tok", chat_id="123")
        assert n.token == "tok"
        assert n.chat_id == "123"
        assert n._running is False
        assert n._session is None

    def test_register_command(self):
        n = TelegramNotifier(token="tok", chat_id="123")
        handler = MagicMock()
        n.register_command("status", handler)
        assert "status" in n._command_handlers

    @pytest.mark.asyncio
    async def test_send_alert_no_session(self):
        n = TelegramNotifier(token="tok", chat_id="123")
        await n.send_alert(AlertEvent(type="fill", symbol="BTC/USDT", message="test"))

    @pytest.mark.asyncio
    async def test_stop_without_start(self):
        n = TelegramNotifier(token="tok", chat_id="123")
        await n.stop()
        assert n._running is False

    @pytest.mark.asyncio
    async def test_stop_cancels_poll_task(self):
        n = TelegramNotifier(token="tok", chat_id="123")
        n._poll_task = asyncio.create_task(asyncio.sleep(100))
        await n.stop()
        assert n._poll_task.cancelled() or n._poll_task.done()


class TestDiscordNotifier:
    def test_init(self):
        n = DiscordNotifier(token="tok", channel_id="456")
        assert n.token == "tok"
        assert n.channel_id == "456"
        assert n._running is False

    def test_register_command(self):
        n = DiscordNotifier(token="tok", channel_id="456")
        handler = MagicMock()
        n.register_command("positions", handler)
        assert "positions" in n._command_handlers

    @pytest.mark.asyncio
    async def test_send_alert_no_session(self):
        n = DiscordNotifier(token="tok", channel_id="456")
        await n.send_alert(AlertEvent(type="error", symbol="", message="err"))

    @pytest.mark.asyncio
    async def test_stop_without_start(self):
        n = DiscordNotifier(token="tok", channel_id="456")
        await n.stop()
        assert n._running is False


class TestNotifierManager:
    def test_empty(self):
        mgr = NotifierManager()
        assert mgr.active is False
        assert len(mgr._notifiers) == 0

    def test_setup_telegram(self):
        mgr = NotifierManager()
        mgr.setup_telegram("tok", "123")
        assert mgr.active is True
        assert len(mgr._notifiers) == 1
        assert isinstance(mgr._notifiers[0], TelegramNotifier)

    def test_setup_telegram_empty(self):
        mgr = NotifierManager()
        mgr.setup_telegram("", "")
        assert mgr.active is False

    def test_setup_discord(self):
        mgr = NotifierManager()
        mgr.setup_discord("tok", "456")
        assert mgr.active is True
        assert isinstance(mgr._notifiers[0], DiscordNotifier)

    def test_setup_both(self):
        mgr = NotifierManager()
        mgr.setup_telegram("tok", "123")
        mgr.setup_discord("tok", "456")
        assert len(mgr._notifiers) == 2

    def test_register_command_propagates(self):
        mgr = NotifierManager()
        mgr.setup_telegram("tok", "123")
        mgr.setup_discord("tok", "456")
        handler = MagicMock()
        mgr.register_command("status", handler)
        for n in mgr._notifiers:
            assert "status" in n._command_handlers

    @pytest.mark.asyncio
    async def test_send_alert_to_all(self):
        mgr = NotifierManager()
        tg = TelegramNotifier("tok", "123")
        dc = DiscordNotifier("tok", "456")
        tg.send_alert = AsyncMock()
        dc.send_alert = AsyncMock()
        mgr._notifiers = [tg, dc]
        event = AlertEvent(type="fill", symbol="BTC/USDT", message="test")
        await mgr.send_alert(event)
        tg.send_alert.assert_called_once_with(event)
        dc.send_alert.assert_called_once_with(event)

    @pytest.mark.asyncio
    async def test_stop_all(self):
        mgr = NotifierManager()
        tg = TelegramNotifier("tok", "123")
        dc = DiscordNotifier("tok", "456")
        tg.stop = AsyncMock()
        dc.stop = AsyncMock()
        mgr._notifiers = [tg, dc]
        await mgr.stop_all()
        tg.stop.assert_called_once()
        dc.stop.assert_called_once()


class TestCreateFromEnv:
    def test_no_env(self, monkeypatch):
        monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
        monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)
        monkeypatch.delenv("DISCORD_BOT_TOKEN", raising=False)
        monkeypatch.delenv("DISCORD_CHANNEL_ID", raising=False)
        mgr = create_notifier_from_env()
        assert mgr.active is False

    def test_telegram_env(self, monkeypatch):
        monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test_tok")
        monkeypatch.setenv("TELEGRAM_CHAT_ID", "test_chat")
        monkeypatch.delenv("DISCORD_BOT_TOKEN", raising=False)
        monkeypatch.delenv("DISCORD_CHANNEL_ID", raising=False)
        mgr = create_notifier_from_env()
        assert mgr.active is True
        assert len(mgr._notifiers) == 1

    def test_both_env(self, monkeypatch):
        monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "tg_tok")
        monkeypatch.setenv("TELEGRAM_CHAT_ID", "tg_chat")
        monkeypatch.setenv("DISCORD_BOT_TOKEN", "dc_tok")
        monkeypatch.setenv("DISCORD_CHANNEL_ID", "dc_chan")
        mgr = create_notifier_from_env()
        assert len(mgr._notifiers) == 2
