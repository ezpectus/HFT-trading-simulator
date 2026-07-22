"""Tests for PortfolioOptimizer — rebalance detection, target weights, trade computation."""
import numpy as np
import pytest

from src.risk.portfolio_optimizer import (
    AssetStats,
    PortfolioOptimizer,
    PortfolioResult,
)


class TestPortfolioOptimizerInit:
    def test_default_init(self):
        opt = PortfolioOptimizer()
        assert opt.risk_free_rate == 0.02
        assert opt.rebalance_threshold == 0.05
        assert opt.current_weights == {}
        assert opt.target_weights == {}

    def test_custom_init(self):
        opt = PortfolioOptimizer(risk_free_rate=0.05, rebalance_threshold=0.1)
        assert opt.risk_free_rate == 0.05
        assert opt.rebalance_threshold == 0.1


class TestKellyCriterion:
    def test_positive_edge(self):
        opt = PortfolioOptimizer()
        kelly = opt.kelly_criterion(win_rate=0.55, win_loss_ratio=1.5)
        assert kelly > 0
        # f* = (0.55*1.5 - 0.45) / 1.5 = 0.25, half = 0.125
        assert abs(kelly - 0.125) < 0.01

    def test_no_edge(self):
        opt = PortfolioOptimizer()
        kelly = opt.kelly_criterion(win_rate=0.40, win_loss_ratio=1.0)
        assert kelly == 0.0

    def test_capped_at_max_leverage(self):
        opt = PortfolioOptimizer()
        kelly = opt.kelly_criterion(win_rate=0.90, win_loss_ratio=5.0, max_leverage=0.5)
        assert kelly <= 0.5

    def test_zero_win_loss_ratio(self):
        opt = PortfolioOptimizer()
        kelly = opt.kelly_criterion(win_rate=0.60, win_loss_ratio=0.0)
        assert kelly == 0.0


class TestSetTargetWeights:
    def test_normalizes_weights(self):
        opt = PortfolioOptimizer()
        opt.set_target_weights({"BTC": 0.6, "ETH": 0.4})
        assert opt.target_weights["BTC"] == pytest.approx(0.6)
        assert opt.target_weights["ETH"] == pytest.approx(0.4)

    def test_normalizes_unnormalized_weights(self):
        opt = PortfolioOptimizer()
        opt.set_target_weights({"BTC": 60, "ETH": 40})
        assert opt.target_weights["BTC"] == pytest.approx(0.6)
        assert opt.target_weights["ETH"] == pytest.approx(0.4)

    def test_zero_total_keeps_raw(self):
        opt = PortfolioOptimizer()
        opt.set_target_weights({"BTC": 0, "ETH": 0})
        assert opt.target_weights == {"BTC": 0, "ETH": 0}


class TestCheckRebalanceNeeded:
    def test_no_target_weights(self):
        opt = PortfolioOptimizer()
        assert opt.check_rebalance_needed({"BTC": 1000}) is False

    def test_empty_current_values(self):
        opt = PortfolioOptimizer()
        opt.set_target_weights({"BTC": 0.5, "ETH": 0.5})
        assert opt.check_rebalance_needed({}) is False

    def test_zero_total_value(self):
        opt = PortfolioOptimizer()
        opt.set_target_weights({"BTC": 0.5, "ETH": 0.5})
        assert opt.check_rebalance_needed({"BTC": 0, "ETH": 0}) is False

    def test_within_threshold(self):
        opt = PortfolioOptimizer(rebalance_threshold=0.05)
        opt.set_target_weights({"BTC": 0.5, "ETH": 0.5})
        # 52% / 48% — 2% deviation, within 5% threshold
        assert opt.check_rebalance_needed({"BTC": 520, "ETH": 480}) is False

    def test_exceeds_threshold(self):
        opt = PortfolioOptimizer(rebalance_threshold=0.05)
        opt.set_target_weights({"BTC": 0.5, "ETH": 0.5})
        # 60% / 40% — 10% deviation, exceeds 5% threshold
        assert opt.check_rebalance_needed({"BTC": 600, "ETH": 400}) is True

    def test_unexpected_position_triggers_rebalance(self):
        """Regression: symbols not in target_weights should trigger rebalance."""
        opt = PortfolioOptimizer(rebalance_threshold=0.05)
        opt.set_target_weights({"BTC": 0.5, "ETH": 0.5})
        # SOL is not in target weights and is 10% of portfolio
        assert opt.check_rebalance_needed({"BTC": 450, "ETH": 450, "SOL": 100}) is True

    def test_small_unexpected_position_no_rebalance(self):
        """Small unexpected position below threshold should not trigger."""
        opt = PortfolioOptimizer(rebalance_threshold=0.05)
        opt.set_target_weights({"BTC": 0.5, "ETH": 0.5})
        # SOL is 3% — below 5% threshold
        assert opt.check_rebalance_needed({"BTC": 485, "ETH": 485, "SOL": 30}) is False

    def test_missing_target_symbol(self):
        opt = PortfolioOptimizer(rebalance_threshold=0.05)
        opt.set_target_weights({"BTC": 0.5, "ETH": 0.5})
        # ETH missing — 0% vs 50% target → exceeds threshold
        assert opt.check_rebalance_needed({"BTC": 1000}) is True


class TestComputeRebalanceTrades:
    def test_no_target_weights(self):
        opt = PortfolioOptimizer()
        assert opt.compute_rebalance_trades({"BTC": 1000}) == {}

    def test_zero_total_value(self):
        opt = PortfolioOptimizer()
        opt.set_target_weights({"BTC": 0.5, "ETH": 0.5})
        assert opt.compute_rebalance_trades({"BTC": 0, "ETH": 0}) == {}

    def test_correct_trades(self):
        opt = PortfolioOptimizer()
        opt.set_target_weights({"BTC": 0.5, "ETH": 0.5})
        trades = opt.compute_rebalance_trades({"BTC": 600, "ETH": 400})
        assert trades["BTC"] == pytest.approx(-100.0)  # Sell 100 BTC
        assert trades["ETH"] == pytest.approx(100.0)   # Buy 100 ETH

    def test_missing_symbol_in_current(self):
        opt = PortfolioOptimizer()
        opt.set_target_weights({"BTC": 0.5, "ETH": 0.5})
        trades = opt.compute_rebalance_trades({"BTC": 1000})
        assert trades["BTC"] == pytest.approx(-500.0)
        assert trades["ETH"] == pytest.approx(500.0)


class TestMarkowitzOptimize:
    def test_insufficient_data_returns_equal_weight(self):
        opt = PortfolioOptimizer()
        returns = np.random.randn(5, 2) * 0.01
        result = opt.markowitz_optimize(returns, ["BTC", "ETH"])
        assert result.method == "markowitz_equal"
        assert sum(result.weights.values()) == pytest.approx(1.0)

    def test_valid_optimization(self):
        opt = PortfolioOptimizer()
        np.random.seed(42)
        returns = np.random.randn(100, 3) * 0.02
        result = opt.markowitz_optimize(returns, ["BTC", "ETH", "SOL"])
        assert result.method == "markowitz"
        assert len(result.weights) == 3
        assert sum(result.weights.values()) == pytest.approx(1.0)
        assert result.volatility >= 0
        assert isinstance(result.sharpe_ratio, float)


class TestRiskParity:
    def test_insufficient_data_returns_equal_weight(self):
        opt = PortfolioOptimizer()
        returns = np.random.randn(5, 2) * 0.01
        result = opt.risk_parity(returns, ["BTC", "ETH"])
        assert result.method == "risk_parity_equal"

    def test_valid_risk_parity(self):
        opt = PortfolioOptimizer()
        np.random.seed(42)
        returns = np.random.randn(100, 3) * 0.02
        result = opt.risk_parity(returns, ["BTC", "ETH", "SOL"], target_volatility=0.15)
        assert result.method == "risk_parity"
        assert len(result.weights) == 3
        assert all(w >= 0 for w in result.weights.values())
