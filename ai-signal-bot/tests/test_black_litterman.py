"""Tests for Black-Litterman model."""
import numpy as np
import pytest
from src.portfolio.black_litterman import BlackLittermanModel, View


class TestBlackLitterman:
    @pytest.fixture
    def model(self):
        return BlackLittermanModel(risk_free_rate=0.02, tau=0.05)

    @pytest.fixture
    def cov_matrix(self):
        return np.array([
            [0.04, 0.01, 0.0],
            [0.01, 0.09, 0.02],
            [0.0, 0.02, 0.16],
        ])

    @pytest.fixture
    def market_weights(self):
        return np.array([0.4, 0.3, 0.3])

    def test_calculate_prior_returns(self, model, cov_matrix, market_weights):
        prior = model.calculate_prior_returns(market_weights, cov_matrix, risk_aversion=3.0)
        assert prior.shape == (3,)
        assert np.all(prior != 0)

    def test_incorporate_views(self, model, cov_matrix, market_weights):
        prior = model.calculate_prior_returns(market_weights, cov_matrix)
        views = [View(assets=[0], weights=[1.0], expected_return=0.08, confidence=0.5)]
        posterior_returns, posterior_cov = model.incorporate_views(prior, cov_matrix, views)
        assert posterior_returns.shape == (3,)
        assert posterior_cov.shape == (3, 3)

    def test_view_validation(self):
        with pytest.raises(ValueError):
            View(assets=[0], weights=[1.0], expected_return=0.08, confidence=1.5)
        with pytest.raises(ValueError):
            View(assets=[0], weights=[1.0], expected_return=0.08, confidence=-0.1)
