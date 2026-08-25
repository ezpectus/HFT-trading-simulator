"""Tests for KellyPositionSizer."""
import pytest
from src.risk.kelly import KellyPositionSizer, KellyResult


class TestKellyPositionSizer:
    @pytest.fixture
    def sizer(self):
        return KellyPositionSizer(
            win_rate=0.55,
            avg_win=100,
            avg_loss=80,
            kelly_fraction=0.5,
            max_risk_pct=5.0,
        )

    def test_creation(self, sizer):
        assert sizer.win_rate == 0.55
        assert sizer.kelly_fraction == 0.5

    def test_calculate_returns_result(self, sizer):
        result = sizer.calculate(balance=10000, entry=65000, stop_loss=63000)
        assert isinstance(result, KellyResult)
        assert result.quantity > 0
        assert result.risk_amount > 0

    def test_zero_loss_returns_zero(self, sizer):
        result = sizer.calculate(balance=10000, entry=65000, stop_loss=65000)
        assert result.quantity == 0 or result.reason != ""

    def test_max_risk_capped(self, sizer):
        result = sizer.calculate(balance=1000, entry=65000, stop_loss=1000)
        assert result.risk_amount <= 1000 * 0.05 + 1
