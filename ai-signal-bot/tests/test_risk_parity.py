"""Tests for Risk Parity optimizer."""
import numpy as np
import pytest
from src.portfolio.risk_parity import RiskParityOptimizer, RiskContribution


class TestRiskParity:
    @pytest.fixture
    def optimizer(self):
        return RiskParityOptimizer(risk_free_rate=0.02)

    @pytest.fixture
    def cov_matrix(self):
        return np.array([
            [0.04, 0.01],
            [0.01, 0.09],
        ])

    def test_calculate_marginal_risk(self, optimizer, cov_matrix):
        weights = np.array([0.5, 0.5])
        mr = optimizer.calculate_marginal_risk(weights, cov_matrix)
        assert mr.shape == (2,)
        assert np.all(mr >= 0)

    def test_calculate_marginal_risk_zero_volatility(self, optimizer):
        weights = np.array([0.0, 0.0])
        zero_cov = np.zeros((2, 2))
        mr = optimizer.calculate_marginal_risk(weights, zero_cov)
        assert np.all(mr == 0)

    def test_calculate_risk_contributions(self, optimizer, cov_matrix):
        weights = np.array([0.5, 0.5])
        contributions = optimizer.calculate_risk_contributions(weights, cov_matrix)
        assert len(contributions) == 2
        assert all(isinstance(c, RiskContribution) for c in contributions)
        total_pct = sum(c.percentage for c in contributions)
        assert abs(total_pct - 100.0) < 1.0 or abs(total_pct - 1.0) < 0.1
