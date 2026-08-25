"""Tests for CVaRCalculator."""
import numpy as np
import pytest

try:
    from src.risk.cvar import CVaRCalculator, CVaRResult
    _HAS_CVAR = True
except ImportError:
    _HAS_CVAR = False


@pytest.mark.skipif(not _HAS_CVAR, reason="scipy not available")
class TestCVaRCalculator:
    @pytest.fixture
    def calculator(self):
        return CVaRCalculator(confidence_level=0.95, time_horizon=1.0)

    @pytest.fixture
    def returns(self):
        np.random.seed(42)
        return np.random.normal(0, 0.02, 1000)

    def test_creation(self, calculator):
        assert calculator.confidence_level == 0.95

    def test_calculate_cvar(self, calculator, returns):
        result = calculator.calculate_cvar(returns, method='historical')
        assert isinstance(result, CVaRResult)
        assert result.cvar_value >= result.var_value

    def test_cvar_exceeds_var(self, calculator, returns):
        result = calculator.calculate_cvar(returns, method='historical')
        assert abs(result.cvar_value) >= abs(result.var_value)
