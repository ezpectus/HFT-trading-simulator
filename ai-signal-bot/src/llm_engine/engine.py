"""LLM Engine — AI-powered market analysis and signal generation.

Uses LLM APIs (OpenAI/Anthropic/local) to analyze market conditions,
generate trading insights, and provide natural language explanations
for signals. Falls back to rule-based analysis if no API key configured.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from collections import OrderedDict
from typing import Any  # Any: aiohttp.ClientSession lacks type stubs

from src.llm_engine.llm_types import (
    LLMAnalysis,
    LLMConfig,
    MarketContext,
    SecretStr,
)
from src.llm_engine.rule_based import (
    parse_llm_response,
    rule_based_analysis,
    rule_based_explanation,
    rule_based_risk,
)
from src.observability.logging import get_logger

logger = get_logger(__name__)

try:
    import aiohttp
    AIOHTTP_AVAILABLE = True
except ImportError:
    AIOHTTP_AVAILABLE = False


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
            with open(path, encoding="utf-8") as f:
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
        now = time.monotonic()

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
            return rule_based_analysis(ctx)

        prompt_template = self._load_prompt("market_analysis")
        prompt = prompt_template.replace("{context}", self._build_context_str(ctx))

        try:
            response = await self._call_llm(prompt)
            analysis = parse_llm_response(response, ctx.symbol)
            self._cache[cache_key] = (now, analysis)
            self._request_count += 1
            return analysis
        except (RuntimeError, OSError, ValueError, KeyError) as e:
            self._error_count += 1
            logger.error("[LLMEngine] Analysis failed: %s", e)
            return rule_based_analysis(ctx)

    async def explain_signal(self, symbol: str, direction: str, price: float,
                              rsi: float, adx: float, ema_trend: str) -> str:
        """Generate natural language explanation for a signal."""
        if self.config.provider == "none" or not self.config.api_key:
            return rule_based_explanation(direction, price, rsi, adx, ema_trend)

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
            return rule_based_explanation(direction, price, rsi, adx, ema_trend)

    async def assess_risk(self, symbol: str, direction: str, price: float,
                          atr: float, leverage: int) -> dict:
        """Assess risk of a potential position."""
        if self.config.provider == "none" or not self.config.api_key:
            return rule_based_risk(atr, leverage, price)

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
            return rule_based_risk(atr, leverage, price)

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


    def get_stats(self) -> dict:
        return {
            "provider": self.config.provider,
            "model": self.config.model,
            "enabled": self.config.enabled and bool(self.config.api_key),
            "request_count": self._request_count,
            "error_count": self._error_count,
            "cache_size": len(self._cache),
        }
