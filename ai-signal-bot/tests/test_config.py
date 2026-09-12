"""Tests for config loading and validation."""
import os
import tempfile

import pytest
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
        "default_exchange": "binance",
    },
    "risk": {
        "max_risk_per_trade_pct": 2.0,
        "max_daily_drawdown_pct": 8.0,
        "min_confidence": 65,
        "min_rr_ratio": 1.5,
        "max_position_size_pct": 10.0,
    },
    "strategies": {
        "trend_following": {"enabled": True, "ema_fast": 12, "ema_slow": 26, "adx_threshold": 25},
        "mean_reversion": {"enabled": True, "rsi_oversold": 30, "rsi_overbought": 70, "bb_std": 2.0},
        "ensemble": {"min_votes": 2, "mode": "majority"},
    },
    "indicators": {
        "rsi_period": 14,
        "atr_period": 14,
        "adx_period": 14,
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
        assert cfg.raw["trading"] is not None or isinstance(cfg.raw, dict)

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


class TestStrategyTunables:
    """Regression: strategies.* tunables must surface as config properties (S117)."""

    def _cfg(self, extra):
        data = {**VALID_CONFIG}
        data["strategies"] = {**VALID_CONFIG["strategies"], **extra}
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            yaml.dump(data, f)
            path = f.name
        try:
            return SignalBotConfig.load(path, validate=False)
        finally:
            os.unlink(path)

    def test_sentiment_tunables(self):
        cfg = self._cfg({"sentiment": {"enabled": True, "fade_threshold": 0.42, "decay_rate": 0.5}})
        assert cfg.sentiment_enabled is True
        assert cfg.sentiment_fade_threshold == 0.42
        assert cfg.sentiment_decay_rate == 0.5

    def test_market_making_tunables(self):
        cfg = self._cfg({"market_making": {
            "enabled": True, "gamma": 0.25, "sigma": 0.05,
            "max_inventory": 9.0, "min_spread": 0.002,
        }})
        assert cfg.market_making_enabled is True
        assert cfg.mm_gamma == 0.25
        assert cfg.mm_sigma == 0.05
        assert cfg.mm_max_inventory == 9.0
        assert cfg.mm_min_spread == 0.002

    def test_ml_ensemble_tunables(self):
        cfg = self._cfg({"ml_ensemble": {"enabled": True, "lookback": 77, "prediction_horizon": 9}})
        assert cfg.ml_ensemble_enabled is True
        assert cfg.ml_lookback == 77
        assert cfg.ml_prediction_horizon == 9

    def test_tunable_defaults_match_dataclasses(self):
        cfg = self._cfg({})
        assert cfg.mm_gamma == 0.1
        assert cfg.sentiment_fade_threshold == 0.7
        assert cfg.ml_lookback == 200


class TestNetworkAndMetricsConfig:
    """Regression: network.*/metrics.* keys must have live readers (S117)."""

    def _cfg(self, extra):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            yaml.dump({**VALID_CONFIG, **extra}, f)
            path = f.name
        try:
            return SignalBotConfig.load(path, validate=False)
        finally:
            os.unlink(path)

    def test_network_timeouts(self):
        cfg = self._cfg({"network": {"ws_connect_timeout": 4, "ws_recv_timeout": 12, "rest_timeout": 7}})
        assert cfg.ws_connect_timeout == 4
        assert cfg.ws_recv_timeout == 12
        assert cfg.rest_timeout == 7

    def test_metrics_keys(self):
        cfg = self._cfg({"metrics": {"enabled": True, "port": 9191, "host": "127.0.0.1"}})
        assert cfg.metrics_enabled is True
        assert cfg.metrics_port == 9191
        assert cfg.metrics_host == "127.0.0.1"

    def test_metrics_defaults(self):
        cfg = self._cfg({})
        assert cfg.metrics_enabled is False
        assert cfg.metrics_port == 9090
