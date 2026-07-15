"""Tests for AI Signal Bot config validator."""
import pytest

from config import SignalBotConfig


def _valid_raw():
    return {
        "trading": {
            "symbols": ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
            "timeframe": "1m",
            "signal_interval_seconds": 5,
            "max_open_positions": 3,
            "paper_trading": True,
        },
        "exchange": {
            "websocket_url": "ws://localhost:8765",
            "default_exchange": "binance",
        },
        "risk": {
            "max_risk_per_trade_pct": 2.0,
            "max_daily_drawdown_pct": 10.0,
            "min_confidence": 60.0,
            "min_rr_ratio": 1.5,
            "stop_loss_pct": 2.0,
            "take_profit_pct": 4.0,
            "max_position_size_pct": 25.0,
        },
        "strategies": {
            "trend_following": {
                "enabled": True,
                "ema_fast": 21,
                "ema_slow": 50,
                "adx_threshold": 25.0,
            },
            "mean_reversion": {
                "enabled": True,
                "rsi_oversold": 30.0,
                "rsi_overbought": 70.0,
                "bb_period": 20,
                "bb_std": 2.0,
            },
            "fft_cycle": {"enabled": True, "min_data": 64},
            "ensemble": {
                "mode": "majority",
                "min_votes": 2,
            },
        },
        "indicators": {
            "rsi_period": 14,
            "macd_fast": 12,
            "macd_slow": 26,
            "macd_signal": 9,
            "atr_period": 14,
            "adx_period": 14,
        },
        "database": {"path": "data/signals.db"},
        "logging": {"level": "INFO"},
    }


class TestConfigValidator:
    def test_valid_config(self):
        cfg = SignalBotConfig(raw=_valid_raw())
        errors, warnings = cfg.validate()
        assert len(errors) == 0

    def test_missing_section(self):
        raw = _valid_raw()
        del raw["risk"]
        cfg = SignalBotConfig(raw=raw)
        errors, _ = cfg.validate()
        assert any("risk" in e for e in errors)

    def test_empty_symbols(self):
        raw = _valid_raw()
        raw["trading"]["symbols"] = []
        cfg = SignalBotConfig(raw=raw)
        errors, _ = cfg.validate()
        assert any("symbols" in e for e in errors)

    def test_ema_fast_ge_slow(self):
        raw = _valid_raw()
        raw["strategies"]["trend_following"]["ema_fast"] = 50
        raw["strategies"]["trend_following"]["ema_slow"] = 50
        cfg = SignalBotConfig(raw=raw)
        errors, _ = cfg.validate()
        assert any("ema_fast" in e for e in errors)

    def test_rsi_oversold_ge_overbought(self):
        raw = _valid_raw()
        raw["strategies"]["mean_reversion"]["rsi_oversold"] = 70
        raw["strategies"]["mean_reversion"]["rsi_overbought"] = 70
        cfg = SignalBotConfig(raw=raw)
        errors, _ = cfg.validate()
        assert any("rsi_oversold" in e for e in errors)

    def test_negative_risk(self):
        raw = _valid_raw()
        raw["risk"]["max_risk_per_trade_pct"] = -1.0
        cfg = SignalBotConfig(raw=raw)
        errors, _ = cfg.validate()
        assert any("max_risk_per_trade_pct" in e for e in errors)

    def test_high_risk_warning(self):
        raw = _valid_raw()
        raw["risk"]["max_risk_per_trade_pct"] = 15.0
        cfg = SignalBotConfig(raw=raw)
        _, warnings = cfg.validate()
        assert any("high risk" in w for w in warnings)

    def test_high_drawdown_warning(self):
        raw = _valid_raw()
        raw["risk"]["max_daily_drawdown_pct"] = 25.0
        cfg = SignalBotConfig(raw=raw)
        _, warnings = cfg.validate()
        assert any("drawdown" in w for w in warnings)

    def test_invalid_ensemble_mode_warning(self):
        raw = _valid_raw()
        raw["strategies"]["ensemble"]["mode"] = "random"
        cfg = SignalBotConfig(raw=raw)
        _, warnings = cfg.validate()
        assert any("ensemble.mode" in w for w in warnings)

    def test_macd_fast_ge_slow(self):
        raw = _valid_raw()
        raw["indicators"]["macd_fast"] = 26
        raw["indicators"]["macd_slow"] = 26
        cfg = SignalBotConfig(raw=raw)
        errors, _ = cfg.validate()
        assert any("macd_fast" in e for e in errors)

    def test_missing_websocket_url(self):
        raw = _valid_raw()
        del raw["exchange"]["websocket_url"]
        cfg = SignalBotConfig(raw=raw)
        errors, _ = cfg.validate()
        assert any("websocket_url" in e for e in errors)

    def test_zero_stop_loss(self):
        raw = _valid_raw()
        raw["risk"]["stop_loss_pct"] = 0
        cfg = SignalBotConfig(raw=raw)
        errors, _ = cfg.validate()
        assert any("stop_loss_pct" in e for e in errors)

    def test_load_with_validate_raises_on_invalid(self):
        raw = _valid_raw()
        del raw["trading"]
        cfg = SignalBotConfig(raw=raw)
        with pytest.raises(ValueError):
            cfg.validate()

    def test_many_positions_warning(self):
        raw = _valid_raw()
        raw["trading"]["max_open_positions"] = 15
        cfg = SignalBotConfig(raw=raw)
        _, warnings = cfg.validate()
        assert any("positions" in w for w in warnings)
