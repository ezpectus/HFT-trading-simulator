"""Tests for DynamicPositionSizer."""
import pytest
from src.risk.position_sizing import DynamicPositionSizer, PositionSizingResult


class TestDynamicPositionSizer:
    @pytest.fixture
    def sizer(self):
        return DynamicPositionSizer(account_value=100000, max_position_size=0.2)

    def test_creation(self, sizer):
        assert sizer.account_value == 100000
        assert sizer.max_position_size == 0.2

    def test_hold_returns_zero(self, sizer):
        result = sizer.calculate_position_size('HOLD', price=65000)
        assert result.position_size == 0
        assert result.position_value == 0

    def test_volatility_based(self, sizer):
        result = sizer.calculate_position_size('BUY', price=65000, volatility=0.02, method='volatility')
        assert isinstance(result, PositionSizingResult)
        assert result.position_size > 0
        assert result.method == 'volatility'

    def test_risk_parity(self, sizer):
        result = sizer.calculate_position_size('BUY', price=65000, method='risk_parity')
        assert isinstance(result, PositionSizingResult)
        assert result.method == 'risk_parity'

    def test_kelly_method(self, sizer):
        result = sizer.calculate_position_size('BUY', price=65000, volatility=0.02, method='kelly')
        assert isinstance(result, PositionSizingResult)
        assert result.method == 'kelly'

    def test_max_position_capped(self, sizer):
        result = sizer.calculate_position_size('BUY', price=65000, volatility=0.5, method='volatility')
        assert result.position_value <= sizer.account_value * sizer.max_position_size + 1
