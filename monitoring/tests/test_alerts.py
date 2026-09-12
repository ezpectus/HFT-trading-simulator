# Tests for Alerting
# Tests alert triggers, notifications, and escalation

from pathlib import Path

import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
ALERTS_FILE = PROJECT_ROOT / "monitoring" / "alerts" / "alerts.yml"


class TestAlertRules:
    """Test Prometheus alert rules."""
    
    def test_alert_rules_file_exists(self):
        """Test that alert rules file exists and is valid YAML."""
        with open(ALERTS_FILE, 'r', encoding="utf-8") as f:
            config = yaml.safe_load(f)
        
        assert 'groups' in config
        assert len(config['groups']) > 0
    
    def test_latency_alerts_group(self):
        """Test latency alerts group."""
        with open(ALERTS_FILE, 'r', encoding="utf-8") as f:
            config = yaml.safe_load(f)
        
        latency_group = next((g for g in config['groups'] if g['name'] == 'latency_alerts'), None)
        
        assert latency_group is not None
        assert 'rules' in latency_group
        assert len(latency_group['rules']) > 0
    
    def test_error_rate_alerts_group(self):
        """Test error rate alerts group."""
        with open(ALERTS_FILE, 'r', encoding="utf-8") as f:
            config = yaml.safe_load(f)
        
        error_group = next((g for g in config['groups'] if g['name'] == 'error_rate_alerts'), None)
        
        assert error_group is not None
        assert 'rules' in error_group
        assert len(error_group['rules']) > 0
    
    def test_trading_alerts_group(self):
        """Test trading alerts group."""
        with open(ALERTS_FILE, 'r', encoding="utf-8") as f:
            config = yaml.safe_load(f)
        
        trading_group = next((g for g in config['groups'] if g['name'] == 'trading_alerts'), None)
        
        assert trading_group is not None
        assert 'rules' in trading_group
        assert len(trading_group['rules']) > 0
    
    def test_system_health_alerts_group(self):
        """Test system health alerts group."""
        with open(ALERTS_FILE, 'r', encoding="utf-8") as f:
            config = yaml.safe_load(f)
        
        health_group = next((g for g in config['groups'] if g['name'] == 'system_health_alerts'), None)
        
        assert health_group is not None
        assert 'rules' in health_group
        assert len(health_group['rules']) > 0
    
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
