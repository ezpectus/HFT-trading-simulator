# Tests for Portfolio Optimization Module
# Tests Markowitz optimization, Black-Litterman model, risk parity, and rebalancing

import numpy as np
import pytest

from src.portfolio.black_litterman import BlackLittermanModel, View
from src.portfolio.markowitz import EfficientFrontierPoint, MarkowitzOptimizer, PortfolioResult
from src.portfolio.rebalancing import RebalanceOrder, RebalanceTrigger, RebalancingStrategy
from src.portfolio.risk_parity import RiskContribution, RiskParityOptimizer


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
        assert np.allclose(expected_returns, np.mean(returns, axis=1))

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
        assert np.allclose(cov_matrix, np.cov(returns))

    def test_calculate_portfolio_metrics(self):
        """Test portfolio metrics calculation."""
        optimizer = MarkowitzOptimizer()  # rf = 0.02

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

        # Exact values: ret = w·mu = 0.121; vol = sqrt(w'Σw) = sqrt(0.00739)
        assert portfolio_return == pytest.approx(0.121)
        assert portfolio_volatility == pytest.approx(np.sqrt(0.00739))
        assert sharpe_ratio == pytest.approx((0.121 - 0.02) / np.sqrt(0.00739))

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
        assert np.all(result.weights >= -1e-8)  # long-only bounds (0, 1)
        assert result.volatility > 0
        # Max-Sharpe objective: result Sharpe must beat or match equal-weight Sharpe
        _, eq_vol, eq_sharpe = optimizer.calculate_portfolio_metrics(
            np.ones(3) / 3, expected_returns, cov_matrix
        )
        assert result.sharpe_ratio >= eq_sharpe - 1e-6

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
        # Sorted by volatility (implementation sorts before returning)
        vols = [p.volatility for p in frontier]
        assert vols == sorted(vols)
        # Every point is a valid portfolio: weights sum to 1, within long-only bounds
        for p in frontier:
            assert np.isclose(np.sum(p.weights), 1.0, atol=1e-5)
            assert np.all(p.weights >= -1e-8)
        # Frontier covers the full target-return range
        rets = [p.expected_return for p in frontier]
        assert min(rets) == pytest.approx(0.1, abs=1e-3)
        assert max(rets) == pytest.approx(0.15, abs=1e-3)

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
        assert np.isclose(np.sum(result.weights), 1.0, atol=1e-5)
        # GMV is the global min-variance portfolio on the simplex: its vol must
        # not exceed the equal-weight portfolio's or the max-Sharpe portfolio's
        _, eq_vol, _ = optimizer.calculate_portfolio_metrics(
            np.ones(3) / 3, expected_returns, cov_matrix
        )
        assert result.volatility <= eq_vol + 1e-9
        max_sharpe = optimizer.optimize_portfolio(expected_returns, cov_matrix)
        assert result.volatility <= max_sharpe.volatility + 1e-9


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

        # Exact: pi = risk_aversion * Sigma @ w_mkt = 3.0 * [0.0064, 0.0092, 0.0069]
        assert np.allclose(prior_returns, [0.0192, 0.0276, 0.0207])

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
        # View pulls the asset0-asset1 spread up from the prior -0.05 toward +0.05
        prior_spread = prior_returns[0] - prior_returns[1]
        posterior_spread = posterior_returns[0] - posterior_returns[1]
        assert posterior_spread > prior_spread
        # Posterior covariance = Sigma + M1^-1 with M1 PSD -> diag must not shrink
        assert np.all(np.diag(posterior_covariance) >= np.diag(cov_matrix) - 1e-12)
        assert np.allclose(posterior_covariance, posterior_covariance.T)

    def test_incorporate_no_views_is_identity(self):
        """No views -> posterior equals prior exactly."""
        model = BlackLittermanModel()
        prior_returns = np.array([0.1, 0.15, 0.12])
        cov_matrix = np.array([
            [0.01, 0.005, 0.003],
            [0.005, 0.02, 0.004],
            [0.003, 0.004, 0.015]
        ])
        post_ret, post_cov = model.incorporate_views(prior_returns, cov_matrix, [])
        assert np.array_equal(post_ret, prior_returns)
        assert np.array_equal(post_cov, cov_matrix)

    def test_higher_confidence_pulls_harder(self):
        """A high-confidence view moves the spread further than low confidence."""
        model = BlackLittermanModel()
        prior_returns = np.array([0.1, 0.15, 0.12])
        cov_matrix = np.array([
            [0.01, 0.005, 0.003],
            [0.005, 0.02, 0.004],
            [0.003, 0.004, 0.015]
        ])
        weak = View(assets=[0, 1], weights=[1, -1], expected_return=0.05, confidence=0.1)
        strong = View(assets=[0, 1], weights=[1, -1], expected_return=0.05, confidence=0.95)
        weak_post, _ = model.incorporate_views(prior_returns, cov_matrix, [weak])
        strong_post, _ = model.incorporate_views(prior_returns, cov_matrix, [strong])
        weak_spread = weak_post[0] - weak_post[1]
        strong_spread = strong_post[0] - strong_post[1]
        assert strong_spread > weak_spread

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
        assert np.isclose(np.sum(result.weights), 1.0, atol=1e-5)
        assert np.all(result.weights >= -1e-8)

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
        assert np.isclose(np.sum(result.weights), 1.0, atol=1e-5)
        # View "asset0 beats asset1 by 5%" flips the argmax: without the view the
        # optimizer loads asset1 (highest prior return); with it, asset0 wins.
        no_view = model.calculate_black_litterman_portfolio(market_weights, cov_matrix, [])
        assert np.argmax(no_view.weights) == 1
        assert np.argmax(result.weights) == 0


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

        # Exact: mr = Sigma @ w / vol; Sigma@w = [0.0064, 0.0092, 0.0069]
        vol = np.sqrt(weights @ cov_matrix @ weights)
        assert np.allclose(marginal_risk, np.array([0.0064, 0.0092, 0.0069]) / vol)
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
        # RC_i = w_i * mr_i, and contributions sum to portfolio volatility
        vol = np.sqrt(weights @ cov_matrix @ weights)
        assert np.isclose(sum(rc.contribution for rc in contributions), vol)
        # Asset 1 has the highest variance -> highest contribution share
        assert contributions[1].percentage == max(rc.percentage for rc in contributions)

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
        # THE risk-parity property: equal risk contributions (~1/3 each)
        contributions = optimizer.calculate_risk_contributions(result.weights, cov_matrix)
        for rc in contributions:
            assert rc.percentage == pytest.approx(1 / 3, abs=0.05)
        # Highest-variance asset must get the LOWEST weight under parity
        assert result.weights[1] == min(result.weights)

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

        # Exact: leverage = target_vol / current_vol
        current_vol = np.sqrt(weights @ cov_matrix @ weights)
        assert leverage == pytest.approx(0.15 / current_vol)

    def test_verify_risk_parity(self):
        """Test risk parity verification."""
        optimizer = RiskParityOptimizer()

        cov_matrix = np.array([
            [0.01, 0.005, 0.003],
            [0.005, 0.02, 0.004],
            [0.003, 0.004, 0.015]
        ])

        result = optimizer.optimize_risk_parity(cov_matrix)

        # Optimized weights must actually satisfy parity
        assert optimizer.verify_risk_parity(result.weights, cov_matrix, tolerance=0.05) is True
        # A concentrated portfolio must FAIL parity (negative check)
        concentrated = np.array([0.98, 0.01, 0.01])
        assert optimizer.verify_risk_parity(concentrated, cov_matrix, tolerance=0.05) is False


class TestRebalancingStrategy:
    """Test portfolio rebalancing."""

    def test_calculate_drift(self):
        """Test drift calculation."""
        strategy = RebalancingStrategy()

        current_weights = np.array([0.4, 0.3, 0.3])
        target_weights = np.array([0.35, 0.35, 0.3])

        drift = strategy.calculate_drift(current_weights, target_weights)

        # Exact: drift = current - target
        assert np.allclose(drift, [0.05, -0.05, 0.0])
        assert np.isclose(np.sum(drift), 0.0, atol=1e-10)

    def test_calculate_turnover(self):
        """Test turnover calculation."""
        strategy = RebalancingStrategy()

        current_weights = np.array([0.4, 0.3, 0.3])
        target_weights = np.array([0.35, 0.35, 0.3])

        turnover = strategy.calculate_turnover(current_weights, target_weights)

        # Exact: 0.5 * (0.05 + 0.05 + 0.0) = 0.05
        assert turnover == pytest.approx(0.05)

    def test_should_rebalance_time_based(self):
        """Test time-based rebalancing trigger."""
        strategy = RebalancingStrategy()

        last_rebalance = 1000
        interval = 3600  # 1 hour

        assert strategy.should_rebalance_time_based(last_rebalance, interval, 5000) is True
        # Elapsed 1000s < interval 3600s -> no rebalance (negative check)
        assert strategy.should_rebalance_time_based(last_rebalance, interval, 2000) is False

    def test_should_rebalance_drift_based(self):
        """Test drift-based rebalancing trigger."""
        strategy = RebalancingStrategy()

        # max|drift| = 0.10 > 0.05 -> True
        assert strategy.should_rebalance_drift_based(
            np.array([0.45, 0.3, 0.25]), np.array([0.35, 0.35, 0.3]), max_drift=0.05
        ) is True
        # max|drift| = 0.02 < 0.05 -> False (negative check)
        assert strategy.should_rebalance_drift_based(
            np.array([0.42, 0.3, 0.28]), np.array([0.4, 0.32, 0.28]), max_drift=0.05
        ) is False

    def test_should_rebalance_volatility_based(self):
        """Test volatility-based rebalancing trigger."""
        strategy = RebalancingStrategy()

        # drift = |0.15-0.12|/0.12 = 0.25 > 0.1
        assert strategy.should_rebalance_volatility_based(
            current_volatility=0.15,
            target_volatility=0.12,
            max_volatility_drift=0.1
        ) is True
        # drift = |0.13-0.12|/0.12 = 0.083 < 0.1 (negative check)
        assert strategy.should_rebalance_volatility_based(
            current_volatility=0.13,
            target_volatility=0.12,
            max_volatility_drift=0.1
        ) is False

    def test_generate_rebalance_orders(self):
        """Test rebalancing order generation."""
        strategy = RebalancingStrategy()

        current_weights = np.array([0.4, 0.3, 0.3])
        target_weights = np.array([0.35, 0.35, 0.3])
        portfolio_value = 100000

        orders = strategy.generate_rebalance_orders(
            current_weights, target_weights, portfolio_value
        )

        # Exactly 2 orders: SELL asset0 $5000, BUY asset1 $5000; asset2 unchanged
        assert len(orders) == 2
        assert all(isinstance(order, RebalanceOrder) for order in orders)
        by_asset = {o.asset_index: o for o in orders}
        assert by_asset[0].side == "SELL"
        assert by_asset[0].trade_amount == pytest.approx(5000)
        assert by_asset[1].side == "BUY"
        assert by_asset[1].trade_amount == pytest.approx(5000)
        assert 2 not in by_asset

    def test_generate_rebalance_orders_no_drift(self):
        """Identical weights -> zero orders."""
        strategy = RebalancingStrategy()
        w = np.array([0.4, 0.3, 0.3])
        orders = strategy.generate_rebalance_orders(w, w.copy(), 100000)
        assert orders == []

    def test_execute_rebalance(self):
        """Test rebalancing execution."""
        strategy = RebalancingStrategy()  # transaction_cost = 0.001

        current_weights = np.array([0.4, 0.3, 0.3])
        target_weights = np.array([0.35, 0.35, 0.3])
        portfolio_value = 100000

        result = strategy.execute_rebalance(current_weights, target_weights, portfolio_value)

        assert len(result.orders) == 2
        assert result.turnover == pytest.approx(0.05)
        # cost = total traded ($10000) * 0.001
        assert result.estimated_cost == pytest.approx(10.0)
        assert np.allclose(result.new_weights, target_weights)
