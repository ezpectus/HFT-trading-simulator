"""Tests for signal validator."""
import time
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from src.signal_validation.validator import SignalValidator, ValidationResult
from src.strategies.strategies import Signal, SignalDirection


def make_signal(symbol="BTC/USDT", direction=SignalDirection.LONG,
                confidence=80, entry=100, sl=95, tp=115):
    return Signal(symbol, direction, confidence, "test", entry, sl, tp)


class TestSignalValidator:
    def setup_method(self):
        self.validator = SignalValidator(
            min_confidence=65,
            min_rr_ratio=1.5,
            max_drawdown_pct=8.0,
            max_open_positions=3,
        )

    def test_valid_signal_passes(self):
        sig = make_signal()
        result = self.validator.validate(sig, account_balance=10000)
        assert result.passed

    def test_low_confidence_rejected(self):
        sig = make_signal(confidence=50)
        result = self.validator.validate(sig, account_balance=10000)
        assert not result.passed
        assert "Confidence" in result.reason

    def test_low_rr_rejected(self):
        sig = make_signal(entry=100, sl=95, tp=97)
        result = self.validator.validate(sig, account_balance=10000)
        assert not result.passed
        assert "R:R" in result.reason

    def test_max_positions_rejected(self):
        self.validator.update_position_count(3)
        sig = make_signal()
        result = self.validator.validate(sig, account_balance=10000)
        assert not result.passed
        assert "positions" in result.reason.lower()

    def test_neutral_rejected(self):
        sig = make_signal(direction=SignalDirection.NEUTRAL, confidence=0,
                          entry=0, sl=0, tp=0)
        result = self.validator.validate(sig, account_balance=10000)
        assert not result.passed

    def test_drawdown_rejected(self):
        self.validator.update_pnl(-900)  # 9% of 10000
        sig = make_signal()
        result = self.validator.validate(sig, account_balance=10000)
        assert not result.passed
        assert "drawdown" in result.reason.lower()


class TestDuplicateCooldown:
    def setup_method(self):
        self.validator = SignalValidator(
            min_confidence=65,
            min_rr_ratio=1.5,
            max_drawdown_pct=8.0,
            max_open_positions=3,
        )

    def test_duplicate_signal_within_cooldown_rejected(self):
        sig = make_signal(symbol="BTC/USDT")
        result1 = self.validator.validate(sig, account_balance=10000)
        assert result1.passed
        # Same symbol immediately after → rejected
        sig2 = make_signal(symbol="BTC/USDT")
        result2 = self.validator.validate(sig2, account_balance=10000)
        assert not result2.passed
        assert "Duplicate" in result2.reason or "cooldown" in result2.reason.lower()

    def test_different_symbol_not_blocked_by_cooldown(self):
        sig1 = make_signal(symbol="BTC/USDT")
        self.validator.validate(sig1, account_balance=10000)
        sig2 = make_signal(symbol="ETH/USDT")
        result2 = self.validator.validate(sig2, account_balance=10000)
        assert result2.passed

    def test_cooldown_expires_after_5_minutes(self):
        sig1 = make_signal(symbol="BTC/USDT")
        self.validator.validate(sig1, account_balance=10000)
        # Patch datetime to simulate 6 minutes later
        future = datetime.now() + timedelta(minutes=6)
        with patch('src.signal_validation.validator.datetime') as mock_dt:
            mock_dt.now.return_value = future
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            sig2 = make_signal(symbol="BTC/USDT")
            result2 = self.validator.validate(sig2, account_balance=10000)
        assert result2.passed


class TestResetDaily:
    def setup_method(self):
        self.validator = SignalValidator(
            min_confidence=65,
            min_rr_ratio=1.5,
            max_drawdown_pct=8.0,
            max_open_positions=3,
        )

    def test_reset_daily_clears_pnl(self):
        self.validator.update_pnl(-500)
        self.validator.reset_daily()
        # After reset, drawdown should not trigger
        sig = make_signal()
        result = self.validator.validate(sig, account_balance=10000)
        assert result.passed

    def test_reset_daily_updates_reset_time(self):
        old_reset = self.validator._daily_reset
        time.sleep(0.01)
        self.validator.reset_daily()
        assert self.validator._daily_reset > old_reset


class TestUpdatePnl:
    def setup_method(self):
        self.validator = SignalValidator(
            min_confidence=65,
            min_rr_ratio=1.5,
            max_drawdown_pct=8.0,
            max_open_positions=3,
        )

    def test_positive_pnl_does_not_trigger_drawdown(self):
        self.validator.update_pnl(500)  # Profit, not loss
        sig = make_signal()
        result = self.validator.validate(sig, account_balance=10000)
        assert result.passed

    def test_pnl_accumulates(self):
        self.validator.update_pnl(-300)
        self.validator.update_pnl(-300)
        # Total: -600 = 6% of 10000, below 8% threshold
        sig = make_signal()
        result = self.validator.validate(sig, account_balance=10000)
        assert result.passed

    def test_pnl_accumulates_to_drawdown(self):
        self.validator.update_pnl(-400)
        self.validator.update_pnl(-500)
        # Total: -900 = 9% of 10000, above 8% threshold
        sig = make_signal()
        result = self.validator.validate(sig, account_balance=10000)
        assert not result.passed
        assert "drawdown" in result.reason.lower()


class TestPositionCount:
    def setup_method(self):
        self.validator = SignalValidator(
            min_confidence=65,
            min_rr_ratio=1.5,
            max_drawdown_pct=8.0,
            max_open_positions=3,
        )

    def test_below_max_passes(self):
        self.validator.update_position_count(2)
        sig = make_signal()
        result = self.validator.validate(sig, account_balance=10000)
        assert result.passed

    def test_at_max_rejected(self):
        self.validator.update_position_count(3)
        sig = make_signal()
        result = self.validator.validate(sig, account_balance=10000)
        assert not result.passed

    def test_above_max_rejected(self):
        self.validator.update_position_count(5)
        sig = make_signal()
        result = self.validator.validate(sig, account_balance=10000)
        assert not result.passed

    def test_zero_positions_passes(self):
        self.validator.update_position_count(0)
        sig = make_signal()
        result = self.validator.validate(sig, account_balance=10000)
        assert result.passed


class TestCustomConfig:
    def test_custom_min_confidence(self):
        validator = SignalValidator(min_confidence=90)
        sig = make_signal(confidence=85)
        result = validator.validate(sig, account_balance=10000)
        assert not result.passed
        assert "Confidence" in result.reason

    def test_custom_min_rr(self):
        validator = SignalValidator(min_rr_ratio=3.0)
        # R:R = (115-100)/(100-95) = 15/5 = 3.0 → exactly at threshold
        sig = make_signal(entry=100, sl=95, tp=115)
        result = validator.validate(sig, account_balance=10000)
        assert result.passed  # 3.0 >= 3.0

    def test_custom_max_drawdown(self):
        validator = SignalValidator(max_drawdown_pct=5.0)
        validator.update_pnl(-600)  # 6% of 10000
        sig = make_signal()
        result = validator.validate(sig, account_balance=10000)
        assert not result.passed
        assert "drawdown" in result.reason.lower()

    def test_custom_max_positions(self):
        validator = SignalValidator(max_open_positions=1)
        validator.update_position_count(1)
        sig = make_signal()
        result = validator.validate(sig, account_balance=10000)
        assert not result.passed


class TestValidationResult:
    def setup_method(self):
        self.validator = SignalValidator(
            min_confidence=65,
            min_rr_ratio=1.5,
            max_drawdown_pct=8.0,
            max_open_positions=3,
        )

    def test_result_has_signal_field(self):
        sig = make_signal()
        result = self.validator.validate(sig, account_balance=10000)
        assert result.signal is sig

    def test_result_passed_true_for_valid(self):
        sig = make_signal()
        result = self.validator.validate(sig, account_balance=10000)
        assert result.passed is True

    def test_result_passed_false_for_invalid(self):
        sig = make_signal(confidence=10)
        result = self.validator.validate(sig, account_balance=10000)
        assert result.passed is False

    def test_result_reason_is_string(self):
        sig = make_signal()
        result = self.validator.validate(sig, account_balance=10000)
        assert isinstance(result.reason, str)


class TestShortSignals:
    def setup_method(self):
        self.validator = SignalValidator(
            min_confidence=65,
            min_rr_ratio=1.5,
            max_drawdown_pct=8.0,
            max_open_positions=3,
        )

    def test_valid_short_signal_passes(self):
        sig = make_signal(direction=SignalDirection.SHORT,
                          entry=100, sl=108, tp=88)
        # R:R = (100-88)/(108-100) = 12/8 = 1.5
        result = self.validator.validate(sig, account_balance=10000)
        assert result.passed

    def test_short_low_rr_rejected(self):
        sig = make_signal(direction=SignalDirection.SHORT,
                          entry=100, sl=108, tp=99)
        # R:R = (100-99)/(108-100) = 1/8 = 0.125
        result = self.validator.validate(sig, account_balance=10000)
        assert not result.passed
        assert "R:R" in result.reason


class TestZeroBalance:
    def setup_method(self):
        self.validator = SignalValidator(
            min_confidence=65,
            min_rr_ratio=1.5,
            max_drawdown_pct=8.0,
            max_open_positions=3,
        )

    def test_zero_balance_no_drawdown_division_error(self):
        self.validator.update_pnl(-500)
        sig = make_signal()
        # Should not raise ZeroDivisionError
        result = self.validator.validate(sig, account_balance=0)
        assert result.passed  # No drawdown check with 0 balance

