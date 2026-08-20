"""Tests for portfolio/ modules — black_litterman, rebalancing, risk_parity."""
import numpy as np
import pytest

from src.portfolio.black_litterman import BlackLittermanModel, View
from src.portfolio.rebalancing import (
    RebalanceOrder,
    RebalanceResult,
    RebalanceTrigger,
    RebalancingStrategy,
)
from src.portfolio.risk_parity import RiskContribution, RiskParityOptimizer

# ─── Fixtures ───


@pytest.fixture
def cov_matrix():
    return np.array([
        [0.04, 0.01, 0.002],
        [0.01, 0.09, 0.005],
        [0.002, 0.005, 0.01],
    ])


@pytest.fixture
def market_weights():
    return np.array([0.5, 0.3, 0.2])


# ─── BlackLitterman ───


class TestView:
    def test_creation(self):
        v = View(assets=[0, 1], weights=[1, -1], expected_return=0.03, confidence=0.8)
        assert v.assets == [0, 1]
        assert v.weights == [1, -1]
        assert v.expected_return == 0.03
        assert v.confidence == 0.8


class TestBlackLittermanModel:
    def test_init_defaults(self):
        bl = BlackLittermanModel()
        assert bl.risk_free_rate == 0.02
        assert bl.tau == 0.05

    def test_init_custom(self):
        bl = BlackLittermanModel(risk_free_rate=0.05, tau=0.1)
        assert bl.risk_free_rate == 0.05
        assert bl.tau == 0.1

    def test_calculate_prior_returns(self, cov_matrix, market_weights):
        bl = BlackLittermanModel()
        prior = bl.calculate_prior_returns(market_weights, cov_matrix, risk_aversion=3.0)
        assert prior.shape == (3,)
        assert np.isfinite(prior).all()

    def test_incorporate_views_empty(self, cov_matrix):
        bl = BlackLittermanModel()
        prior = np.array([0.05, 0.07, 0.03])
        post_ret, post_cov = bl.incorporate_views(prior, cov_matrix, [])
        np.testing.assert_array_equal(post_ret, prior)
        np.testing.assert_array_equal(post_cov, cov_matrix)

    def test_incorporate_views(self, cov_matrix):
        bl = BlackLittermanModel()
        prior = np.array([0.05, 0.07, 0.03])
        views = [View(assets=[0], weights=[1], expected_return=0.08, confidence=0.9)]
        post_ret, post_cov = bl.incorporate_views(prior, cov_matrix, views)
        assert post_ret.shape == (3,)
        assert post_cov.shape == (3, 3)
        assert np.isfinite(post_ret).all()

    def test_incorporate_views_low_confidence(self, cov_matrix):
        bl = BlackLittermanModel()
        prior = np.array([0.05, 0.07, 0.03])
        views = [View(assets=[0], weights=[1], expected_return=0.08, confidence=0.0)]
        post_ret, post_cov = bl.incorporate_views(prior, cov_matrix, views)
        assert np.isfinite(post_ret).all()

    def test_optimize_portfolio(self, cov_matrix):
        bl = BlackLittermanModel()
        returns = np.array([0.05, 0.07, 0.03])
        result = bl.optimize_portfolio(returns, cov_matrix)
        assert result is not None
        assert len(result.weights) == 3

    def test_calculate_black_litterman_portfolio(self, cov_matrix, market_weights):
        bl = BlackLittermanModel()
        views = [
            View(assets=[0], weights=[1], expected_return=0.08, confidence=0.8),
            View(assets=[1, 2], weights=[1, -1], expected_return=0.02, confidence=0.6),
        ]
        result = bl.calculate_black_litterman_portfolio(
            market_weights, cov_matrix, views, risk_aversion=3.0
        )
        assert result is not None
        assert len(result.weights) == 3
        assert np.isfinite(result.weights).all()


# ─── Rebalancing ───


class TestRebalanceTrigger:
    def test_values(self):
        assert RebalanceTrigger.TIME_BASED.value == "time_based"
        assert RebalanceTrigger.DRIFT_BASED.value == "drift_based"
        assert RebalanceTrigger.VOLATILITY_BASED.value == "volatility_based"


class TestRebalanceOrder:
    def test_creation(self):
        order = RebalanceOrder(
            asset_index=0,
            current_weight=0.3,
            target_weight=0.5,
            trade_amount=2000,
            side="BUY",
        )
        assert order.asset_index == 0
        assert order.side == "BUY"


class TestRebalancingStrategy:
    def test_init_defaults(self):
        rs = RebalancingStrategy()
        assert rs.transaction_cost == 0.001

    def test_init_custom(self):
        rs = RebalancingStrategy(transaction_cost=0.005)
        assert rs.transaction_cost == 0.005

    def test_calculate_drift(self):
        rs = RebalancingStrategy()
        current = np.array([0.4, 0.3, 0.3])
        target = np.array([0.5, 0.3, 0.2])
        drift = rs.calculate_drift(current, target)
        np.testing.assert_array_almost_equal(drift, [-0.1, 0.0, 0.1])

    def test_calculate_turnover(self):
        rs = RebalancingStrategy()
        current = np.array([0.4, 0.6])
        target = np.array([0.6, 0.4])
        turnover = rs.calculate_turnover(current, target)
        assert turnover == pytest.approx(0.2)

    def test_should_rebalance_time_based_true(self):
        rs = RebalancingStrategy()
        assert rs.should_rebalance_time_based(100, 60, 200) is True

    def test_should_rebalance_time_based_false(self):
        rs = RebalancingStrategy()
        assert rs.should_rebalance_time_based(100, 60, 130) is False

    def test_should_rebalance_drift_based_true(self):
        rs = RebalancingStrategy()
        current = np.array([0.6, 0.4])
        target = np.array([0.4, 0.6])
        assert rs.should_rebalance_drift_based(current, target, max_drift=0.05) is True

    def test_should_rebalance_drift_based_false(self):
        rs = RebalancingStrategy()
        current = np.array([0.52, 0.48])
        target = np.array([0.5, 0.5])
        assert rs.should_rebalance_drift_based(current, target, max_drift=0.05) is False

    def test_should_rebalance_volatility_based_true(self):
        rs = RebalancingStrategy()
        assert rs.should_rebalance_volatility_based(0.25, 0.15, max_volatility_drift=0.1) is True

    def test_should_rebalance_volatility_based_false(self):
        rs = RebalancingStrategy()
        assert rs.should_rebalance_volatility_based(0.16, 0.15, max_volatility_drift=0.1) is False

    def test_should_rebalance_volatility_zero_target(self):
        rs = RebalancingStrategy()
        assert rs.should_rebalance_volatility_based(0.15, 0.0, max_volatility_drift=0.1) is True

    def test_generate_rebalance_orders(self):
        rs = RebalancingStrategy()
        current = np.array([0.3, 0.7])
        target = np.array([0.5, 0.5])
        orders = rs.generate_rebalance_orders(current, target, 10000)
        assert len(orders) == 2
        assert orders[0].side == "BUY"
        assert orders[1].side == "SELL"

    def test_generate_rebalance_orders_skip_small(self):
        rs = RebalancingStrategy()
        current = np.array([0.501, 0.499])
        target = np.array([0.5, 0.5])
        orders = rs.generate_rebalance_orders(current, target, 10000)
        assert len(orders) == 0

    def test_execute_rebalance(self):
        rs = RebalancingStrategy(transaction_cost=0.002)
        current = np.array([0.3, 0.7])
        target = np.array([0.5, 0.5])
        result = rs.execute_rebalance(current, target, 10000)
        assert isinstance(result, RebalanceResult)
        assert len(result.orders) == 2
        assert result.turnover > 0
        assert result.estimated_cost > 0
        np.testing.assert_array_almost_equal(result.new_weights, target)

    def test_should_rebalance_dispatch(self):
        rs = RebalancingStrategy()
        current = np.array([0.6, 0.4])
        target = np.array([0.4, 0.6])
        assert rs.should_rebalance(current, target, RebalanceTrigger.DRIFT_BASED) is True
        assert rs.should_rebalance(
            current, target, RebalanceTrigger.TIME_BASED,
            last_rebalance_time=0, rebalance_interval=60, current_time=100
        ) is True
        assert rs.should_rebalance(
            current, target, RebalanceTrigger.VOLATILITY_BASED,
            current_volatility=0.3, target_volatility=0.1
        ) is True

    def test_should_rebalance_missing_params(self):
        rs = RebalancingStrategy()
        current = np.array([0.5, 0.5])
        target = np.array([0.5, 0.5])
        assert rs.should_rebalance(current, target, RebalanceTrigger.TIME_BASED) is False
        assert rs.should_rebalance(current, target, RebalanceTrigger.VOLATILITY_BASED) is False


# ─── RiskParity ───


class TestRiskContribution:
    def test_creation(self):
        rc = RiskContribution(asset_index=0, marginal_risk=0.05, contribution=0.02, percentage=0.33)
        assert rc.asset_index == 0
        assert rc.percentage == 0.33


class TestRiskParityOptimizer:
    def test_init_defaults(self):
        rp = RiskParityOptimizer()
        assert rp.risk_free_rate == 0.02

    def test_calculate_marginal_risk(self, cov_matrix):
        rp = RiskParityOptimizer()
        weights = np.array([0.4, 0.4, 0.2])
        mr = rp.calculate_marginal_risk(weights, cov_matrix)
        assert mr.shape == (3,)
        assert np.isfinite(mr).all()

    def test_calculate_marginal_risk_zero_vol(self):
        rp = RiskParityOptimizer()
        weights = np.array([0.0, 0.0])
        cov = np.zeros((2, 2))
        mr = rp.calculate_marginal_risk(weights, cov)
        np.testing.assert_array_equal(mr, [0.0, 0.0])

    def test_calculate_risk_contributions(self, cov_matrix):
        rp = RiskParityOptimizer()
        weights = np.array([0.4, 0.4, 0.2])
        contributions = rp.calculate_risk_contributions(weights, cov_matrix)
        assert len(contributions) == 3
        assert all(isinstance(c, RiskContribution) for c in contributions)
        total_pct = sum(c.percentage for c in contributions)
        assert total_pct == pytest.approx(1.0)

    def test_optimize_risk_parity(self, cov_matrix):
        rp = RiskParityOptimizer()
        result = rp.optimize_risk_parity(cov_matrix, max_iterations=100)
        assert len(result.weights) == 3
        assert np.isfinite(result.weights).all()
        assert result.volatility > 0

    def test_optimize_risk_parity_with_budget(self, cov_matrix):
        rp = RiskParityOptimizer()
        budget = np.array([0.5, 0.3, 0.2])
        result = rp.optimize_risk_parity(cov_matrix, risk_budget=budget, max_iterations=100)
        assert len(result.weights) == 3

    def test_calculate_leverage(self, cov_matrix):
        rp = RiskParityOptimizer()
        weights = np.array([0.4, 0.4, 0.2])
        leverage = rp.calculate_leverage(weights, cov_matrix, target_volatility=0.3)
        assert leverage > 0

    def test_calculate_leverage_zero_vol(self):
        rp = RiskParityOptimizer()
        weights = np.array([0.0, 0.0])
        cov = np.zeros((2, 2))
        leverage = rp.calculate_leverage(weights, cov, target_volatility=0.1)
        assert leverage == 1.0

    def test_optimize_with_leverage(self, cov_matrix):
        rp = RiskParityOptimizer()
        result = rp.optimize_with_leverage(cov_matrix, target_volatility=0.2, max_leverage=3.0)
        assert len(result.weights) == 3
        assert np.isfinite(result.weights).all()

    def test_verify_risk_parity_true(self, cov_matrix):
        rp = RiskParityOptimizer()
        result = rp.optimize_risk_parity(cov_matrix, max_iterations=500)
        is_rp = rp.verify_risk_parity(result.weights, cov_matrix, tolerance=0.1)
        assert is_rp is True

    def test_verify_risk_parity_false(self, cov_matrix):
        rp = RiskParityOptimizer()
        weights = np.array([0.9, 0.05, 0.05])
        is_rp = rp.verify_risk_parity(weights, cov_matrix, tolerance=0.01)
        assert is_rp is False
