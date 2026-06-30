"""Tests for signal validator."""
import pytest
import time

from src.signal_validation.validator import SignalValidator
from src.strategies.strategies import Signal, SignalDirection


class TestSignalValidator:
    def setup_method(self):
        self.validator = SignalValidator(
            min_confidence=65,
            min_rr_ratio=1.5,
            max_drawdown_pct=8.0,
            max_open_positions=3,
        )

    def test_valid_signal_passes(self):
        sig = Signal("BTC/USDT", SignalDirection.LONG, 80, "test",
                     entry_price=100, stop_loss=95, take_profit=115)
        result = self.validator.validate(sig, balance=10000)
        assert result.passed

    def test_low_confidence_rejected(self):
        sig = Signal("BTC/USDT", SignalDirection.LONG, 50, "test",
                     entry_price=100, stop_loss=95, take_profit=115)
        result = self.validator.validate(sig, balance=10000)
        assert not result.passed
        assert "Confidence" in result.reason

    def test_low_rr_rejected(self):
        sig = Signal("BTC/USDT", SignalDirection.LONG, 80, "test",
                     entry_price=100, stop_loss=95, take_profit=97)
        result = self.validator.validate(sig, balance=10000)
        assert not result.passed
        assert "R:R" in result.reason

    def test_max_positions_rejected(self):
        self.validator.update_position_count(3)
        sig = Signal("BTC/USDT", SignalDirection.LONG, 80, "test",
                     entry_price=100, stop_loss=95, take_profit=115)
        result = self.validator.validate(sig, balance=10000)
        assert not result.passed
        assert "positions" in result.reason.lower()

    def test_neutral_rejected(self):
        sig = Signal("BTC/USDT", SignalDirection.NEUTRAL, 0, "test", 0, 0, 0)
        result = self.validator.validate(sig, balance=10000)
        assert not result.passed

    def test_drawdown_rejected(self):
        self.validator.update_pnl(-900)  # 9% of 10000
        sig = Signal("BTC/USDT", SignalDirection.LONG, 80, "test",
                     entry_price=100, stop_loss=95, take_profit=115)
        result = self.validator.validate(sig, balance=10000)
        assert not result.passed
        assert "drawdown" in result.reason.lower()
