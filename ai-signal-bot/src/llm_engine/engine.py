"""LLM Engine — AI-powered market analysis and signal generation.

Uses LLM APIs (OpenAI/Anthropic/local) to analyze market conditions,
generate trading insights, and provide natural language explanations
for signals. Falls back to rule-based analysis if no API key configured.
"""

from __future__ import annotations

import asyncio
import json
from src.observability.logging import get_logger
import os
import re
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any  # Any: aiohttp.ClientSession lacks type stubs

logger = get_logger(__name__)

try:
    import aiohttp
    AIOHTTP_AVAILABLE = True
except ImportError:
    AIOHTTP_AVAILABLE = False


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


class LLMEngine:
    """LLM-powered market analysis engine."""

    def __init__(self, config: LLMConfig | None = None):
        self.config = config or LLMConfig()
        self._cache: OrderedDict[str, tuple[float, LLMAnalysis]] = OrderedDict()
        self._request_count = 0
        self._error_count = 0
        self._session: Any | None = None  # aiohttp.ClientSession — duck-typed
        self._prompt_dir = os.path.join(os.path.dirname(__file__), "prompt_templates")
        self._rate_limiter = asyncio.Semaphore(5)  # Max 5 concurrent LLM API calls

    async def initialize(self) -> None:
        """Initialize HTTP session."""
        if AIOHTTP_AVAILABLE:
            self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=self.config.timeout_seconds))
        if not self.config.api_key:
            if self.config.provider == "openai":
                self.config.api_key = SecretStr(os.getenv("OPENAI_API_KEY", ""))
            elif self.config.provider == "anthropic":
                self.config.api_key = SecretStr(os.getenv("ANTHROPIC_API_KEY", ""))
        if not self.config.api_key and self.config.provider not in ("ollama", "none"):
            self.config.provider = "none"
            logger.info("[LLMEngine] No API key, using rule-based fallback")
        else:
            logger.info("[LLMEngine] Provider: %s, model: %s", self.config.provider, self.config.model)

    async def close(self) -> None:
        """Close HTTP session."""
        if self._session:
            await self._session.close()

    def _load_prompt(self, name: str) -> str:
        """Load a prompt template from the prompt_templates directory."""
        path = os.path.join(self._prompt_dir, f"{name}.txt")
        try:
            with open(path) as f:
                return f.read()
        except FileNotFoundError:
            return self._default_prompt(name)

    def _default_prompt(self, name: str) -> str:
        prompts = {
            "market_analysis": (
                "You are a crypto trading analyst. Analyze the following market data "
                "and provide a concise assessment. Respond in JSON format with keys: "
                "summary, sentiment (bullish/bearish/neutral), confidence (0-100), "
                "key_levels (support/resistance), risk_factors (list), recommendation (buy/sell/hold).\n\n"
                "Market data:\n{context}"
            ),
            "signal_explanation": (
                "Explain in 2-3 sentences why a {direction} signal was generated for {symbol} "
                "at price {price}. Key indicators: RSI={rsi}, ADX={adx}, EMA trend={ema_trend}.\n"
                "Provide a clear, actionable explanation."
            ),
            "risk_assessment": (
                "Assess the risk of entering a {direction} position for {symbol} at {price}. "
                "Current volatility (ATR)={atr}, leverage={leverage}x. "
                "Identify top 3 risk factors and suggest position sizing."
            ),
        }
        return prompts.get(name, "Analyze: {context}")

    def _build_context_str(self, ctx: MarketContext) -> str:
        """Build market context string for the prompt."""
        return json.dumps({
            "symbol": ctx.symbol,
            "price": ctx.price,
            "change_24h_pct": ctx.change_24h,
            "volume_24h": ctx.volume_24h,
            "rsi": round(ctx.rsi, 2),
            "ema_fast": round(ctx.ema_fast, 2),
            "ema_slow": round(ctx.ema_slow, 2),
            "adx": round(ctx.adx, 2),
            "atr": round(ctx.atr, 4),
            "bollinger_position": round(ctx.bollinger_pos, 3),
            "order_book_imbalance": round(ctx.order_book_imbalance, 3),
            "regime": ctx.regime,
            "recent_signals": ctx.recent_signals[-5:],
        }, indent=2)

    async def analyze_market(self, ctx: MarketContext) -> LLMAnalysis:
        """Analyze market conditions using LLM."""
        cache_key = f"{ctx.symbol}_{int(ctx.price)}"
        now = time.time()

        # Check cache
        if cache_key in self._cache:
            cached_time, cached_result = self._cache[cache_key]
            if now - cached_time < self.config.cache_ttl_seconds:
                self._cache.move_to_end(cache_key)
                cached_result.cached = True
                return cached_result
            else:
                del self._cache[cache_key]

        # Evict oldest entries (LRU) to prevent unbounded cache growth
        while len(self._cache) > 100:
            self._cache.popitem(last=False)

        if self.config.provider == "none" or not self.config.api_key:
            return self._rule_based_analysis(ctx)

        prompt_template = self._load_prompt("market_analysis")
        prompt = prompt_template.replace("{context}", self._build_context_str(ctx))

        try:
            response = await self._call_llm(prompt)
            analysis = self._parse_response(response, ctx.symbol)
            self._cache[cache_key] = (now, analysis)
            self._request_count += 1
            return analysis
        except (RuntimeError, OSError, ValueError, KeyError) as e:
            self._error_count += 1
            logger.error("[LLMEngine] Analysis failed: %s", e)
            return self._rule_based_analysis(ctx)

    async def explain_signal(self, symbol: str, direction: str, price: float,
                              rsi: float, adx: float, ema_trend: str) -> str:
        """Generate natural language explanation for a signal."""
        if self.config.provider == "none" or not self.config.api_key:
            return self._rule_based_explanation(direction, price, rsi, adx, ema_trend)

        template = self._load_prompt("signal_explanation")
        prompt = (template
                  .replace("{direction}", direction)
                  .replace("{symbol}", symbol)
                  .replace("{price}", str(price))
                  .replace("{rsi}", str(round(rsi, 1)))
                  .replace("{adx}", str(round(adx, 1)))
                  .replace("{ema_trend}", ema_trend))

        try:
            response = await self._call_llm(prompt)
            return response.strip()
        except (RuntimeError, OSError, ValueError, KeyError) as e:
            logger.error("[LLMEngine] Explain failed: %s", e)
            return self._rule_based_explanation(direction, price, rsi, adx, ema_trend)

    async def assess_risk(self, symbol: str, direction: str, price: float,
                          atr: float, leverage: int) -> dict:
        """Assess risk of a potential position."""
        if self.config.provider == "none" or not self.config.api_key:
            return self._rule_based_risk(atr, leverage, price)

        template = self._load_prompt("risk_assessment")
        prompt = (template
                  .replace("{direction}", direction)
                  .replace("{symbol}", symbol)
                  .replace("{price}", str(price))
                  .replace("{atr}", str(round(atr, 4)))
                  .replace("{leverage}", str(leverage)))

        try:
            response = await self._call_llm(prompt)
            return {"assessment": response.strip(), "source": "llm"}
        except (RuntimeError, OSError, ValueError, KeyError) as e:
            logger.error("[LLMEngine] Risk assessment failed: %s", e)
            return self._rule_based_risk(atr, leverage, price)

    async def _call_llm(self, prompt: str) -> str:
        """Call the LLM API (rate-limited)."""
        if not self._session or not AIOHTTP_AVAILABLE:
            raise RuntimeError("HTTP session not available")

        async with self._rate_limiter:
            if self.config.provider == "openai":
                url = self.config.base_url or "https://api.openai.com/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {self.config.api_key.get()}",
                    "Content-Type": "application/json",
                }
                payload = {
                    "model": self.config.model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": self.config.max_tokens,
                    "temperature": self.config.temperature,
                }
            elif self.config.provider == "anthropic":
                url = "https://api.anthropic.com/v1/messages"
                headers = {
                    "x-api-key": self.config.api_key.get(),
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                }
                payload = {
                    "model": self.config.model,
                    "max_tokens": self.config.max_tokens,
                    "messages": [{"role": "user", "content": prompt}],
                }
            elif self.config.provider == "ollama":
                url = self.config.base_url or "http://localhost:11434/api/generate"
                headers = {"Content-Type": "application/json"}
                payload = {
                    "model": self.config.model,
                    "prompt": prompt,
                    "stream": False,
                }
            else:
                raise ValueError(f"Unknown provider: {self.config.provider}")

            async with self._session.post(url, json=payload, headers=headers) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    raise RuntimeError(f"LLM API error {resp.status}: {text}")
                data = await resp.json()

                if self.config.provider == "openai":
                    return data["choices"][0]["message"]["content"]
                elif self.config.provider == "anthropic":
                    return data["content"][0]["text"]
                elif self.config.provider == "ollama":
                    return data.get("response", "")
                return str(data)

    def _parse_response(self, response: str, symbol: str) -> LLMAnalysis:
        """Parse LLM response into LLMAnalysis with schema validation."""
        try:
            data = None
            json_block = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response, re.DOTALL)
            if json_block:
                data = json.loads(json_block.group(1))
            if data is None:
                start = response.find("{")
                end = response.rfind("}") + 1
                if start >= 0 and end > start:
                    data = json.loads(response[start:end])
            if data is None:
                raise ValueError("No JSON found in response")
            # Validate schema fields
            sentiment = str(data.get("sentiment", "neutral")).lower()
            if sentiment not in ("bullish", "bearish", "neutral"):
                sentiment = "neutral"
            confidence = float(data.get("confidence", 50))
            confidence = max(0.0, min(100.0, confidence))
            recommendation = str(data.get("recommendation", "hold")).lower()
            if recommendation not in ("buy", "sell", "hold"):
                recommendation = "hold"
            return LLMAnalysis(
                symbol=symbol,
                summary=str(data.get("summary", response[:200])),
                sentiment=sentiment,
                confidence=confidence,
                key_levels=data.get("key_levels", {}),
                risk_factors=data.get("risk_factors", []),
                recommendation=recommendation,
            )
        except (json.JSONDecodeError, ValueError, TypeError) as e:
            logger.warning("[LLMEngine] Response validation failed: %s", e)

        return LLMAnalysis(
            symbol=symbol,
            summary=response[:500],
            sentiment="neutral",
            confidence=50.0,
            recommendation="hold",
        )

    def _rule_based_analysis(self, ctx: MarketContext) -> LLMAnalysis:
        """Fallback rule-based analysis when LLM is unavailable."""
        bullish = (
            ctx.rsi < 70 and
            ctx.ema_fast > ctx.ema_slow and
            ctx.adx > 25 and
            ctx.order_book_imbalance > 0.1
        )
        bearish = (
            ctx.rsi > 30 and
            ctx.ema_fast < ctx.ema_slow and
            ctx.adx > 25 and
            ctx.order_book_imbalance < -0.1
        )

        if bullish:
            sentiment = "bullish"
            confidence = min(80, 40 + ctx.adx * 0.5)
            recommendation = "buy"
            summary = f"{ctx.symbol} shows bullish momentum: EMA bullish cross, ADX={ctx.adx:.1f}, RSI={ctx.rsi:.1f}"
        elif bearish:
            sentiment = "bearish"
            confidence = min(80, 40 + ctx.adx * 0.5)
            recommendation = "sell"
            summary = f"{ctx.symbol} shows bearish momentum: EMA bearish cross, ADX={ctx.adx:.1f}, RSI={ctx.rsi:.1f}"
        else:
            sentiment = "neutral"
            confidence = 30.0
            recommendation = "hold"
            summary = f"{ctx.symbol} is in consolidation: RSI={ctx.rsi:.1f}, ADX={ctx.adx:.1f}, regime={ctx.regime}"

        risk_factors = []
        if ctx.price > 0 and ctx.atr / ctx.price > 0.03:
            risk_factors.append("High volatility (ATR > 3% of price)")
        if abs(ctx.order_book_imbalance) > 0.5:
            risk_factors.append("Extreme order book imbalance — possible reversal risk")
        if ctx.bollinger_pos > 2.0 or ctx.bollinger_pos < -2.0:
            risk_factors.append("Price outside Bollinger Bands — mean reversion likely")

        return LLMAnalysis(
            symbol=ctx.symbol,
            summary=summary,
            sentiment=sentiment,
            confidence=confidence,
            key_levels={
                "support": ctx.price - 2 * ctx.atr,
                "resistance": ctx.price + 2 * ctx.atr,
            },
            risk_factors=risk_factors,
            recommendation=recommendation,
        )

    def _rule_based_explanation(self, direction: str, price: float,
                                 rsi: float, adx: float, ema_trend: str) -> str:
        if direction == "LONG":
            return (f"Bullish signal: EMA trend is {ema_trend}, RSI at {rsi:.1f} suggests "
                    f"room to grow, ADX={adx:.1f} confirms trend strength. Entry at ${price:.2f}.")
        elif direction == "SHORT":
            return (f"Bearish signal: EMA trend is {ema_trend}, RSI at {rsi:.1f} suggests "
                    f"overbought conditions, ADX={adx:.1f} confirms trend strength. Entry at ${price:.2f}.")
        return f"Neutral signal at ${price:.2f}. No clear directional bias."

    def _rule_based_risk(self, atr: float, leverage: int, price: float) -> dict:
        vol_pct = (atr / price) * 100 if price > 0 else 0
        risk_level = "low" if vol_pct < 1.5 else "medium" if vol_pct < 3.0 else "high"
        suggested_size = 1.0 / max(leverage, 1) * (0.02 / max(vol_pct / 100, 0.005))
        return {
            "risk_level": risk_level,
            "volatility_pct": round(vol_pct, 2),
            "suggested_position_size_pct": round(min(suggested_size * 100, 20), 2),
            "max_leverage": min(int(3.0 / max(vol_pct, 0.5)), 10),
            "source": "rule_based",
        }

    def get_stats(self) -> dict:
        return {
            "provider": self.config.provider,
            "model": self.config.model,
            "enabled": self.config.enabled and bool(self.config.api_key),
            "request_count": self._request_count,
            "error_count": self._error_count,
            "cache_size": len(self._cache),
        }
