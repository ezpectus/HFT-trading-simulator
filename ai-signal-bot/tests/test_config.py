"""Tests for config loading and validation."""
import pytest
import tempfile
import os
import yaml
from config import SignalBotConfig


VALID_CONFIG = {
    "trading": {
        "symbols": ["BTC/USDT", "ETH/USDT"],
        "signal_interval_seconds": 60,
        "max_open_positions": 3,
        "paper_trading": True,
    },
    "exchange": {
        "name": "simulator",
        "mode": "simulator",
        "websocket_url": "ws://localhost:8765",
    },
    "risk": {
        "max_risk_per_trade_pct": 2.0,
        "max_daily_drawdown_pct": 8.0,
        "min_confidence": 65,
        "min_rr_ratio": 1.5,
    },
    "strategies": {
        "trend": {"enabled": True},
        "meanrev": {"enabled": True},
    },
    "indicators": {
        "rsi": {"period": 14},
    },
}


@pytest.fixture
def config_file():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(VALID_CONFIG, f)
        path = f.name
    yield path
    os.unlink(path)


class TestSignalBotConfig:
    def test_load_valid_config(self, config_file):
        cfg = SignalBotConfig.load(config_file, validate=True)
        assert cfg.raw["trading"]["symbols"] == ["BTC/USDT", "ETH/USDT"]

    def test_load_without_validation(self, config_file):
        cfg = SignalBotConfig.load(config_file, validate=False)
        assert cfg.raw is not None

    def test_validate_returns_no_errors_for_valid_config(self, config_file):
        cfg = SignalBotConfig.load(config_file, validate=False)
        errors, warnings = cfg.validate()
        assert len(errors) == 0

    def test_missing_required_section_raises(self):
        bad_config = {"trading": {}}
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            yaml.dump(bad_config, f)
            path = f.name
        try:
            with pytest.raises(ValueError):
                SignalBotConfig.load(path, validate=True)
        finally:
            os.unlink(path)

    def test_getattr_access(self, config_file):
        cfg = SignalBotConfig.load(config_file, validate=False)
        assert cfg.trading["symbols"] == ["BTC/USDT", "ETH/USDT"]
        assert cfg.exchange["name"] == "simulator"
