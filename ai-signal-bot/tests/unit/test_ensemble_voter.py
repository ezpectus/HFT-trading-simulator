"""Tests for EnsembleVoter — majority/weighted voting."""
import pytest

from src.strategies.signal import Signal, SignalDirection
from src.strategies.strategies import EnsembleVoter


def make_signal(direction=SignalDirection.LONG, confidence=70, symbol="BTC/USDT",
                strategy="test", entry=65000, sl=63000, tp=70000):
    return Signal(
        symbol=symbol, direction=direction, confidence=confidence,
        strategy=strategy, entry_price=entry, stop_loss=sl, take_profit=tp,
    )


class TestEnsembleVoterMajority:
    def test_majority_long(self):
        voter = EnsembleVoter(mode="majority", min_votes=2)
        signals = [
            make_signal(SignalDirection.LONG, 70, strategy="trend"),
            make_signal(SignalDirection.LONG, 65, strategy="mean"),
            make_signal(SignalDirection.SHORT, 60, strategy="breakout"),
        ]
        result = voter.vote(signals)
        assert result.direction == SignalDirection.LONG
        assert result.confidence == pytest.approx(67.5, rel=0.1)
        assert "ensemble" in result.strategy.lower() or result.strategy == "ensemble"

    def test_majority_short(self):
        voter = EnsembleVoter(mode="majority", min_votes=2)
        signals = [
            make_signal(SignalDirection.SHORT, 70, strategy="trend"),
            make_signal(SignalDirection.SHORT, 65, strategy="mean"),
            make_signal(SignalDirection.LONG, 60, strategy="breakout"),
        ]
        result = voter.vote(signals)
        assert result.direction == SignalDirection.SHORT

    def test_split_vote_neutral(self):
        voter = EnsembleVoter(mode="majority", min_votes=2)
        signals = [
            make_signal(SignalDirection.LONG, 70, strategy="trend"),
            make_signal(SignalDirection.SHORT, 65, strategy="mean"),
        ]
        result = voter.vote(signals)
        assert result.direction == SignalDirection.NEUTRAL
        assert "Split" in result.reason

    def test_insufficient_votes(self):
        voter = EnsembleVoter(mode="majority", min_votes=3)
        signals = [
            make_signal(SignalDirection.LONG, 70, strategy="trend"),
            make_signal(SignalDirection.LONG, 65, strategy="mean"),
        ]
        result = voter.vote(signals)
        assert result.direction == SignalDirection.NEUTRAL
        assert "Insufficient" in result.reason or "Split" in result.reason

    def test_no_actionable_signals(self):
        voter = EnsembleVoter(mode="majority", min_votes=2)
        signals = [
            make_signal(SignalDirection.NEUTRAL, 0, strategy="trend"),
            make_signal(SignalDirection.NEUTRAL, 0, strategy="mean"),
        ]
        result = voter.vote(signals)
        assert result.direction == SignalDirection.NEUTRAL
        assert "No actionable" in result.reason

    def test_empty_signals(self):
        voter = EnsembleVoter(mode="majority", min_votes=2)
        result = voter.vote([])
        assert result.direction == SignalDirection.NEUTRAL


class TestEnsembleVoterWeighted:
    def test_weighted_long_wins(self):
        voter = EnsembleVoter(mode="weighted", min_votes=2)
        signals = [
            make_signal(SignalDirection.LONG, 90, strategy="trend"),
            make_signal(SignalDirection.LONG, 60, strategy="mean"),
            make_signal(SignalDirection.SHORT, 70, strategy="breakout"),
        ]
        result = voter.vote(signals)
        assert result.direction == SignalDirection.LONG

    def test_weighted_short_wins(self):
        voter = EnsembleVoter(mode="weighted", min_votes=2)
        signals = [
            make_signal(SignalDirection.LONG, 60, strategy="trend"),
            make_signal(SignalDirection.SHORT, 90, strategy="mean"),
            make_signal(SignalDirection.SHORT, 80, strategy="breakout"),
        ]
        result = voter.vote(signals)
        assert result.direction == SignalDirection.SHORT

    def test_weighted_tie_neutral(self):
        voter = EnsembleVoter(mode="weighted", min_votes=2)
        signals = [
            make_signal(SignalDirection.LONG, 70, strategy="trend"),
            make_signal(SignalDirection.SHORT, 70, strategy="mean"),
        ]
        result = voter.vote(signals)
        assert result.direction == SignalDirection.NEUTRAL


class TestEnsembleVoterAggregation:
    def test_avg_confidence(self):
        voter = EnsembleVoter(mode="majority", min_votes=2)
        signals = [
            make_signal(SignalDirection.LONG, 80, strategy="trend"),
            make_signal(SignalDirection.LONG, 60, strategy="mean"),
        ]
        result = voter.vote(signals)
        assert result.confidence == pytest.approx(70.0, rel=0.1)

    def test_avg_entry_price(self):
        voter = EnsembleVoter(mode="majority", min_votes=2)
        signals = [
            make_signal(SignalDirection.LONG, 70, entry=65000, strategy="trend"),
            make_signal(SignalDirection.LONG, 70, entry=66000, strategy="mean"),
        ]
        result = voter.vote(signals)
        assert result.entry_price == pytest.approx(65500, rel=0.1)

    def test_reason_contains_strategy_names(self):
        voter = EnsembleVoter(mode="majority", min_votes=2)
        signals = [
            make_signal(SignalDirection.LONG, 70, strategy="trend"),
            make_signal(SignalDirection.LONG, 70, strategy="mean"),
        ]
        result = voter.vote(signals)
        assert "trend" in result.reason
        assert "mean" in result.reason


