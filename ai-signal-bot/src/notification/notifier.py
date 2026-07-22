"""
Telegram/Discord bot for remote control and alerts.

Provides:
- Real-time trade alerts (fills, SL/TP hits)
- Position updates
- Daily P&L summary
- Remote commands: /status, /positions, /close_all, /pause, /resume

Usage:
  python run_notifier.py --telegram --token YOUR_BOT_TOKEN --chat-id YOUR_CHAT_ID
  python run_notifier.py --discord --token YOUR_BOT_TOKEN --channel-id YOUR_CHANNEL_ID

Or via environment variables:
  TELEGRAM_BOT_TOKEN=xxx
  TELEGRAM_CHAT_ID=xxx
  DISCORD_BOT_TOKEN=xxx
  DISCORD_CHANNEL_ID=xxx
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class AlertEvent:
    """Normalized alert event."""
    type: str  # fill, sl_tp, position_open, position_close, daily_pnl, error
    symbol: str
    message: str
    timestamp: float = 0.0
    data: dict | None = None

    def __post_init__(self):
        if self.timestamp == 0.0:
            self.timestamp = time.time()
        if self.data is None:
            self.data = {}


class TelegramNotifier:
    """Telegram bot for alerts and remote control."""

    def __init__(self, token: str, chat_id: str):
        self.token = token
        self.chat_id = chat_id
        self._running = False
        self._session = None
        self._command_handlers: dict[str, Callable] = {}

    def register_command(self, command: str, handler: Callable[[str], Awaitable[str]]):
        self._command_handlers[command] = handler

    async def start(self):
        try:
            import aiohttp
        except ImportError:
            logger.error("aiohttp not installed for Telegram notifier")
            return

        self._running = True
        self._session = aiohttp.ClientSession()
        logger.info("[TelegramNotifier] Started")

        # Start polling for updates (getUpdates)
        asyncio.create_task(self._poll_updates())

    async def stop(self):
        self._running = False
        if self._session:
            await self._session.close()

    async def send_alert(self, event: AlertEvent):
        if not self._session:
            return

        emoji_map = {
            "fill": "✅",
            "sl_tp": "🎯",
            "position_open": "📈",
            "position_close": "📊",
            "daily_pnl": "💰",
            "error": "🚨",
        }
        emoji = emoji_map.get(event.type, "📢")
        text = f"{emoji} *{event.type.upper()}*\n{event.message}"

        url = f"https://api.telegram.org/bot{self.token}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": "Markdown",
        }

        try:
            async with self._session.post(url, json=payload) as resp:
                if resp.status != 200:
                    logger.warning(f"Telegram send failed: {resp.status}")
        except Exception as e:
            logger.error(f"Telegram send error: {e}")

    async def _poll_updates(self):
        offset = 0
        while self._running:
            try:
                url = f"https://api.telegram.org/bot{self.token}/getUpdates"
                params = {"offset": offset, "timeout": 30}

                async with self._session.get(url, params=params) as resp:
                    if resp.status != 200:
                        await asyncio.sleep(5)
                        continue
                    data = await resp.json()
                    updates = data.get("result", [])

                    for update in updates:
                        offset = update["update_id"] + 1
                        msg = update.get("message", {})
                        text = msg.get("text", "")
                        chat_id = str(msg.get("chat", {}).get("id", ""))

                        if chat_id != self.chat_id:
                            continue

                        if text.startswith("/"):
                            await self._handle_command(text)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Telegram poll error: {e}")
                await asyncio.sleep(5)

    async def _handle_command(self, text: str):
        parts = text.strip().split(maxsplit=1)
        cmd = parts[0].lstrip("/")
        args = parts[1] if len(parts) > 1 else ""

        handler = self._command_handlers.get(cmd)
        if handler:
            try:
                response = await handler(args)
            except Exception as e:
                response = f"Error: {e}"
        else:
            response = f"Unknown command: /{cmd}\nAvailable: {', '.join(self._command_handlers.keys())}"

        await self.send_alert(AlertEvent(type="status", symbol="", message=response))


class DiscordNotifier:
    """Discord bot for alerts and remote control."""

    def __init__(self, token: str, channel_id: str):
        self.token = token
        self.channel_id = channel_id
        self._running = False
        self._ws = None
        self._session = None
        self._command_handlers: dict[str, Callable] = {}

    def register_command(self, command: str, handler: Callable[[str], Awaitable[str]]):
        self._command_handlers[command] = handler

    async def start(self):
        try:
            import aiohttp
        except ImportError:
            logger.error("aiohttp not installed for Discord notifier")
            return

        self._running = True
        self._session = aiohttp.ClientSession()
        logger.info("[DiscordNotifier] Started")

        asyncio.create_task(self._poll_messages())

    async def stop(self):
        self._running = False
        if self._ws:
            await self._ws.close()
        if self._session:
            await self._session.close()

    async def send_alert(self, event: AlertEvent):
        if not self._session:
            return

        emoji_map = {
            "fill": "✅",
            "sl_tp": "🎯",
            "position_open": "📈",
            "position_close": "📊",
            "daily_pnl": "💰",
            "error": "🚨",
        }
        emoji = emoji_map.get(event.type, "📢")
        text = f"{emoji} **{event.type.upper()}**\n{event.message}"

        url = f"https://discord.com/api/v10/channels/{self.channel_id}/messages"
        headers = {"Authorization": f"Bot {self.token}"}
        payload = {"content": text}

        try:
            async with self._session.post(url, json=payload, headers=headers) as resp:
                if resp.status not in (200, 201):
                    logger.warning(f"Discord send failed: {resp.status}")
        except Exception as e:
            logger.error(f"Discord send error: {e}")

    async def _poll_messages(self):
        last_message_id = None

        while self._running:
            try:
                url = f"https://discord.com/api/v10/channels/{self.channel_id}/messages"
                headers = {"Authorization": f"Bot {self.token}"}
                params = {"limit": 10}
                if last_message_id:
                    params["after"] = last_message_id

                async with self._session.get(url, headers=headers, params=params) as resp:
                    if resp.status != 200:
                        await asyncio.sleep(5)
                        continue
                    messages = await resp.json()
                    messages.reverse()

                    for msg in messages:
                        last_message_id = msg["id"]
                        content = msg.get("content", "")

                        if content.startswith("/"):
                            await self._handle_command(content)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Discord poll error: {e}")
                await asyncio.sleep(5)

    async def _handle_command(self, text: str):
        parts = text.strip().split(maxsplit=1)
        cmd = parts[0].lstrip("/")
        args = parts[1] if len(parts) > 1 else ""

        handler = self._command_handlers.get(cmd)
        if handler:
            try:
                response = await handler(args)
            except Exception as e:
                response = f"Error: {e}"
        else:
            response = f"Unknown command: /{cmd}\nAvailable: {', '.join(self._command_handlers.keys())}"

        await self.send_alert(AlertEvent(type="status", symbol="", message=response))


class NotifierManager:
    """Manages multiple notifiers (Telegram + Discord)."""

    def __init__(self):
        self._notifiers: list = []

    def setup_telegram(self, token: str, chat_id: str):
        if token and chat_id:
            self._notifiers.append(TelegramNotifier(token, chat_id))

    def setup_discord(self, token: str, channel_id: str):
        if token and channel_id:
            self._notifiers.append(DiscordNotifier(token, channel_id))

    def register_command(self, command: str, handler: Callable[[str], Awaitable[str]]):
        for n in self._notifiers:
            n.register_command(command, handler)

    async def start_all(self):
        for n in self._notifiers:
            await n.start()

    async def stop_all(self):
        for n in self._notifiers:
            await n.stop()

    async def send_alert(self, event: AlertEvent):
        for n in self._notifiers:
            await n.send_alert(event)

    @property
    def active(self) -> bool:
        return len(self._notifiers) > 0


def create_notifier_from_env() -> NotifierManager:
    """Create notifier manager from environment variables."""
    mgr = NotifierManager()

    tg_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    tg_chat = os.environ.get("TELEGRAM_CHAT_ID", "")
    if tg_token and tg_chat:
        mgr.setup_telegram(tg_token, tg_chat)
        logger.info("Telegram notifier configured")

    dc_token = os.environ.get("DISCORD_BOT_TOKEN", "")
    dc_channel = os.environ.get("DISCORD_CHANNEL_ID", "")
    if dc_token and dc_channel:
        mgr.setup_discord(dc_token, dc_channel)
        logger.info("Discord notifier configured")

    return mgr
