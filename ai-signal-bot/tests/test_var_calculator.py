"""Tests for VaRCalculator."""
import numpy as np
import pytest
from src.risk.var import VaRCalculator, VaRResult


class TestVaRCalculator:
    @pytest.fixture
    def calculator(self):
        return VaRCalculator(confidence_level=0.95, time_horizon=1.0)

    @pytest.fixture
    def returns(self):
        np.random.seed(42)
        return np.random.normal(0, 0.02, 1000)

    def test_creation(self, calculator):
        assert calculator.confidence_level == 0.95
        assert calculator.time_horizon == 1.0

    def test_historical_var(self, calculator, returns):
        result = calculator.calculate_historical_var(returns)
        assert isinstance(result, VaRResult)
        assert result.method == 'historical'
        assert result.var_value < 0  # negative = loss percentile

    def test_parametric_var(self, calculator, returns):
        result = calculator.calculate_parametric_var(returns)
        assert isinstance(result, VaRResult)
        assert result.var_value < 0  # negative = loss percentile

    def test_monte_carlo_var(self, calculator, returns):
        result = calculator.calculate_monte_carlo_var(returns)
        assert isinstance(result, VaRResult)
        assert result.var_value < 0  # negative = loss percentile

    def test_different_confidence_levels(self, returns):
        calc_99 = VaRCalculator(confidence_level=0.99)
        calc_95 = VaRCalculator(confidence_level=0.95)
        r99 = calc_99.calculate_historical_var(returns)
        r95 = calc_95.calculate_historical_var(returns)
        assert r99.var_value <= r95.var_value  # 99% tail is deeper loss
