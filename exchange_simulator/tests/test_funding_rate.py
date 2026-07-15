"""Tests for FundingRateSimulator — rate computation, interval detection, payments, history."""
import pytest
import time

from exchange_simulator.funding_rate import (
    FundingRateSimulator, FundingRateEvent, FUNDING_INTERVAL_SECONDS,
)


class TestFundingRateSimulatorInit:
    def test_default_init(self):
        fr = FundingRateSimulator()
        assert fr.symbol == "BTCUSDT"
        assert fr.base_rate == 0.0001
        assert fr.max_rate == 0.005
        assert fr.clamp_rate == 0.0075
        assert len(fr.history) == 0
        assert fr._last_funding_time == -1

    def test_custom_init(self):
        fr = FundingRateSimulator(symbol="ETHUSDT", base_rate=0.0002,
                                  max_rate=0.01, clamp_rate=0.02)
        assert fr.symbol == "ETHUSDT"
        assert fr.base_rate == 0.0002
        assert fr.max_rate == 0.01
        assert fr.clamp_rate == 0.02


class TestComputeFundingRate:
    def test_zero_premium(self):
        fr = FundingRateSimulator()
        rate = fr._compute_funding_rate(50000, 50000)
        # With zero premium, rate ≈ base_rate + noise
        assert abs(rate - 0.0001) < 0.001

    def test_positive_premium(self):
        fr = FundingRateSimulator()
        rate = fr._compute_funding_rate(50500, 50000)
        # premium = 0.01, rate = 0.01 * 0.1 + 0.0001 + noise = 0.0011 + noise
        assert rate > fr.base_rate

    def test_negative_premium(self):
        fr = FundingRateSimulator()
        rate = fr._compute_funding_rate(49500, 50000)
        # premium = -0.01, rate = -0.01 * 0.1 + 0.0001 + noise = -0.0009 + noise
        assert rate < fr.base_rate

    def test_clamp_upper(self):
        fr = FundingRateSimulator(clamp_rate=0.001)
        # Huge premium should be clamped
        rate = fr._compute_funding_rate(100000, 50000)
        assert rate <= 0.001

    def test_clamp_lower(self):
        fr = FundingRateSimulator(clamp_rate=0.001)
        # Huge negative premium should be clamped
        rate = fr._compute_funding_rate(1, 50000)
        assert rate >= -0.001

    def test_zero_index_price(self):
        fr = FundingRateSimulator()
        rate = fr._compute_funding_rate(50000, 0)
        assert rate == 0.0


class TestCheckAndApplyFunding:
    def test_first_call_returns_event(self):
        fr = FundingRateSimulator()
        # Use a fixed time at 00:xx UTC
        t = time.mktime(time.gmtime(0))  # epoch: 00:00:00 UTC
        event = fr.check_and_apply_funding(50000, 50000, current_time=t)
        assert event is not None
        assert isinstance(event, FundingRateEvent)
        assert event.symbol == "BTCUSDT"
        assert event.funding_time in [0, 8, 16]

    def test_same_interval_not_repeated(self):
        fr = FundingRateSimulator()
        t = time.mktime(time.gmtime(0))
        event1 = fr.check_and_apply_funding(50000, 50000, current_time=t)
        assert event1 is not None
        # Same funding hour — should return None
        event2 = fr.check_and_apply_funding(50000, 50000, current_time=t + 60)
        assert event2 is None

    def test_different_interval_returns_event(self):
        fr = FundingRateSimulator()
        t0 = time.mktime(time.gmtime(0))  # 00:00 UTC
        fr.check_and_apply_funding(50000, 50000, current_time=t0)
        # Move to 08:00 UTC
        t8 = t0 + 8 * 3600
        event = fr.check_and_apply_funding(50000, 50000, current_time=t8)
        assert event is not None
        assert event.funding_time == 8

    def test_history_appended(self):
        fr = FundingRateSimulator()
        t = time.mktime(time.gmtime(0))
        fr.check_and_apply_funding(50000, 50000, current_time=t)
        assert len(fr.history) == 1

    def test_event_fields(self):
        fr = FundingRateSimulator()
        t = time.mktime(time.gmtime(0))
        event = fr.check_and_apply_funding(51000, 50000, current_time=t)
        assert event.mark_price == 51000
        assert event.index_price == 50000
        assert event.timestamp == t


class TestComputeFundingPayment:
    def test_long_position_positive_rate(self):
        fr = FundingRateSimulator()
        # Long position (positive qty) with positive rate → pays (negative return)
        payment = fr.compute_funding_payment(1.0, 0.0001)
        assert payment == pytest.approx(-0.0001)

    def test_short_position_positive_rate(self):
        fr = FundingRateSimulator()
        # Short position (negative qty) with positive rate → receives (positive return)
        payment = fr.compute_funding_payment(-1.0, 0.0001)
        assert payment == pytest.approx(0.0001)

    def test_long_position_negative_rate(self):
        fr = FundingRateSimulator()
        # Long position with negative rate → receives
        payment = fr.compute_funding_payment(1.0, -0.0001)
        assert payment == pytest.approx(0.0001)

    def test_zero_position(self):
        fr = FundingRateSimulator()
        payment = fr.compute_funding_payment(0.0, 0.0001)
        assert payment == 0.0

    def test_zero_rate(self):
        fr = FundingRateSimulator()
        payment = fr.compute_funding_payment(1.0, 0.0)
        assert payment == 0.0

    def test_large_position(self):
        fr = FundingRateSimulator()
        payment = fr.compute_funding_payment(100.0, 0.001)
        assert payment == pytest.approx(-0.1)


class TestGetNextFundingTime:
    def test_next_funding_after_midnight(self):
        fr = FundingRateSimulator()
        # 01:00 UTC → next funding at 08:00 UTC
        t = time.mktime(time.gmtime(0)) + 3600  # 01:00 UTC
        next_t = fr.get_next_funding_time(current_time=t)
        gm = time.gmtime(next_t)
        assert gm.tm_hour == 8
        assert gm.tm_min == 0
        assert gm.tm_sec == 0

    def test_next_funding_after_8am(self):
        fr = FundingRateSimulator()
        # 09:00 UTC → next funding at 16:00 UTC
        t = time.mktime(time.gmtime(0)) + 9 * 3600
        next_t = fr.get_next_funding_time(current_time=t)
        gm = time.gmtime(next_t)
        assert gm.tm_hour == 16

    def test_next_funding_after_4pm(self):
        fr = FundingRateSimulator()
        # 17:00 UTC → next funding at 00:00 UTC (next day)
        t = time.mktime(time.gmtime(0)) + 17 * 3600
        next_t = fr.get_next_funding_time(current_time=t)
        gm = time.gmtime(next_t)
        assert gm.tm_hour == 0

    def test_next_funding_in_future(self):
        fr = FundingRateSimulator()
        t = time.mktime(time.gmtime(0))
        next_t = fr.get_next_funding_time(current_time=t)
        assert next_t > t


class TestGetCurrentRateEstimate:
    def test_estimate_returns_float(self):
        fr = FundingRateSimulator()
        rate = fr.get_current_rate_estimate(50000, 50000)
        assert isinstance(rate, float)

    def test_estimate_with_premium(self):
        fr = FundingRateSimulator()
        rate = fr.get_current_rate_estimate(51000, 50000)
        assert rate > 0  # Positive premium → positive rate


class TestGetHistory:
    def test_empty_history(self):
        fr = FundingRateSimulator()
        hist = fr.get_history()
        assert len(hist) == 0

    def test_history_after_funding(self):
        fr = FundingRateSimulator()
        t = time.mktime(time.gmtime(0))
        fr.check_and_apply_funding(50000, 50000, current_time=t)
        hist = fr.get_history()
        assert len(hist) == 1
        assert isinstance(hist[0], FundingRateEvent)

    def test_history_limit(self):
        fr = FundingRateSimulator()
        t = time.mktime(time.gmtime(0))
        # Apply 3 funding events at different intervals
        for i in range(3):
            fr.check_and_apply_funding(50000, 50000, current_time=t + i * 8 * 3600)
        hist = fr.get_history(limit=2)
        assert len(hist) == 2
        # Should return the last 2
        assert hist[-1].funding_time == 16


class TestGetStats:
    def test_empty_stats(self):
        fr = FundingRateSimulator()
        stats = fr.get_stats()
        assert stats["symbol"] == "BTCUSDT"
        assert stats["count"] == 0

    def test_stats_after_funding(self):
        fr = FundingRateSimulator()
        t = time.mktime(time.gmtime(0))
        fr.check_and_apply_funding(50000, 50000, current_time=t)
        stats = fr.get_stats()
        assert stats["symbol"] == "BTCUSDT"
        assert stats["count"] == 1
        assert "avg_rate" in stats
        assert "max_rate" in stats
        assert "min_rate" in stats
        assert "last_rate" in stats

    def test_stats_multiple_events(self):
        fr = FundingRateSimulator()
        t = time.mktime(time.gmtime(0))
        for i in range(3):
            fr.check_and_apply_funding(50000 + i * 100, 50000, current_time=t + i * 8 * 3600)
        stats = fr.get_stats()
        assert stats["count"] == 3
        assert stats["max_rate"] >= stats["min_rate"]
        assert stats["avg_rate"] == pytest.approx(
            (stats["min_rate"] + stats["max_rate"]) / 2
            if stats["min_rate"] == stats["max_rate"]
            else stats["avg_rate"]
        )
