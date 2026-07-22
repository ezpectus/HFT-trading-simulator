"""Alert system — multi-channel alerting with rate limiting and severity levels.

Channels: log, webhook (Discord/Telegram), email.
Rules: daily loss, no fills, SHM disconnected, DB down.
Rate limiting: max 1 alert per rule per 5 minutes.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import Enum

import aiohttp

logger = logging.getLogger(__name__)


class AlertSeverity(Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


@dataclass
class AlertRule:
    name: str
    description: str
    severity: AlertSeverity
    check_fn: Callable[[], bool]          # Returns True if alert should fire
    cooldown_seconds: float = 300.0       # 5 minutes default
    enabled: bool = True


@dataclass
class Alert:
    rule_name: str
    severity: AlertSeverity
    message: str
    timestamp: float = field(default_factory=time.time)
    details: dict = field(default_factory=dict)


class AlertSystem:
    """Multi-channel alert system with rate limiting."""

    def __init__(self, webhook_url: str | None = None,
                 discord_webhook: str | None = None,
                 telegram_token: str | None = None,
                 telegram_chat_id: str | None = None,
                 email_smtp: str | None = None):
        self.webhook_url = webhook_url
        self.discord_webhook = discord_webhook
        self.telegram_token = telegram_token
        self.telegram_chat_id = telegram_chat_id
        self.email_smtp = email_smtp

        self.rules: dict[str, AlertRule] = {}
        self.last_fired: dict[str, float] = {}
        self.alert_history: list[Alert] = []
        self._max_history = 1000
        self._running = False
        self._check_task: asyncio.Task | None = None

    def add_rule(self, rule: AlertRule) -> None:
        """Add an alert rule."""
        self.rules[rule.name] = rule
        logger.info(f"[AlertSystem] Added rule: {rule.name} ({rule.severity.value})")

    def remove_rule(self, name: str) -> None:
        """Remove an alert rule."""
        self.rules.pop(name, None)

    def enable_rule(self, name: str) -> None:
        if name in self.rules:
            self.rules[name].enabled = True

    def disable_rule(self, name: str) -> None:
        if name in self.rules:
            self.rules[name].enabled = False

    async def check_rules(self) -> list[Alert]:
        """Check all rules and fire alerts if needed."""
        alerts = []
        now = time.time()

        for name, rule in self.rules.items():
            if not rule.enabled:
                continue

            # Check cooldown
            last = self.last_fired.get(name, 0)
            if now - last < rule.cooldown_seconds:
                continue

            try:
                should_fire = rule.check_fn()
                if should_fire:
                    alert = Alert(
                        rule_name=name,
                        severity=rule.severity,
                        message=rule.description,
                        timestamp=now,
                    )
                    alerts.append(alert)
                    self.last_fired[name] = now
                    self.alert_history.append(alert)

                    if len(self.alert_history) > self._max_history:
                        self.alert_history = self.alert_history[-self._max_history:]

                    await self._send_alert(alert)

            except Exception as e:
                logger.error(f"[AlertSystem] Error checking rule {name}: {e}")
                self.last_fired[name] = now

        return alerts

    async def _send_alert(self, alert: Alert) -> None:
        """Send alert to all configured channels."""
        # Always log
        log_msg = f"[ALERT:{alert.severity.value}] {alert.rule_name}: {alert.message}"
        if alert.severity == AlertSeverity.CRITICAL:
            logger.critical(log_msg)
        elif alert.severity == AlertSeverity.WARNING:
            logger.warning(log_msg)
        else:
            logger.info(log_msg)

        # Send to configured channels
        tasks = []
        if self.discord_webhook:
            tasks.append(self._send_discord(alert))
        if self.telegram_token and self.telegram_chat_id:
            tasks.append(self._send_telegram(alert))
        if self.webhook_url:
            tasks.append(self._send_webhook(alert))

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for r in results:
                if isinstance(r, Exception):
                    logger.error(f"[AlertSystem] Failed to send alert: {r}")

    async def _send_discord(self, alert: Alert) -> None:
        """Send alert to Discord webhook."""
        color = {
            AlertSeverity.INFO: 3447003,      # Blue
            AlertSeverity.WARNING: 16776960,  # Yellow
            AlertSeverity.CRITICAL: 15158332,  # Red
        }.get(alert.severity, 3447003)

        payload = {
            "embeds": [{
                "title": f"🚨 {alert.rule_name}",
                "description": alert.message,
                "color": color,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(alert.timestamp)),
                "footer": {"text": f"Severity: {alert.severity.value}"},
            }]
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(self.discord_webhook, json=payload) as resp:
                if resp.status not in (200, 204):
                    logger.error(f"[AlertSystem] Discord webhook failed: {resp.status}")

    async def _send_telegram(self, alert: Alert) -> None:
        """Send alert via Telegram bot."""
        emoji = {
            AlertSeverity.INFO: "ℹ️",
            AlertSeverity.WARNING: "⚠️",
            AlertSeverity.CRITICAL: "🚨",
        }.get(alert.severity, "ℹ️")

        text = f"{emoji} *{alert.rule_name}*\n{alert.message}\nSeverity: {alert.severity.value}"
        url = f"https://api.telegram.org/bot{self.telegram_token}/sendMessage"

        payload = {
            "chat_id": self.telegram_chat_id,
            "text": text,
            "parse_mode": "Markdown",
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                if resp.status != 200:
                    logger.error(f"[AlertSystem] Telegram send failed: {resp.status}")

    async def _send_webhook(self, alert: Alert) -> None:
        """Send alert to generic webhook."""
        payload = {
            "rule": alert.rule_name,
            "severity": alert.severity.value,
            "message": alert.message,
            "timestamp": alert.timestamp,
            "details": alert.details,
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(self.webhook_url, json=payload) as resp:
                if resp.status not in (200, 204):
                    logger.error(f"[AlertSystem] Webhook failed: {resp.status}")

    async def start_monitoring(self, check_interval: float = 30.0) -> None:
        """Start periodic rule checking."""
        self._running = True
        self._check_task = asyncio.create_task(self._monitor_loop(check_interval))

    async def _monitor_loop(self, interval: float) -> None:
        """Periodically check all alert rules."""
        while self._running:
            try:
                await self.check_rules()
            except Exception as e:
                logger.error(f"[AlertSystem] Monitor loop error: {e}")
            await asyncio.sleep(interval)

    async def stop_monitoring(self) -> None:
        """Stop periodic monitoring."""
        self._running = False
        if self._check_task:
            self._check_task.cancel()
            try:
                await self._check_task
            except asyncio.CancelledError:
                pass

    def get_history(self, limit: int = 50) -> list[dict]:
        """Get recent alert history."""
        return [
            {
                "rule_name": a.rule_name,
                "severity": a.severity.value,
                "message": a.message,
                "timestamp": a.timestamp,
            }
            for a in self.alert_history[-limit:]
        ]

    def get_stats(self) -> dict:
        """Get alert statistics."""
        by_severity = defaultdict(int)
        by_rule = defaultdict(int)
        for a in self.alert_history:
            by_severity[a.severity.value] += 1
            by_rule[a.rule_name] += 1
        return {
            "total_alerts": len(self.alert_history),
            "by_severity": dict(by_severity),
            "by_rule": dict(by_rule),
            "rules_active": sum(1 for r in self.rules.values() if r.enabled),
            "rules_total": len(self.rules),
        }
