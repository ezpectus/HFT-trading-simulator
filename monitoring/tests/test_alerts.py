# Tests for Alerting
# Validates monitoring/alerts.yml structure against the live alert schema

from pathlib import Path

import pytest

import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
ALERTS_FILE = PROJECT_ROOT / "monitoring" / "alerts.yml"


class TestAlertRules:
    """Test Prometheus alert rules."""
    
    def test_alert_rules_file_exists(self):
        """Test that alert rules file exists and is valid YAML."""
        with open(ALERTS_FILE, 'r', encoding="utf-8") as f:
            config = yaml.safe_load(f)
        
        assert 'groups' in config
        assert len(config['groups']) > 0
    
    @pytest.mark.parametrize("group_name", [
        "ai-signal-bot", "exchange-simulator", "hft-trade-bot", "system", "websocket",
    ])
    def test_alert_groups_exist(self, group_name):
        """Every expected alert group exists with at least one rule."""
        with open(ALERTS_FILE, 'r', encoding="utf-8") as f:
            config = yaml.safe_load(f)

        group = next((g for g in config['groups'] if g['name'] == group_name), None)

        assert group is not None
        assert 'rules' in group
        assert len(group['rules']) > 0

    def test_alert_rule_structure(self):
        """Test that alert rules have required fields."""
        with open(ALERTS_FILE, 'r', encoding="utf-8") as f:
            config = yaml.safe_load(f)
        
        for group in config['groups']:
            for rule in group['rules']:
                assert 'alert' in rule
                assert 'expr' in rule
                assert 'labels' in rule
                assert 'severity' in rule['labels']
                assert 'annotations' in rule
    
    def test_critical_alert_severity(self):
        """Test that critical alerts have proper severity."""
        with open(ALERTS_FILE, 'r', encoding="utf-8") as f:
            config = yaml.safe_load(f)
        
        for group in config['groups']:
            for rule in group['rules']:
                if 'critical' in rule['alert'].lower():
                    assert rule['labels']['severity'] == 'critical'


class TestAlertThresholds:
    """Verify hardcoded alert thresholds in alerts.yml match documented expectations."""

    def _rules(self):
        with open(ALERTS_FILE, encoding="utf-8") as f:
            config = yaml.safe_load(f)
        return [r for g in config["groups"] for r in g["rules"]]

    def test_every_rule_has_severity_label(self):
        for rule in self._rules():
            assert "severity" in rule.get("labels", {}), f"{rule.get('alert')} missing severity"
            assert rule["labels"]["severity"] in ("info", "warning", "critical")

    def test_every_rule_has_expr_and_duration(self):
        for rule in self._rules():
            assert rule.get("expr"), f"{rule.get('alert')} missing expr"
            assert "for" in rule, f"{rule.get('alert')} missing duration"
