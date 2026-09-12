"""Rule-based fallback analysis + LLM response parsing.

Extracted from engine.py (S014): pure functions — no engine state —
used when the LLM provider is unavailable or returns malformed output.
"""
import json
import re

from src.llm_engine.llm_types import LLMAnalysis, MarketContext
from src.observability.logging import get_logger

logger = get_logger(__name__)


def parse_llm_response(response: str, symbol: str) -> LLMAnalysis:
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


def rule_based_analysis(ctx: MarketContext) -> LLMAnalysis:
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


def rule_based_explanation(direction: str, price: float,
                           rsi: float, adx: float, ema_trend: str) -> str:
    if direction == "LONG":
        return (f"Bullish signal: EMA trend is {ema_trend}, RSI at {rsi:.1f} suggests "
                f"room to grow, ADX={adx:.1f} confirms trend strength. Entry at ${price:.2f}.")
    elif direction == "SHORT":
        return (f"Bearish signal: EMA trend is {ema_trend}, RSI at {rsi:.1f} suggests "
                f"overbought conditions, ADX={adx:.1f} confirms trend strength. Entry at ${price:.2f}.")
    return f"Neutral signal at ${price:.2f}. No clear directional bias."


def rule_based_risk(atr: float, leverage: int, price: float) -> dict:
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
