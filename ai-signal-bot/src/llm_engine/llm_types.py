"""LLM engine types — config, context, analysis result, secret wrapper.

Separated from engine.py public data contract, no engine logic.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field


class SecretStr:
    """Wrapper to prevent secret leakage in repr/logs."""

    __slots__ = ("_value",)

    def __init__(self, value: str = ""):
        self._value = value

    def get(self) -> str:
        """Get the underlying string value."""
        return self._value

    def __repr__(self) -> str:
        return "SecretStr('***')"

    def __str__(self) -> str:
        return "***"

    def __bool__(self) -> bool:
        return bool(self._value)

    def __eq__(self, other: object) -> bool:
        if isinstance(other, SecretStr):
            return self._value == other._value
        return False


@dataclass
class LLMConfig:
    provider: str = "openai"           # openai, anthropic, ollama, none
    api_key: SecretStr = field(default_factory=lambda: SecretStr(""))
    model: str = "gpt-4o-mini"
    base_url: str = ""
    max_tokens: int = 500
    temperature: float = 0.3
    timeout_seconds: float = 10.0
    enabled: bool = True
    cache_ttl_seconds: int = 60


@dataclass
class MarketContext:
    symbol: str = ""
    price: float = 0.0
    change_24h: float = 0.0
    volume_24h: float = 0.0
    rsi: float = 50.0
    ema_fast: float = 0.0
    ema_slow: float = 0.0
    adx: float = 0.0
    atr: float = 0.0
    bollinger_pos: float = 0.5
    order_book_imbalance: float = 0.0
    recent_signals: list = field(default_factory=list)
    regime: str = "unknown"


@dataclass
class LLMAnalysis:
    symbol: str = ""
    summary: str = ""
    sentiment: str = "neutral"         # bullish, bearish, neutral
    confidence: float = 0.0
    key_levels: dict = field(default_factory=dict)
    risk_factors: list = field(default_factory=list)
    recommendation: str = "hold"
    timestamp: float = field(default_factory=time.time)
    cached: bool = False
