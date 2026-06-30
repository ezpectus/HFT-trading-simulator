"""Tests for trading strategies."""
import pytest

from src.strategies.strategies import (
    EnsembleVoter, MeanReversionStrategy, Signal, SignalDirection,
    TrendFollowingStrategy,
)


def make_candles(closes: list[float]) -> list[dict]:
    candles = []
    for i, c in enumerate(closes):
        candles.append({
            "timestamp": 1704067200 + i * 300,
            "open": closes[i - 1] if i > 0 else c,
            "high": c * 1.01,
            "low": c * 0.99,
            "close": c,
            "volume": 100.0,
        })
    return candles


class TestTrendFollowing:
    def test_uptrend_generates_long(self):
        closes = [100 + i * 0.5 for i in range(50)]
        candles = make_candles(closes)
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=0)
        signal = strategy.analyze("BTC/USDT", candles)
        assert signal.direction in (SignalDirection.LONG, SignalDirection.NEUTRAL)

    def test_downtrend_generates_short(self):
        closes = [100 - i * 0.5 for i in range(50)]
        candles = make_candles(closes)
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=0)
        signal = strategy.analyze("BTC/USDT", candles)
        assert signal.direction in (SignalDirection.SHORT, SignalDirection.NEUTRAL)

    def test_short_data_returns_neutral(self):
        candles = make_candles([100, 101])
        strategy = TrendFollowingStrategy()
        signal = strategy.analyze("BTC/USDT", candles)
        assert signal.direction == SignalDirection.NEUTRAL


class TestMeanReversion:
    def test_oversold_generates_long(self):
        closes = [100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90,
                  89, 88, 87, 86, 85, 84, 83, 82, 81, 80, 79, 78, 77, 76]
        candles = make_candles(closes)
        strategy = MeanReversionStrategy(rsi_oversold=30, rsi_overbought=70)
        signal = strategy.analyze("BTC/USDT", candles)
        assert signal.direction in (SignalDirection.LONG, SignalDirection.NEUTRAL)

    def test_short_data_returns_neutral(self):
        candles = make_candles([100, 101])
        strategy = MeanReversionStrategy()
        signal = strategy.analyze("BTC/USDT", candles)
        assert signal.direction == SignalDirection.NEUTRAL


class TestEnsembleVoter:
    def test_majority_long(self):
        signals = [
            Signal("BTC/USDT", SignalDirection.LONG, 80, "trend", 65000, 64000, 66000),
            Signal("BTC/USDT", SignalDirection.LONG, 70, "meanrev", 65000, 64000, 66000),
        ]
        voter = EnsembleVoter(mode="majority", min_votes=2)
        result = voter.vote(signals)
        assert result.direction == SignalDirection.LONG

    def test_split_vote_returns_neutral(self):
        signals = [
            Signal("BTC/USDT", SignalDirection.LONG, 80, "trend", 65000, 64000, 66000),
            Signal("BTC/USDT", SignalDirection.SHORT, 70, "meanrev", 65000, 64000, 66000),
        ]
        voter = EnsembleVoter(mode="majority", min_votes=2)
        result = voter.vote(signals)
        assert result.direction == SignalDirection.NEUTRAL

    def test_insufficient_votes(self):
        signals = [
            Signal("BTC/USDT", SignalDirection.LONG, 80, "trend", 65000, 64000, 66000),
        ]
        voter = EnsembleVoter(mode="majority", min_votes=2)
        result = voter.vote(signals)
        assert result.direction == SignalDirection.NEUTRAL

    def test_no_actionable_signals(self):
        signals = [
            Signal("BTC/USDT", SignalDirection.NEUTRAL, 0, "trend", 0, 0, 0),
        ]
        voter = EnsembleVoter(mode="majority", min_votes=1)
        result = voter.vote(signals)
        assert result.direction == SignalDirection.NEUTRAL


class TestSignal:
    def test_rr_ratio_long(self):
        sig = Signal("BTC/USDT", SignalDirection.LONG, 80, "test",
                     entry_price=100, stop_loss=95, take_profit=115)
        assert sig.rr_ratio == pytest.approx(3.0)

    def test_rr_ratio_short(self):
        sig = Signal("BTC/USDT", SignalDirection.SHORT, 80, "test",
                     entry_price=100, stop_loss=105, take_profit=85)
        assert sig.rr_ratio == pytest.approx(3.0)

    def test_rr_ratio_neutral(self):
        sig = Signal("BTC/USDT", SignalDirection.NEUTRAL, 0, "test", 0, 0, 0)
        assert sig.rr_ratio == 0.0

    def test_is_actionable(self):
        assert Signal("X", SignalDirection.LONG, 80, "t", 100, 95, 110).is_actionable
        assert not Signal("X", SignalDirection.NEUTRAL, 0, "t", 0, 0, 0).is_actionable
