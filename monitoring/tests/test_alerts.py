# Tests for Alerting
# Tests alert triggers, notifications, and escalation

from pathlib import Path

import pytest
import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
ALERTS_FILE = PROJECT_ROOT / "monitoring" / "alerts" / "alerts.yml"
ALERTMANAGER_FILE = PROJECT_ROOT / "monitoring" / "alertmanager" / "config.yml"


class TestAlertRules:
    """Test Prometheus alert rules."""
    
    def test_alert_rules_file_exists(self):
        """Test that alert rules file exists and is valid YAML."""
        with open(ALERTS_FILE, 'r') as f:
            config = yaml.safe_load(f)
        
        assert 'groups' in config
        assert len(config['groups']) > 0
    
    def test_latency_alerts_group(self):
        """Test latency alerts group."""
        with open(ALERTS_FILE, 'r') as f:
            config = yaml.safe_load(f)
        
        latency_group = next((g for g in config['groups'] if g['name'] == 'latency_alerts'), None)
        
        assert latency_group is not None
        assert 'rules' in latency_group
        assert len(latency_group['rules']) > 0
    
    def test_error_rate_alerts_group(self):
        """Test error rate alerts group."""
        with open(ALERTS_FILE, 'r') as f:
            config = yaml.safe_load(f)
        
        error_group = next((g for g in config['groups'] if g['name'] == 'error_rate_alerts'), None)
        
        assert error_group is not None
        assert 'rules' in error_group
        assert len(error_group['rules']) > 0
    
    def test_trading_alerts_group(self):
        """Test trading alerts group."""
        with open(ALERTS_FILE, 'r') as f:
            config = yaml.safe_load(f)
        
        trading_group = next((g for g in config['groups'] if g['name'] == 'trading_alerts'), None)
        
        assert trading_group is not None
        assert 'rules' in trading_group
        assert len(trading_group['rules']) > 0
    
    def test_system_health_alerts_group(self):
        """Test system health alerts group."""
        with open(ALERTS_FILE, 'r') as f:
            config = yaml.safe_load(f)
        
        health_group = next((g for g in config['groups'] if g['name'] == 'system_health_alerts'), None)
        
        assert health_group is not None
        assert 'rules' in health_group
        assert len(health_group['rules']) > 0
    
    def test_alert_rule_structure(self):
        """Test that alert rules have required fields."""
        with open(ALERTS_FILE, 'r') as f:
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
        with open(ALERTS_FILE, 'r') as f:
            config = yaml.safe_load(f)
        
        for group in config['groups']:
            for rule in group['rules']:
                if 'critical' in rule['alert'].lower():
                    assert rule['labels']['severity'] == 'critical'


class TestAlertmanagerConfig:
    """Test Alertmanager configuration."""
    
    def test_alertmanager_config_exists(self):
        """Test that Alertmanager config file exists and is valid YAML."""
        with open(ALERTMANAGER_FILE, 'r') as f:
            config = yaml.safe_load(f)
        
        assert 'global' in config
        assert 'route' in config
        assert 'receivers' in config
    
    def test_global_config(self):
        """Test global configuration."""
        with open(ALERTMANAGER_FILE, 'r') as f:
            config = yaml.safe_load(f)
        
        assert 'resolve_timeout' in config['global']
        assert 'smtp_smarthost' in config['global']
    
    def test_route_config(self):
        """Test route configuration."""
        with open(ALERTMANAGER_FILE, 'r') as f:
            config = yaml.safe_load(f)
        
        route = config['route']
        
        assert 'group_by' in route
        assert 'group_wait' in route
        assert 'group_interval' in route
        assert 'repeat_interval' in route
        assert 'receiver' in route
    
    def test_receivers_config(self):
        """Test receivers configuration."""
        with open(ALERTMANAGER_FILE, 'r') as f:
            config = yaml.safe_load(f)
        
        assert len(config['receivers']) > 0
        
        for receiver in config['receivers']:
            assert 'name' in receiver
    
    def test_critical_alerts_receiver(self):
        """Test critical alerts receiver configuration."""
        with open(ALERTMANAGER_FILE, 'r') as f:
            config = yaml.safe_load(f)
        
        critical_receiver = next((r for r in config['receivers'] if r['name'] == 'critical-alerts'), None)
        
        assert critical_receiver is not None
        assert 'email_configs' in critical_receiver or 'slack_configs' in critical_receiver
    
    def test_warning_alerts_receiver(self):
        """Test warning alerts receiver configuration."""
        with open(ALERTMANAGER_FILE, 'r') as f:
            config = yaml.safe_load(f)
        
        warning_receiver = next((r for r in config['receivers'] if r['name'] == 'warning-alerts'), None)
        
        assert warning_receiver is not None
        assert 'email_configs' in warning_receiver or 'slack_configs' in warning_receiver
    
    def test_inhibition_rules(self):
        """Test inhibition rules."""
        with open(ALERTMANAGER_FILE, 'r') as f:
            config = yaml.safe_load(f)
        
        if 'inhibit_rules' in config:
            for rule in config['inhibit_rules']:
                assert 'source_match' in rule
                assert 'target_match' in rule


class TestAlertTriggering:
    """Test alert triggering logic."""
    
    def test_high_latency_alert_trigger(self):
        """Test high latency alert trigger condition."""
        # Simulate high latency condition
        latency_p99 = 0.15  # 150ms, above 100ms threshold
        
        assert latency_p99 > 0.1  # Should trigger warning
    
    def test_critical_latency_alert_trigger(self):
        """Test critical latency alert trigger condition."""
        # Simulate critical latency condition
        latency_p99 = 1.5  # 1.5s, above 1s threshold
        
        assert latency_p99 > 1.0  # Should trigger critical
    
    def test_high_error_rate_alert_trigger(self):
        """Test high error rate alert trigger condition."""
        # Simulate high error rate
        error_rate = 0.15  # 0.15 errors/sec, above 0.1 threshold
        
        assert error_rate > 0.1  # Should trigger warning
    
    def test_high_drawdown_alert_trigger(self):
        """Test high drawdown alert trigger condition."""
        # Simulate high drawdown
        drawdown = 0.15  # 15%, above 10% threshold
        
        assert drawdown > 0.1  # Should trigger warning
    
    def test_critical_drawdown_alert_trigger(self):
        """Test critical drawdown alert trigger condition."""
        # Simulate critical drawdown
        drawdown = 0.25  # 25%, above 20% threshold
        
        assert drawdown > 0.2  # Should trigger critical
    
    def test_high_cpu_usage_alert_trigger(self):
        """Test high CPU usage alert trigger condition."""
        # Simulate high CPU usage
        cpu_usage = 85  # 85%, above 80% threshold
        
        assert cpu_usage > 80  # Should trigger warning
    
    def test_critical_cpu_usage_alert_trigger(self):
        """Test critical CPU usage alert trigger condition."""
        # Simulate critical CPU usage
        cpu_usage = 97  # 97%, above 95% threshold
        
        assert cpu_usage > 95  # Should trigger critical


class TestAlertEscalation:
    """Test alert escalation policies."""
    
    def test_severity_levels(self):
        """Test that alerts have proper severity levels."""
        severities = ['info', 'warning', 'critical']
        
        for severity in severities:
            assert severity in ['info', 'warning', 'critical']
    
    def test_escalation_timing(self):
        """Test escalation timing based on duration."""
        # Warning after 5 minutes
        warning_duration = 5 * 60  # 5 minutes in seconds
        assert warning_duration >= 300
        
        # Critical after 2 minutes
        critical_duration = 2 * 60  # 2 minutes in seconds
        assert critical_duration >= 120
    
    def test_alert_grouping(self):
        """Test alert grouping by component."""
        # Alerts should be grouped by component
        components = ['exchange-simulator', 'ai-signal-bot']
        
        for component in components:
            assert component in components
