"""Tests for AlertSystem — rule checking, cooldown, exception handling, history, stats.

Tests cover: add/remove/enable/disable rules, check_rules with firing and not firing,
cooldown enforcement, exception in check_fn updates last_fired (regression),
alert history, get_stats, disabled rules skipped.
"""
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.monitoring.alerting import (
    Alert,
    AlertRule,
    AlertSeverity,
    AlertSystem,
)


@pytest.fixture
def alert_system():
    """Create an AlertSystem with no external channels."""
    return AlertSystem()


def make_rule(name="test_rule", check_fn=None, cooldown=300, enabled=True, severity=AlertSeverity.WARNING):
    return AlertRule(
        name=name,
        description="Test alert",
        severity=severity,
        check_fn=check_fn or (lambda: False),
        cooldown_seconds=cooldown,
        enabled=enabled,
    )


class TestAddRemoveRules:
    def test_add_rule(self, alert_system):
        rule = make_rule("rule1")
        alert_system.add_rule(rule)
        assert "rule1" in alert_system.rules

    def test_remove_rule(self, alert_system):
        rule = make_rule("rule1")
        alert_system.add_rule(rule)
        alert_system.remove_rule("rule1")
        assert "rule1" not in alert_system.rules

    def test_remove_nonexistent_rule(self, alert_system):
        alert_system.remove_rule("nonexistent")  # Should not crash

    def test_enable_rule(self, alert_system):
        rule = make_rule("rule1", enabled=False)
        alert_system.add_rule(rule)
        alert_system.enable_rule("rule1")
        assert alert_system.rules["rule1"].enabled is True

    def test_disable_rule(self, alert_system):
        rule = make_rule("rule1", enabled=True)
        alert_system.add_rule(rule)
        alert_system.disable_rule("rule1")
        assert alert_system.rules["rule1"].enabled is False

    def test_enable_nonexistent_rule(self, alert_system):
        alert_system.enable_rule("nonexistent")  # Should not crash

    def test_disable_nonexistent_rule(self, alert_system):
        alert_system.disable_rule("nonexistent")  # Should not crash


class TestCheckRules:
    @pytest.mark.asyncio
    async def test_rule_fires_when_check_returns_true(self, alert_system):
        rule = make_rule("fire_rule", check_fn=lambda: True, cooldown=0)
        alert_system.add_rule(rule)
        with patch.object(alert_system, "_send_alert", new_callable=AsyncMock):
            alerts = await alert_system.check_rules()
        assert len(alerts) == 1
        assert alerts[0].rule_name == "fire_rule"

    @pytest.mark.asyncio
    async def test_rule_does_not_fire_when_check_returns_false(self, alert_system):
        rule = make_rule("no_fire", check_fn=lambda: False, cooldown=0)
        alert_system.add_rule(rule)
        alerts = await alert_system.check_rules()
        assert len(alerts) == 0

    @pytest.mark.asyncio
    async def test_disabled_rule_skipped(self, alert_system):
        rule = make_rule("disabled", check_fn=lambda: True, enabled=False, cooldown=0)
        alert_system.add_rule(rule)
        alerts = await alert_system.check_rules()
        assert len(alerts) == 0

    @pytest.mark.asyncio
    async def test_cooldown_prevents_refire(self, alert_system):
        rule = make_rule("cooldown_rule", check_fn=lambda: True, cooldown=300)
        alert_system.add_rule(rule)
        with patch.object(alert_system, "_send_alert", new_callable=AsyncMock):
            alerts1 = await alert_system.check_rules()
            assert len(alerts1) == 1
            alerts2 = await alert_system.check_rules()
            assert len(alerts2) == 0  # Cooldown prevents refire

    @pytest.mark.asyncio
    async def test_exception_in_check_fn_updates_last_fired(self, alert_system):
        """Regression: exception in check_fn should update last_fired to prevent log flooding."""
        def broken_check():
            raise RuntimeError("Broken check")

        rule = make_rule("broken_rule", check_fn=broken_check, cooldown=300)
        alert_system.add_rule(rule)

        alerts1 = await alert_system.check_rules()
        assert len(alerts1) == 0  # No alert fired
        assert "broken_rule" in alert_system.last_fired  # last_fired updated

        # Second check should be blocked by cooldown
        alerts2 = await alert_system.check_rules()
        assert len(alerts2) == 0

    @pytest.mark.asyncio
    async def test_multiple_rules_some_fire(self, alert_system):
        alert_system.add_rule(make_rule("fire1", check_fn=lambda: True, cooldown=0))
        alert_system.add_rule(make_rule("no_fire", check_fn=lambda: False, cooldown=0))
        alert_system.add_rule(make_rule("fire2", check_fn=lambda: True, cooldown=0))
        with patch.object(alert_system, "_send_alert", new_callable=AsyncMock):
            alerts = await alert_system.check_rules()
        assert len(alerts) == 2

    @pytest.mark.asyncio
    async def test_alert_has_correct_severity(self, alert_system):
        rule = make_rule("critical_rule", check_fn=lambda: True, cooldown=0,
                         severity=AlertSeverity.CRITICAL)
        alert_system.add_rule(rule)
        with patch.object(alert_system, "_send_alert", new_callable=AsyncMock):
            alerts = await alert_system.check_rules()
        assert alerts[0].severity == AlertSeverity.CRITICAL

    @pytest.mark.asyncio
    async def test_alert_has_correct_message(self, alert_system):
        rule = AlertRule(
            name="msg_rule",
            description="Something is wrong",
            severity=AlertSeverity.WARNING,
            check_fn=lambda: True,
            cooldown_seconds=0,
        )
        alert_system.add_rule(rule)
        with patch.object(alert_system, "_send_alert", new_callable=AsyncMock):
            alerts = await alert_system.check_rules()
        assert alerts[0].message == "Something is wrong"


class TestHistory:
    @pytest.mark.asyncio
    async def test_history_records_fired_alerts(self, alert_system):
        alert_system.add_rule(make_rule("h1", check_fn=lambda: True, cooldown=0))
        with patch.object(alert_system, "_send_alert", new_callable=AsyncMock):
            await alert_system.check_rules()
        assert len(alert_system.alert_history) == 1
        assert alert_system.alert_history[0].rule_name == "h1"

    def test_get_history_returns_dicts(self, alert_system):
        alert = Alert(rule_name="test", severity=AlertSeverity.INFO, message="msg")
        alert_system.alert_history.append(alert)
        history = alert_system.get_history()
        assert len(history) == 1
        assert history[0]["rule_name"] == "test"
        assert history[0]["severity"] == "INFO"
        assert history[0]["message"] == "msg"

    def test_get_history_respects_limit(self, alert_system):
        for i in range(10):
            alert_system.alert_history.append(
                Alert(rule_name=f"r{i}", severity=AlertSeverity.INFO, message="m")
            )
        history = alert_system.get_history(limit=3)
        assert len(history) == 3
        assert history[0]["rule_name"] == "r7"  # Last 3

    def test_get_history_empty(self, alert_system):
        assert alert_system.get_history() == []


class TestStats:
    def test_get_stats_empty(self, alert_system):
        stats = alert_system.get_stats()
        assert stats["total_alerts"] == 0
        assert stats["by_severity"] == {}
        assert stats["by_rule"] == {}
        assert stats["rules_active"] == 0
        assert stats["rules_total"] == 0

    def test_get_stats_with_alerts(self, alert_system):
        alert_system.alert_history.append(
            Alert(rule_name="r1", severity=AlertSeverity.WARNING, message="m")
        )
        alert_system.alert_history.append(
            Alert(rule_name="r1", severity=AlertSeverity.CRITICAL, message="m")
        )
        alert_system.add_rule(make_rule("r1"))
        stats = alert_system.get_stats()
        assert stats["total_alerts"] == 2
        assert stats["by_severity"]["WARNING"] == 1
        assert stats["by_severity"]["CRITICAL"] == 1
        assert stats["by_rule"]["r1"] == 2
        assert stats["rules_active"] == 1
        assert stats["rules_total"] == 1

    def test_get_stats_disabled_rules(self, alert_system):
        alert_system.add_rule(make_rule("enabled", enabled=True))
        alert_system.add_rule(make_rule("disabled", enabled=False))
        stats = alert_system.get_stats()
        assert stats["rules_active"] == 1
        assert stats["rules_total"] == 2
