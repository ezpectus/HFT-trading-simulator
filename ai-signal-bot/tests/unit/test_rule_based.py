"""Contract tests for llm_engine.rule_based — fallback analysis + response parsing."""
from src.llm_engine.llm_types import MarketContext
from src.llm_engine.rule_based import (
    parse_llm_response,
    rule_based_analysis,
    rule_based_explanation,
    rule_based_risk,
)


class TestParseLlmResponse:
    def test_parses_fenced_json(self):
        r = parse_llm_response('```json\n{"sentiment":"bullish","confidence":80,"recommendation":"buy","summary":"up"}\n```', "BTC")
        assert r.sentiment == "bullish"
        assert r.confidence == 80.0
        assert r.recommendation == "buy"
        assert r.symbol == "BTC"

    def test_parses_bare_json(self):
        r = parse_llm_response('blah {"sentiment":"bearish"} tail', "ETH")
        assert r.sentiment == "bearish"

    def test_invalid_sentiment_normalized(self):
        r = parse_llm_response('{"sentiment":"ultrabullish"}', "BTC")
        assert r.sentiment == "neutral"

    def test_confidence_clamped(self):
        r = parse_llm_response('{"confidence": 250}', "BTC")
        assert r.confidence == 100.0

    def test_garbage_returns_neutral_fallback(self):
        r = parse_llm_response("no json here at all", "BTC")
        assert r.sentiment == "neutral"
        assert r.confidence == 50.0
        assert r.recommendation == "hold"
        assert r.summary == "no json here at all"


class TestRuleBasedAnalysis:
    def _ctx(self, **kw):
        base = dict(symbol="BTC/USDT", price=100.0, rsi=50.0, ema_fast=10.0,
                    ema_slow=9.0, adx=30.0, atr=1.0, order_book_imbalance=0.2,
                    bollinger_pos=0.5)
        base.update(kw)
        return MarketContext(**base)

    def test_bullish_conditions(self):
        r = rule_based_analysis(self._ctx())
        assert r.sentiment == "bullish"
        assert r.recommendation == "buy"
        assert r.confidence == min(80, 40 + 30 * 0.5)  # 55

    def test_bearish_conditions(self):
        r = rule_based_analysis(self._ctx(rsi=40, ema_fast=8.0, ema_slow=9.0,
                                        order_book_imbalance=-0.2))
        assert r.sentiment == "bearish"
        assert r.recommendation == "sell"

    def test_neutral_when_no_alignment(self):
        r = rule_based_analysis(self._ctx(adx=10.0))
        assert r.sentiment == "neutral"
        assert r.recommendation == "hold"
        assert r.confidence == 30.0

    def test_high_volatility_risk_factor(self):
        r = rule_based_analysis(self._ctx(atr=4.0))  # 4% of price > 3%
        assert any("volatility" in f.lower() for f in r.risk_factors)

    def test_key_levels_derived_from_atr(self):
        r = rule_based_analysis(self._ctx())
        assert r.key_levels == {"support": 98.0, "resistance": 102.0}


class TestRuleBasedHelpers:
    def test_explanation_direction(self):
        assert "Bullish" in rule_based_explanation("LONG", 100, 60, 30, "up")
        assert "Bearish" in rule_based_explanation("SHORT", 100, 60, 30, "down")
        assert "Neutral" in rule_based_explanation("FLAT", 100, 60, 30, "flat")

    def test_risk_levels(self):
        low = rule_based_risk(atr=0.5, leverage=2, price=100)   # 0.5% vol
        high = rule_based_risk(atr=5.0, leverage=2, price=100)  # 5% vol
        assert low["risk_level"] == "low"
        assert high["risk_level"] == "high"
        assert low["source"] == "rule_based"
        assert high["max_leverage"] <= low["max_leverage"]
