"""Tests for LatencySimulator — base latency, jitter, spikes, reconnection backoff."""
import numpy as np
import pytest

from exchange_simulator.latency_simulation import (
    EXCHANGE_LATENCY_PROFILES,
    LatencyConfig,
    LatencySimulator,
)


class TestLatencyConfig:
    def test_default_config(self):
        cfg = LatencyConfig()
        assert cfg.base_latency_ms == 50.0
        assert cfg.jitter_sigma_pct == 0.2
        assert cfg.spike_probability == 0.001
        assert cfg.spike_multiplier == 10.0
        assert cfg.reconnect_base_delay_ms == 100.0
        assert cfg.reconnect_max_delay_ms == 30000.0
        assert cfg.reconnect_backoff_factor == 2.0

    def test_custom_config(self):
        cfg = LatencyConfig(base_latency_ms=200.0, spike_probability=0.01)
        assert cfg.base_latency_ms == 200.0
        assert cfg.spike_probability == 0.01

    def test_exchange_profiles_exist(self):
        assert "binance" in EXCHANGE_LATENCY_PROFILES
        assert "okx" in EXCHANGE_LATENCY_PROFILES
        assert "bybit" in EXCHANGE_LATENCY_PROFILES
        assert "simulator" in EXCHANGE_LATENCY_PROFILES

    def test_exchange_profiles_different_latencies(self):
        binance = EXCHANGE_LATENCY_PROFILES["binance"]
        okx = EXCHANGE_LATENCY_PROFILES["okx"]
        bybit = EXCHANGE_LATENCY_PROFILES["bybit"]
        assert binance.base_latency_ms < okx.base_latency_ms
        assert okx.base_latency_ms < bybit.base_latency_ms

    def test_simulator_profile_low_latency(self):
        sim = EXCHANGE_LATENCY_PROFILES["simulator"]
        assert sim.base_latency_ms < 10.0


class TestLatencySimulator:
    def test_initial_state_connected(self):
        ls = LatencySimulator("binance")
        assert ls.is_connected is True
        assert ls.exchange == "binance"

    def test_get_latency_returns_positive(self):
        ls = LatencySimulator("binance")
        latency = ls.get_latency()
        assert latency > 0.0

    def test_get_latency_near_base(self):
        """Average latency should be close to base latency (jitter is zero-mean)."""
        ls = LatencySimulator("binance", LatencyConfig(
            base_latency_ms=50.0, jitter_sigma_pct=0.01, spike_probability=0.0
        ))
        latencies = [ls.get_latency() for _ in range(1000)]
        avg = np.mean(latencies)
        assert 45.0 < avg < 55.0  # Within ±5ms of 50ms base

    def test_latency_minimum_floor(self):
        """Latency should never go below 1.0ms."""
        ls = LatencySimulator("binance", LatencyConfig(
            base_latency_ms=2.0, jitter_sigma_pct=2.0, spike_probability=0.0
        ))
        for _ in range(1000):
            assert ls.get_latency() >= 1.0

    def test_jitter_adds_variance(self):
        """With jitter, latencies should have non-zero variance."""
        ls = LatencySimulator("binance", LatencyConfig(
            base_latency_ms=50.0, jitter_sigma_pct=0.3, spike_probability=0.0
        ))
        latencies = [ls.get_latency() for _ in range(500)]
        assert np.std(latencies) > 1.0

    def test_no_jitter_constant_latency(self):
        """With zero jitter and no spikes, latency should equal base."""
        ls = LatencySimulator("binance", LatencyConfig(
            base_latency_ms=50.0, jitter_sigma_pct=0.0, spike_probability=0.0
        ))
        for _ in range(100):
            assert ls.get_latency() == pytest.approx(50.0)

    def test_spike_increases_latency(self):
        """When spike triggers, latency should be multiplied."""
        ls = LatencySimulator("binance", LatencyConfig(
            base_latency_ms=50.0, jitter_sigma_pct=0.0,
            spike_probability=1.0, spike_multiplier=10.0
        ))
        latency = ls.get_latency()
        assert latency == pytest.approx(500.0)  # 50 * 10

    def test_spike_count_tracked(self):
        ls = LatencySimulator("binance", LatencyConfig(
            base_latency_ms=50.0, jitter_sigma_pct=0.0,
            spike_probability=1.0, spike_multiplier=10.0
        ))
        for _ in range(10):
            ls.get_latency()
        stats = ls.get_stats()
        assert stats["total_spikes"] == 10

    def test_message_count_tracked(self):
        ls = LatencySimulator("binance")
        for _ in range(100):
            ls.get_latency()
        stats = ls.get_stats()
        assert stats["total_messages"] == 100


class TestDisconnectionReconnection:
    def test_disconnect_sets_disconnected(self):
        ls = LatencySimulator("binance")
        ls.disconnect()
        assert ls.is_connected is False

    def test_latency_when_disconnected_returns_reconnect_delay(self):
        ls = LatencySimulator("binance")
        ls.disconnect()
        delay = ls.get_latency()
        # First reconnect delay = base_delay * backoff^0 = 100ms
        assert delay == pytest.approx(100.0)

    def test_reconnect_backoff_exponential(self):
        ls = LatencySimulator("binance")
        ls.disconnect()
        delays = []
        for _ in range(5):
            delays.append(ls.get_latency())
            ls._reconnect_attempts += 1
        # Delays should increase exponentially: 100, 200, 400, 800, 1600
        assert delays[1] > delays[0]
        assert delays[2] > delays[1]
        assert delays[3] > delays[2]

    def test_reconnect_backoff_capped(self):
        ls = LatencySimulator("binance", LatencyConfig(
            reconnect_base_delay_ms=100.0,
            reconnect_max_delay_ms=500.0,
            reconnect_backoff_factor=2.0
        ))
        ls.disconnect()
        ls._reconnect_attempts = 20  # Way beyond cap
        delay = ls.get_latency()
        assert delay <= 500.0

    def test_attempt_reconnect_can_succeed(self):
        ls = LatencySimulator("binance", LatencyConfig(
            reconnect_base_delay_ms=100.0
        ))
        ls.disconnect()
        # With high success probability, should eventually reconnect
        reconnected = False
        for _ in range(50):
            if ls.attempt_reconnect():
                reconnected = True
                break
        assert reconnected is True
        assert ls.is_connected is True

    def test_reconnect_resets_attempts(self):
        ls = LatencySimulator("binance")
        ls.disconnect()
        for _ in range(50):
            if ls.attempt_reconnect():
                break
        assert ls._reconnect_attempts == 0


class TestStatsAndReset:
    def test_get_stats_structure(self):
        ls = LatencySimulator("binance")
        ls.get_latency()
        stats = ls.get_stats()
        assert "exchange" in stats
        assert "connected" in stats
        assert "total_messages" in stats
        assert "total_spikes" in stats
        assert "avg_latency_ms" in stats
        assert "reconnect_attempts" in stats

    def test_avg_latency_calculation(self):
        ls = LatencySimulator("binance", LatencyConfig(
            base_latency_ms=50.0, jitter_sigma_pct=0.0, spike_probability=0.0
        ))
        for _ in range(10):
            ls.get_latency()
        stats = ls.get_stats()
        assert stats["avg_latency_ms"] == pytest.approx(50.0)

    def test_reset_clears_state(self):
        ls = LatencySimulator("binance")
        for _ in range(100):
            ls.get_latency()
        ls.disconnect()
        ls.reset()
        assert ls.is_connected is True
        assert ls._total_messages == 0
        assert ls._total_spikes == 0
        assert ls._total_latency_ms == 0.0
        assert ls._reconnect_attempts == 0

    def test_custom_exchange_uses_default_config(self):
        ls = LatencySimulator("unknown_exchange")
        assert ls.config.base_latency_ms == 50.0  # Default

    def test_custom_config_overrides_profile(self):
        custom = LatencyConfig(base_latency_ms=999.0)
        ls = LatencySimulator("binance", custom)
        assert ls.config.base_latency_ms == 999.0

    def test_reconnect_logs_correct_attempt_count(self):
        """Regression: attempt_reconnect should track attempts before resetting.
        Previously, the log message used self._reconnect_attempts after it was
        reset to 0, always showing '0 attempts'."""
        from unittest.mock import MagicMock
        ls = LatencySimulator("binance", LatencyConfig(
            reconnect_base_delay_ms=100.0
        ))
        ls.disconnect()
        # Force several failed attempts by mocking rng to return 1.0 (always fail)
        mock_rng = MagicMock()
        mock_rng.random.return_value = 1.0  # Always fail
        ls._rng = mock_rng
        for _ in range(3):
            ls.attempt_reconnect()
        assert ls._reconnect_attempts == 3
        assert ls.is_connected is False
        # Now succeed
        mock_rng.random.return_value = 0.0  # Always succeed
        result = ls.attempt_reconnect()
        assert result is True
        assert ls._reconnect_attempts == 0  # Reset after success

    def test_get_latency_when_disconnected_does_not_increment_messages(self):
        """get_latency during disconnection should not count as a message."""
        ls = LatencySimulator("binance")
        ls.disconnect()
        ls.get_latency()  # Returns reconnect delay, not a real message
        stats = ls.get_stats()
        assert stats["total_messages"] == 0
