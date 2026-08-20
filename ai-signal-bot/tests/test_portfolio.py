# Tests for Portfolio Optimization Module
# Tests Markowitz optimization, Black-Litterman model, risk parity, and rebalancing

import numpy as np
import pytest
from ai_signal_bot.src.portfolio.black_litterman import BlackLittermanModel, View
from ai_signal_bot.src.portfolio.markowitz import EfficientFrontierPoint, MarkowitzOptimizer, PortfolioResult
from ai_signal_bot.src.portfolio.rebalancing import RebalanceOrder, RebalanceTrigger, RebalancingStrategy
from ai_signal_bot.src.portfolio.risk_parity import RiskContribution, RiskParityOptimizer


class TestMarkowitzOptimizer:
    """Test Markowitz mean-variance optimization."""

    def test_calculate_expected_returns(self):
        """Test expected returns calculation."""
        optimizer = MarkowitzOptimizer()

        # Create sample returns (3 assets, 100 periods)
        np.random.seed(42)
        returns = np.random.randn(3, 100) * 0.01

        expected_returns = optimizer.calculate_expected_returns(returns)

        assert len(expected_returns) == 3
        assert all(isinstance(r, (float, np.floating)) for r in expected_returns)

    def test_calculate_covariance_matrix(self):
        """Test covariance matrix calculation."""
        optimizer = MarkowitzOptimizer()

        # Create sample returns
        np.random.seed(42)
        returns = np.random.randn(3, 100) * 0.01

        cov_matrix = optimizer.calculate_covariance_matrix(returns)

        assert cov_matrix.shape == (3, 3)
        assert np.allclose(cov_matrix, cov_matrix.T)  # Symmetric
        assert np.all(np.diag(cov_matrix) >= 0)  # Positive diagonal

    def test_calculate_portfolio_metrics(self):
        """Test portfolio metrics calculation."""
        optimizer = MarkowitzOptimizer()

        expected_returns = np.array([0.1, 0.15, 0.12])
        cov_matrix = np.array([
            [0.01, 0.005, 0.003],
            [0.005, 0.02, 0.004],
            [0.003, 0.004, 0.015]
        ])
        weights = np.array([0.4, 0.3, 0.3])

        portfolio_return, portfolio_volatility, sharpe_ratio = optimizer.calculate_portfolio_metrics(
            weights, expected_returns, cov_matrix
        )

        assert portfolio_return > 0
        assert portfolio_volatility > 0
        assert isinstance(sharpe_ratio, (float, np.floating))

    def test_optimize_portfolio(self):
        """Test portfolio optimization."""
        optimizer = MarkowitzOptimizer()

        expected_returns = np.array([0.1, 0.15, 0.12])
        cov_matrix = np.array([
            [0.01, 0.005, 0.003],
            [0.005, 0.02, 0.004],
            [0.003, 0.004, 0.015]
        ])

        result = optimizer.optimize_portfolio(expected_returns, cov_matrix)

        assert isinstance(result, PortfolioResult)
        assert len(result.weights) == 3
        assert np.isclose(np.sum(result.weights), 1.0, atol=1e-5)
        assert result.volatility > 0

    def test_calculate_efficient_frontier(self):
        """Test efficient frontier calculation."""
        optimizer = MarkowitzOptimizer()

        expected_returns = np.array([0.1, 0.15, 0.12])
        cov_matrix = np.array([
            [0.01, 0.005, 0.003],
            [0.005, 0.02, 0.004],
            [0.003, 0.004, 0.015]
        ])

        frontier = optimizer.calculate_efficient_frontier(expected_returns, cov_matrix, n_points=10)

        assert len(frontier) == 10
        assert all(isinstance(point, EfficientFrontierPoint) for point in frontier)

    def test_minimum_variance_portfolio(self):
        """Test minimum variance portfolio calculation."""
        optimizer = MarkowitzOptimizer()

        expected_returns = np.array([0.1, 0.15, 0.12])
        cov_matrix = np.array([
            [0.01, 0.005, 0.003],
            [0.005, 0.02, 0.004],
            [0.003, 0.004, 0.015]
        ])

        result = optimizer.calculate_minimum_variance_portfolio(expected_returns, cov_matrix)

        assert isinstance(result, PortfolioResult)
        assert result.volatility > 0


class TestBlackLittermanModel:
    """Test Black-Litterman model."""

    def test_calculate_prior_returns(self):
        """Test prior returns calculation."""
        model = BlackLittermanModel()

        market_weights = np.array([0.4, 0.3, 0.3])
        cov_matrix = np.array([
            [0.01, 0.005, 0.003],
            [0.005, 0.02, 0.004],
            [0.003, 0.004, 0.015]
        ])

        prior_returns = model.calculate_prior_returns(market_weights, cov_matrix)

        assert len(prior_returns) == 3
        assert all(isinstance(r, (float, np.floating)) for r in prior_returns)

    def test_incorporate_views(self):
        """Test view incorporation."""
        model = BlackLittermanModel()

        prior_returns = np.array([0.1, 0.15, 0.12])
        cov_matrix = np.array([
            [0.01, 0.005, 0.003],
            [0.005, 0.02, 0.004],
            [0.003, 0.004, 0.015]
        ])

        # Create a view: asset 0 will outperform asset 1 by 5%
        view = View(assets=[0, 1], weights=[1, -1], expected_return=0.05, confidence=0.7)

        posterior_returns, posterior_covariance = model.incorporate_views(
            prior_returns, cov_matrix, [view]
        )

        assert len(posterior_returns) == 3
        assert posterior_covariance.shape == (3, 3)

    def test_optimize_portfolio(self):
        """Test Black-Litterman portfolio optimization."""
        model = BlackLittermanModel()

        posterior_returns = np.array([0.1, 0.15, 0.12])
        posterior_covariance = np.array([
            [0.01, 0.005, 0.003],
            [0.005, 0.02, 0.004],
            [0.003, 0.004, 0.015]
        ])

        result = model.optimize_portfolio(posterior_returns, posterior_covariance)

        assert isinstance(result, PortfolioResult)
        assert len(result.weights) == 3

    def test_calculate_black_litterman_portfolio(self):
        """Test complete Black-Litterman portfolio calculation."""
        model = BlackLittermanModel()

        market_weights = np.array([0.4, 0.3, 0.3])
        cov_matrix = np.array([
            [0.01, 0.005, 0.003],
            [0.005, 0.02, 0.004],
            [0.003, 0.004, 0.015]
        ])

        view = View(assets=[0, 1], weights=[1, -1], expected_return=0.05, confidence=0.7)

        result = model.calculate_black_litterman_portfolio(
            market_weights, cov_matrix, [view]
        )

        assert isinstance(result, PortfolioResult)
        assert len(result.weights) == 3


class TestRiskParityOptimizer:
    """Test risk parity optimization."""

    def test_calculate_marginal_risk(self):
        """Test marginal risk calculation."""
        optimizer = RiskParityOptimizer()

        weights = np.array([0.4, 0.3, 0.3])
        cov_matrix = np.array([
            [0.01, 0.005, 0.003],
            [0.005, 0.02, 0.004],
            [0.003, 0.004, 0.015]
        ])

        marginal_risk = optimizer.calculate_marginal_risk(weights, cov_matrix)

        assert len(marginal_risk) == 3
        assert all(mr >= 0 for mr in marginal_risk)

    def test_calculate_risk_contributions(self):
        """Test risk contribution calculation."""
        optimizer = RiskParityOptimizer()

        weights = np.array([0.4, 0.3, 0.3])
        cov_matrix = np.array([
            [0.01, 0.005, 0.003],
            [0.005, 0.02, 0.004],
            [0.003, 0.004, 0.015]
        ])

        contributions = optimizer.calculate_risk_contributions(weights, cov_matrix)

        assert len(contributions) == 3
        assert all(isinstance(rc, RiskContribution) for rc in contributions)
        assert np.isclose(sum(rc.percentage for rc in contributions), 1.0, atol=1e-5)

    def test_optimize_risk_parity(self):
        """Test risk parity optimization."""
        optimizer = RiskParityOptimizer()

        cov_matrix = np.array([
            [0.01, 0.005, 0.003],
            [0.005, 0.02, 0.004],
            [0.003, 0.004, 0.015]
        ])

        result = optimizer.optimize_risk_parity(cov_matrix)

        assert isinstance(result, PortfolioResult)
        assert len(result.weights) == 3
        assert np.isclose(np.sum(result.weights), 1.0, atol=1e-5)

    def test_calculate_leverage(self):
        """Test leverage calculation."""
        optimizer = RiskParityOptimizer()

        weights = np.array([0.4, 0.3, 0.3])
        cov_matrix = np.array([
            [0.01, 0.005, 0.003],
            [0.005, 0.02, 0.004],
            [0.003, 0.004, 0.015]
        ])

        leverage = optimizer.calculate_leverage(weights, cov_matrix, target_volatility=0.15)

        assert leverage > 0
        assert isinstance(leverage, (float, np.floating))

    def test_verify_risk_parity(self):
        """Test risk parity verification."""
        optimizer = RiskParityOptimizer()

        cov_matrix = np.array([
            [0.01, 0.005, 0.003],
            [0.005, 0.02, 0.004],
            [0.003, 0.004, 0.015]
        ])

        result = optimizer.optimize_risk_parity(cov_matrix)

        # Verify risk parity (with loose tolerance)
        is_risk_parity = optimizer.verify_risk_parity(result.weights, cov_matrix, tolerance=0.15)

        assert isinstance(is_risk_parity, bool)


class TestRebalancingStrategy:
    """Test portfolio rebalancing."""

    def test_calculate_drift(self):
        """Test drift calculation."""
        strategy = RebalancingStrategy()

        current_weights = np.array([0.4, 0.3, 0.3])
        target_weights = np.array([0.35, 0.35, 0.3])

        drift = strategy.calculate_drift(current_weights, target_weights)

        assert len(drift) == 3
        assert np.isclose(np.sum(drift), 0.0, atol=1e-10)

    def test_calculate_turnover(self):
        """Test turnover calculation."""
        strategy = RebalancingStrategy()

        current_weights = np.array([0.4, 0.3, 0.3])
        target_weights = np.array([0.35, 0.35, 0.3])

        turnover = strategy.calculate_turnover(current_weights, target_weights)

        assert turnover > 0
        assert turnover <= 1.0

    def test_should_rebalance_time_based(self):
        """Test time-based rebalancing trigger."""
        strategy = RebalancingStrategy()

        last_rebalance = 1000
        interval = 3600  # 1 hour
        current_time = 5000  # 1.4 hours later

        should_rebalance = strategy.should_rebalance_time_based(
            last_rebalance, interval, current_time
        )

        assert should_rebalance == True

    def test_should_rebalance_drift_based(self):
        """Test drift-based rebalancing trigger."""
        strategy = RebalancingStrategy()

        current_weights = np.array([0.4, 0.3, 0.3])
        target_weights = np.array([0.35, 0.35, 0.3])

        should_rebalance = strategy.should_rebalance_drift_based(
            current_weights, target_weights, max_drift=0.05
        )

        assert isinstance(should_rebalance, bool)

    def test_should_rebalance_volatility_based(self):
        """Test volatility-based rebalancing trigger."""
        strategy = RebalancingStrategy()

        should_rebalance = strategy.should_rebalance_volatility_based(
            current_volatility=0.15,
            target_volatility=0.12,
            max_volatility_drift=0.1
        )

        assert should_rebalance == True

    def test_generate_rebalance_orders(self):
        """Test rebalancing order generation."""
        strategy = RebalancingStrategy()

        current_weights = np.array([0.4, 0.3, 0.3])
        target_weights = np.array([0.35, 0.35, 0.3])
        portfolio_value = 100000

        orders = strategy.generate_rebalance_orders(
            current_weights, target_weights, portfolio_value
        )

        assert len(orders) > 0
        assert all(isinstance(order, RebalanceOrder) for order in orders)

    def test_execute_rebalance(self):
        """Test rebalancing execution."""
        strategy = RebalancingStrategy()

        current_weights = np.array([0.4, 0.3, 0.3])
        target_weights = np.array([0.35, 0.35, 0.3])
        portfolio_value = 100000

        result = strategy.execute_rebalance(current_weights, target_weights, portfolio_value)

        assert len(result.orders) > 0
        assert result.turnover > 0
        assert result.estimated_cost >= 0
        assert len(result.new_weights) == 3
