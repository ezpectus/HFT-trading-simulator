"""Tests for Kelly Criterion position sizing."""
import pytest

from src.risk.kelly import KellyPositionSizer, KellyResult


class TestKellyPositionSizer:
    def test_basic_initialization(self):
        sizer = KellyPositionSizer(win_rate=0.55, avg_win=100, avg_loss=80)
        assert sizer.win_rate == 0.55
        assert sizer.kelly_fraction == 0.5

    def test_compute_kelly_positive(self):
        # win_rate=0.55, avg_win=100, avg_loss=80
        # b = 100/80 = 1.25
        # kelly = (0.55 * 1.25 - 0.45) / 1.25 = (0.6875 - 0.45) / 1.25 = 0.19
        sizer = KellyPositionSizer(win_rate=0.55, avg_win=100, avg_loss=80)
        kelly = sizer.compute_kelly()
        assert kelly > 0
        assert abs(kelly - 0.19) < 0.01

    def test_compute_kelly_no_edge(self):
        # win_rate=0.40, avg_win=100, avg_loss=100
        # b = 1.0
        # kelly = (0.40 * 1 - 0.60) / 1 = -0.20 → clamped to 0
        sizer = KellyPositionSizer(win_rate=0.40, avg_win=100, avg_loss=100)
        kelly = sizer.compute_kelly()
        assert kelly == 0.0

    def test_calculate_quantity(self):
        sizer = KellyPositionSizer(
            win_rate=0.55, avg_win=100, avg_loss=80,
            kelly_fraction=0.5, max_risk_pct=5.0,
        )
        result = sizer.calculate(
            balance=10000, entry_price=65000, stop_loss=63000,
        )
        assert result.quantity > 0
        assert result.risk_amount > 0
        assert result.raw_kelly > 0

    def test_calculate_no_edge(self):
        sizer = KellyPositionSizer(win_rate=0.30, avg_win=100, avg_loss=100)
        result = sizer.calculate(
            balance=10000, entry_price=65000, stop_loss=63000,
        )
        assert result.quantity == 0.0
        assert "No edge" in result.reason

    def test_calculate_invalid_stop(self):
        sizer = KellyPositionSizer(win_rate=0.55, avg_win=100, avg_loss=80)
        result = sizer.calculate(
            balance=10000, entry_price=65000, stop_loss=65000,
        )
        assert result.quantity == 0.0
        assert "Invalid" in result.reason

    def test_max_position_cap(self):
        sizer = KellyPositionSizer(
            win_rate=0.90, avg_win=200, avg_loss=50,
            kelly_fraction=1.0, max_risk_pct=50.0,
            max_position_pct=10.0,
        )
        result = sizer.calculate(
            balance=10000, entry_price=100, stop_loss=99,
        )
        # Should be capped at max_position_pct
        max_notional = 10000 * 0.10
        assert result.quantity * 100 <= max_notional + 0.01

    def test_half_kelly_reduces_size(self):
        full = KellyPositionSizer(
            win_rate=0.60, avg_win=150, avg_loss=100,
            kelly_fraction=1.0, max_risk_pct=50.0,
        )
        half = KellyPositionSizer(
            win_rate=0.60, avg_win=150, avg_loss=100,
            kelly_fraction=0.5, max_risk_pct=50.0,
        )
        r_full = full.calculate(balance=10000, entry_price=100, stop_loss=95)
        r_half = half.calculate(balance=10000, entry_price=100, stop_loss=95)
        assert r_half.risk_amount <= r_full.risk_amount

    def test_update_stats(self):
        sizer = KellyPositionSizer()
        sizer.update_stats(win_rate=0.65, avg_win=120, avg_loss=90)
        assert sizer.win_rate == 0.65
        assert sizer.avg_win == 120
        assert sizer.avg_loss == 90

    def test_from_trade_history_sufficient(self):
        class MockTrade:
            def __init__(self, pnl):
                self.pnl = pnl

        trades = [MockTrade(100), MockTrade(-50), MockTrade(80), MockTrade(-30),
                  MockTrade(120), MockTrade(-40), MockTrade(90), MockTrade(-20),
                  MockTrade(110), MockTrade(-35)]
        sizer = KellyPositionSizer.from_trade_history(trades, min_trades=5)
        assert sizer.win_rate == 0.5
        assert sizer.avg_win > 0
        assert sizer.avg_loss > 0

    def test_from_trade_history_insufficient(self):
        class MockTrade:
            def __init__(self, pnl):
                self.pnl = pnl

        trades = [MockTrade(100)]
        sizer = KellyPositionSizer.from_trade_history(trades, min_trades=10)
        # Should use defaults
        assert sizer.win_rate == 0.5

    def test_confidence_scaling(self):
        sizer = KellyPositionSizer(
            win_rate=0.60, avg_win=150, avg_loss=100,
            kelly_fraction=1.0, max_risk_pct=50.0,
        )
        r_high = sizer.calculate(balance=10000, entry_price=100, stop_loss=95, confidence=90)
        r_low = sizer.calculate(balance=10000, entry_price=100, stop_loss=95, confidence=30)
        assert r_high.risk_amount >= r_low.risk_amount

    def test_min_risk_pct_not_applied_for_small_edge(self):
        """Regression: min_risk_pct should not force large positions on near-zero edge."""
        # Barely positive Kelly: win_rate=0.51, avg_win=100, avg_loss=100
        # kelly = (0.51 * 1 - 0.49) / 1 = 0.02
        # adjusted = 0.02 * 0.5 = 0.01 → risk_pct = 1.0
        # With fix: adjusted >= 0.01 → min_risk_pct applies
        # But with very low confidence: adjusted < 0.01 → min_risk_pct should NOT apply
        sizer = KellyPositionSizer(
            win_rate=0.51, avg_win=100, avg_loss=100,
            kelly_fraction=0.5, max_risk_pct=5.0,
            min_risk_pct=2.0,
        )
        # Low confidence scales adjusted below 0.01
        result = sizer.calculate(
            balance=10000, entry_price=100, stop_loss=95,
            confidence=0.3,  # adjusted = 0.01 * 0.3 = 0.003 < 0.01
        )
        # risk_pct should be 0.3% (not forced to 2% min)
        expected_risk = 10000 * 0.3 / 100.0
        assert result.risk_amount <= expected_risk + 1.0

    def test_min_risk_pct_applied_for_meaningful_edge(self):
        """min_risk_pct should still apply when Kelly edge is meaningful."""
        sizer = KellyPositionSizer(
            win_rate=0.60, avg_win=150, avg_loss=100,
            kelly_fraction=0.5, max_risk_pct=50.0,
            min_risk_pct=3.0, max_position_pct=100.0,
        )
        result = sizer.calculate(
            balance=10000, entry_price=100, stop_loss=95,
            confidence=1.0,
        )
        # Kelly edge is large → min_risk_pct should apply
        min_risk = 10000 * 3.0 / 100.0
        assert result.risk_amount >= min_risk - 1.0
