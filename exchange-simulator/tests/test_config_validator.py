"""Tests for config validator."""
import pytest

from exchange_simulator.config_validator import validate_config


def valid_config():
    """Return a known-valid config for testing."""
    return {
        "exchanges": {
            "binance": {
                "name": "Binance",
                "fee_pct": 0.04,
                "slippage_bps": 2.0,
                "symbols": ["BTC/USDT", "ETH/USDT"],
            },
            "bybit": {
                "name": "Bybit",
                "fee_pct": 0.06,
                "slippage_bps": 3.0,
                "symbols": ["BTC/USDT", "ETH/USDT"],
            },
        },
        "initial_prices": {"BTC/USDT": 65000.0, "ETH/USDT": 3500.0},
        "volatility": {"BTC/USDT": 0.75, "ETH/USDT": 0.85},
        "market": {
            "timeframe": "5m",
            "timeframe_seconds": 300,
            "drift": 0.0001,
            "seed": 42,
            "warmup_candles": 200,
            "order_book_depth": 20,
        },
        "account": {
            "initial_balance": 10000.0,
            "currency": "USDT",
            "leverage": 10,
        },
        "websocket": {"host": "localhost", "port": 8765},
        "arbitrage": {
            "fee_pct": 0.075,
            "slippage_bps": 2.0,
            "min_spread_bps": 5.0,
            "opportunity_ttl": 30.0,
        },
        "visualizer": {
            "enabled": True,
            "refresh_interval": 0.5,
            "chart_width": 60,
            "chart_height": 15,
        },
    }


class TestConfigValidator:
    def test_valid_config(self):
        errors, warnings = validate_config(valid_config())
        assert len(errors) == 0

    def test_missing_section(self):
        cfg = valid_config()
        del cfg["exchanges"]
        errors, _ = validate_config(cfg)
        assert any("exchanges" in e for e in errors)

    def test_no_exchanges(self):
        cfg = valid_config()
        cfg["exchanges"] = {}
        errors, _ = validate_config(cfg)
        assert any("No exchanges" in e for e in errors)

    def test_negative_fee(self):
        cfg = valid_config()
        cfg["exchanges"]["binance"]["fee_pct"] = -0.1
        errors, _ = validate_config(cfg)
        assert any("fee_pct" in e for e in errors)

    def test_high_fee(self):
        cfg = valid_config()
        cfg["exchanges"]["binance"]["fee_pct"] = 2.0
        errors, _ = validate_config(cfg)
        assert any("fee_pct" in e for e in errors)

    def test_missing_symbols_in_prices(self):
        cfg = valid_config()
        cfg["exchanges"]["binance"]["symbols"].append("SOL/USDT")
        errors, _ = validate_config(cfg)
        assert any("initial_prices" in e for e in errors)

    def test_missing_symbols_in_volatility(self):
        cfg = valid_config()
        cfg["initial_prices"]["SOL/USDT"] = 150.0
        # Don't add to volatility
        errors, _ = validate_config(cfg)
        assert any("volatility" in e for e in errors)

    def test_negative_price(self):
        cfg = valid_config()
        cfg["initial_prices"]["BTC/USDT"] = -100
        errors, _ = validate_config(cfg)
        assert any("positive" in e for e in errors)

    def test_invalid_timeframe(self):
        cfg = valid_config()
        cfg["market"]["timeframe"] = "7m"
        errors, _ = validate_config(cfg)
        assert any("timeframe" in e for e in errors)

    def test_timeframe_seconds_mismatch(self):
        cfg = valid_config()
        cfg["market"]["timeframe_seconds"] = 600
        _, warnings = validate_config(cfg)
        assert any("timeframe_seconds" in w for w in warnings)

    def test_low_warmup_warning(self):
        cfg = valid_config()
        cfg["market"]["warmup_candles"] = 10
        _, warnings = validate_config(cfg)
        assert any("warmup" in w.lower() for w in warnings)

    def test_high_leverage_warning(self):
        cfg = valid_config()
        cfg["account"]["leverage"] = 100
        _, warnings = validate_config(cfg)
        assert any("leverage" in w for w in warnings)

    def test_invalid_port(self):
        cfg = valid_config()
        cfg["websocket"]["port"] = 99999
        errors, _ = validate_config(cfg)
        assert any("port" in e for e in errors)

    def test_high_slippage_warning(self):
        cfg = valid_config()
        cfg["exchanges"]["binance"]["slippage_bps"] = 200
        _, warnings = validate_config(cfg)
        assert any("slippage" in w for w in warnings)

    def test_high_drift_warning(self):
        cfg = valid_config()
        cfg["market"]["drift"] = 0.05
        _, warnings = validate_config(cfg)
        assert any("drift" in w for w in warnings)

    def test_negative_min_spread(self):
        cfg = valid_config()
        cfg["arbitrage"]["min_spread_bps"] = -1.0
        errors, _ = validate_config(cfg)
        assert any("min_spread" in e for e in errors)

    def test_low_refresh_interval_warning(self):
        cfg = valid_config()
        cfg["visualizer"]["refresh_interval"] = 0.01
        _, warnings = validate_config(cfg)
        assert any("refresh" in w for w in warnings)

    def test_missing_exchange_name(self):
        cfg = valid_config()
        del cfg["exchanges"]["binance"]["name"]
        errors, _ = validate_config(cfg)
        assert any("name" in e for e in errors)

    def test_low_order_book_depth_warning(self):
        cfg = valid_config()
        cfg["market"]["order_book_depth"] = 2
        _, warnings = validate_config(cfg)
        assert any("order_book" in w for w in warnings)
