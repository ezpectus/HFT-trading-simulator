"""Configuration loader for AI Signal Bot."""
import logging
import os
from dataclasses import dataclass, field

import yaml

logger = logging.getLogger(__name__)


REQUIRED_SECTIONS = ["trading", "exchange", "risk", "strategies", "indicators"]


@dataclass
class SignalBotConfig:
    raw: dict = field(default_factory=dict)

    @classmethod
    def load(cls, path: str = None, validate: bool = True) -> "SignalBotConfig":
        if path is None:
            path = os.path.join(os.path.dirname(__file__), "..", "config", "settings.yaml")
            path = os.path.normpath(path)
        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        cfg = cls(raw=data)
        if validate:
            errors, warnings = cfg.validate()
            for w in warnings:
                logger.warning(f"Config: {w}")
            if errors:
                for e in errors:
                    logger.error(f"Config ERROR: {e}")
                raise ValueError(f"Invalid config: {len(errors)} error(s). See log for details.")
        return cfg

    def validate(self) -> tuple[list[str], list[str]]:
        """Validate config values. Returns (errors, warnings)."""
        errors: list[str] = []
        warnings: list[str] = []

        # Check required sections
        for section in REQUIRED_SECTIONS:
            if section not in self.raw:
                errors.append(f"Missing required section: '{section}'")

        if errors:
            return errors, warnings

        # Trading section
        trading = self.raw.get("trading", {})
        if not trading.get("symbols"):
            errors.append("trading.symbols must be a non-empty list")
        if trading.get("signal_interval_seconds", 0) < 1:
            errors.append("trading.signal_interval_seconds must be >= 1")
        if trading.get("max_open_positions", 0) < 1:
            errors.append("trading.max_open_positions must be >= 1")

        # Exchange section
        exchange = self.raw.get("exchange", {})
        if not exchange.get("websocket_url"):
            errors.append("exchange.websocket_url is required")
        if not exchange.get("default_exchange"):
            errors.append("exchange.default_exchange is required")

        # Risk section
        risk = self.raw.get("risk", {})
        if not (0 < risk.get("max_risk_per_trade_pct", 0) <= 100):
            errors.append("risk.max_risk_per_trade_pct must be in (0, 100]")
        if not (0 < risk.get("max_daily_drawdown_pct", 0) <= 100):
            errors.append("risk.max_daily_drawdown_pct must be in (0, 100]")
        if not (0 <= risk.get("min_confidence", 0) <= 100):
            errors.append("risk.min_confidence must be in [0, 100]")
        if risk.get("min_rr_ratio", 0) <= 0:
            errors.append("risk.min_rr_ratio must be > 0")
        if risk.get("stop_loss_pct", 0) <= 0:
            errors.append("risk.stop_loss_pct must be > 0")
        if risk.get("take_profit_pct", 0) <= 0:
            errors.append("risk.take_profit_pct must be > 0")
        if risk.get("max_position_size_pct", 0) <= 0:
            errors.append("risk.max_position_size_pct must be > 0")

        # Strategy params
        strategies = self.raw.get("strategies", {})
        tf = strategies.get("trend_following", {})
        if tf.get("ema_fast", 0) >= tf.get("ema_slow", 999):
            errors.append("strategies.trend_following.ema_fast must be < ema_slow")
        if tf.get("adx_threshold", 0) <= 0:
            errors.append("strategies.trend_following.adx_threshold must be > 0")

        mr = strategies.get("mean_reversion", {})
        if mr.get("rsi_oversold", 50) >= mr.get("rsi_overbought", 50):
            errors.append("strategies.mean_reversion.rsi_oversold must be < rsi_overbought")
        if mr.get("bb_std", 0) <= 0:
            errors.append("strategies.mean_reversion.bb_std must be > 0")

        # Ensemble
        ens = strategies.get("ensemble", {})
        if ens.get("min_votes", 0) < 1:
            errors.append("strategies.ensemble.min_votes must be >= 1")
        if ens.get("mode") not in ("majority", "weighted"):
            warnings.append(f"strategies.ensemble.mode='{ens.get('mode')}' — expected 'majority' or 'weighted'")

        # Indicators
        indicators = self.raw.get("indicators", {})
        for key in ("rsi_period", "macd_fast", "macd_slow", "macd_signal", "atr_period", "adx_period"):
            val = indicators.get(key, 0)
            if val < 1:
                errors.append(f"indicators.{key} must be >= 1")
        if indicators.get("macd_fast", 0) >= indicators.get("macd_slow", 999):
            errors.append("indicators.macd_fast must be < macd_slow")

        # Warnings for suspicious values
        if risk.get("max_risk_per_trade_pct", 0) > 10:
            warnings.append("risk.max_risk_per_trade_pct > 10% — high risk per trade")
        if risk.get("max_daily_drawdown_pct", 0) > 20:
            warnings.append("risk.max_daily_drawdown_pct > 20% — high daily drawdown limit")
        if risk.get("stop_loss_pct", 0) > 10:
            warnings.append("risk.stop_loss_pct > 10% — wide stop loss")
        if trading.get("max_open_positions", 0) > 10:
            warnings.append("trading.max_open_positions > 10 — many concurrent positions")

        return errors, warnings

    # --- trading ---
    @property
    def symbols(self) -> list[str]:
        return self.raw["trading"]["symbols"]

    @property
    def timeframe(self) -> str:
        return self.raw["trading"]["timeframe"]

    @property
    def signal_interval(self) -> int:
        return self.raw["trading"]["signal_interval_seconds"]

    @property
    def max_open_positions(self) -> int:
        return self.raw["trading"]["max_open_positions"]

    @property
    def paper_trading(self) -> bool:
        return self.raw["trading"]["paper_trading"]

    # --- exchange ---
    @property
    def ws_url(self) -> str:
        return self.raw["exchange"]["websocket_url"]

    @property
    def default_exchange(self) -> str:
        return self.raw["exchange"]["default_exchange"]

    # --- risk ---
    @property
    def max_risk_pct(self) -> float:
        return float(self.raw["risk"]["max_risk_per_trade_pct"])

    @property
    def max_drawdown_pct(self) -> float:
        return float(self.raw["risk"]["max_daily_drawdown_pct"])

    @property
    def min_confidence(self) -> float:
        return float(self.raw["risk"]["min_confidence"])

    @property
    def min_rr_ratio(self) -> float:
        return float(self.raw["risk"]["min_rr_ratio"])

    @property
    def stop_loss_pct(self) -> float:
        return float(self.raw["risk"]["stop_loss_pct"])

    @property
    def take_profit_pct(self) -> float:
        return float(self.raw["risk"]["take_profit_pct"])

    @property
    def max_position_size_pct(self) -> float:
        return float(self.raw["risk"]["max_position_size_pct"])

    # --- strategies ---
    @property
    def trend_enabled(self) -> bool:
        return self.raw["strategies"]["trend_following"]["enabled"]

    @property
    def trend_ema_fast(self) -> int:
        return self.raw["strategies"]["trend_following"]["ema_fast"]

    @property
    def trend_ema_slow(self) -> int:
        return self.raw["strategies"]["trend_following"]["ema_slow"]

    @property
    def trend_adx_threshold(self) -> float:
        return float(self.raw["strategies"]["trend_following"]["adx_threshold"])

    @property
    def meanrev_enabled(self) -> bool:
        return self.raw["strategies"]["mean_reversion"]["enabled"]

    @property
    def meanrev_rsi_oversold(self) -> float:
        return float(self.raw["strategies"]["mean_reversion"]["rsi_oversold"])

    @property
    def meanrev_rsi_overbought(self) -> float:
        return float(self.raw["strategies"]["mean_reversion"]["rsi_overbought"])

    @property
    def meanrev_bb_period(self) -> int:
        return self.raw["strategies"]["mean_reversion"]["bb_period"]

    @property
    def meanrev_bb_std(self) -> float:
        return float(self.raw["strategies"]["mean_reversion"]["bb_std"])

    @property
    def fft_enabled(self) -> bool:
        return self.raw.get("strategies", {}).get("fft_cycle", {}).get("enabled", False)

    @property
    def fft_min_data(self) -> int:
        return self.raw.get("strategies", {}).get("fft_cycle", {}).get("min_data", 64)

    @property
    def statarb_enabled(self) -> bool:
        return self.raw.get("strategies", {}).get("statistical_arbitrage", {}).get("enabled", False)

    @property
    def statarb_min_data(self) -> int:
        return self.raw.get("strategies", {}).get("statistical_arbitrage", {}).get("min_data", 100)

    @property
    def statarb_zscore_entry(self) -> float:
        return float(self.raw.get("strategies", {}).get("statistical_arbitrage", {}).get("zscore_entry", 2.0))

    @property
    def statarb_zscore_exit(self) -> float:
        return float(self.raw.get("strategies", {}).get("statistical_arbitrage", {}).get("zscore_exit", 0.5))

    @property
    def statarb_recompute_interval(self) -> int:
        return self.raw.get("strategies", {}).get("statistical_arbitrage", {}).get("recompute_interval", 50)

    @property
    def market_making_enabled(self) -> bool:
        return self.raw.get("strategies", {}).get("market_making", {}).get("enabled", False)

    @property
    def sentiment_enabled(self) -> bool:
        return self.raw.get("strategies", {}).get("sentiment", {}).get("enabled", False)

    @property
    def ml_ensemble_enabled(self) -> bool:
        return self.raw.get("strategies", {}).get("ml_ensemble", {}).get("enabled", False)

    @property
    def ensemble_mode(self) -> str:
        return self.raw["strategies"]["ensemble"]["mode"]

    @property
    def ensemble_min_votes(self) -> int:
        return self.raw["strategies"]["ensemble"]["min_votes"]

    # --- indicators ---
    @property
    def rsi_period(self) -> int:
        return self.raw["indicators"]["rsi_period"]

    @property
    def macd_fast(self) -> int:
        return self.raw["indicators"]["macd_fast"]

    @property
    def macd_slow(self) -> int:
        return self.raw["indicators"]["macd_slow"]

    @property
    def macd_signal(self) -> int:
        return self.raw["indicators"]["macd_signal"]

    @property
    def atr_period(self) -> int:
        return self.raw["indicators"]["atr_period"]

    @property
    def adx_period(self) -> int:
        return self.raw["indicators"]["adx_period"]

    # --- database ---
    @property
    def db_path(self) -> str:
        return self.raw["database"]["path"]

    # --- logging ---
    @property
    def log_level(self) -> str:
        return self.raw.get("logging", {}).get("level", "INFO")

    @property
    def log_file(self) -> str:
        return self.raw.get("logging", {}).get("file", "logs/ai_signal_bot.log")

    @property
    def trades_csv(self) -> str:
        return self.raw.get("logging", {}).get("trades_csv", "logs/trades.csv")

    @property
    def signals_csv(self) -> str:
        return self.raw.get("logging", {}).get("signals_csv", "logs/signals.csv")
