"""Tests for CircuitBreaker — consecutive loss tracking, trip, cooldown, recovery."""
import time
from unittest.mock import patch

import pytest

from src.strategies.strategies import (
    CircuitBreaker,
    Signal,
    SignalDirection,
)


@pytest.fixture
def cb():
    return CircuitBreaker(max_consecutive_losses=3, cooldown_seconds=1.0)


@pytest.fixture
def long_signal():
    return Signal(
        symbol="BTC/USDT", direction=SignalDirection.LONG,
        confidence=80, strategy="trend_following",
        entry_price=65000, stop_loss=63000, take_profit=70000,
        reason="EMA cross",
    )


class TestCircuitBreakerInit:
    def test_defaults(self):
        cb = CircuitBreaker()
        assert cb.max_consecutive_losses == 5
        assert cb.cooldown_seconds == 300.0
        assert cb.is_tripped is False
        assert cb.consecutive_losses == 0

    def test_custom_params(self, cb):
        assert cb.max_consecutive_losses == 3
        assert cb.cooldown_seconds == 1.0


class TestConsecutiveLossTracking:
    def test_win_resets_counter(self, cb):
        cb.on_trade_closed(-10)
        cb.on_trade_closed(-10)
        assert cb.consecutive_losses == 2
        cb.on_trade_closed(50)  # Win resets
        assert cb.consecutive_losses == 0

    def test_loss_increments(self, cb):
        cb.on_trade_closed(-10)
        assert cb.consecutive_losses == 1
        cb.on_trade_closed(-20)
        assert cb.consecutive_losses == 2

    def test_zero_pnl_counts_as_loss(self, cb):
        cb.on_trade_closed(0)
        assert cb.consecutive_losses == 1


class TestTripAndRecovery:
    def test_trips_after_max_losses(self, cb):
        cb.on_trade_closed(-10)
        cb.on_trade_closed(-10)
        assert cb.is_tripped is False
        cb.on_trade_closed(-10)  # 3rd loss → trip
        assert cb.is_tripped is True

    def test_does_not_trip_below_threshold(self, cb):
        cb.on_trade_closed(-10)
        cb.on_trade_closed(-10)
        assert cb.is_tripped is False

    def test_auto_recovers_after_cooldown(self, cb):
        cb.on_trade_closed(-10)
        cb.on_trade_closed(-10)
        cb.on_trade_closed(-10)
        assert cb.is_tripped is True

        # Patch time to simulate cooldown passing
        with patch('src.strategies.strategies.time.time', return_value=cb._trip_time + 2.0):
            assert cb.is_tripped is False
        assert cb.consecutive_losses == 0

    def test_does_not_recover_before_cooldown(self, cb):
        cb.on_trade_closed(-10)
        cb.on_trade_closed(-10)
        cb.on_trade_closed(-10)
        assert cb.is_tripped is True

        with patch('src.strategies.strategies.time.time', return_value=cb._trip_time + 0.5):
            assert cb.is_tripped is True

    def test_manual_reset(self, cb):
        cb.on_trade_closed(-10)
        cb.on_trade_closed(-10)
        cb.on_trade_closed(-10)
        assert cb.is_tripped is True
        cb.reset()
        assert cb.is_tripped is False
        assert cb.consecutive_losses == 0


class TestSignalFiltering:
    def test_tripped_forces_neutral(self, cb, long_signal):
        cb.on_trade_closed(-10)
        cb.on_trade_closed(-10)
        cb.on_trade_closed(-10)
        assert cb.is_tripped is True

        filtered = cb.filter_signal(long_signal)
        assert filtered.direction == SignalDirection.NEUTRAL
        assert filtered.confidence == 0
        assert "Circuit breaker" in filtered.reason

    def test_not_tripped_passes_through(self, cb, long_signal):
        filtered = cb.filter_signal(long_signal)
        assert filtered.direction == SignalDirection.LONG
        assert filtered.confidence == 80
        assert filtered.reason == "EMA cross"

    def test_preserves_symbol_and_strategy(self, cb, long_signal):
        cb.on_trade_closed(-10)
        cb.on_trade_closed(-10)
        cb.on_trade_closed(-10)
        filtered = cb.filter_signal(long_signal)
        assert filtered.symbol == "BTC/USDT"
        assert filtered.strategy == "trend_following"


class TestEdgeCases:
    def test_multiple_trips(self, cb):
        # First trip
        cb.on_trade_closed(-10)
        cb.on_trade_closed(-10)
        cb.on_trade_closed(-10)
        assert cb.is_tripped is True

        # Reset and trip again
        cb.reset()
        cb.on_trade_closed(-10)
        cb.on_trade_closed(-10)
        cb.on_trade_closed(-10)
        assert cb.is_tripped is True

    def test_win_during_tripped_state(self, cb):
        cb.on_trade_closed(-10)
        cb.on_trade_closed(-10)
        cb.on_trade_closed(-10)
        assert cb.is_tripped is True
        # Win during tripped state — should reset counter but not untrip
        cb.on_trade_closed(100)
        assert cb.consecutive_losses == 0
        # Still tripped until cooldown
        assert cb.is_tripped is True
