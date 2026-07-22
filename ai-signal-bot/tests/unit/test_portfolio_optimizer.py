"""Tests for PortfolioOptimizer — Markowitz, Black-Litterman, Kelly, Risk Parity, rebalancing."""
import numpy as np
import pytest

from src.risk.portfolio_optimizer import (
    AssetStats,
    PortfolioOptimizer,
    PortfolioResult,
)


@pytest.fixture
def optimizer():
    return PortfolioOptimizer(risk_free_rate=0.02, rebalance_threshold=0.05)


@pytest.fixture
def returns_2asset():
    np.random.seed(42)
    n = 100
    ret_a = np.random.randn(n) * 0.01 + 0.0005
    ret_b = np.random.randn(n) * 0.015 + 0.0003
    return np.column_stack([ret_a, ret_b])


@pytest.fixture
def returns_3asset():
    np.random.seed(42)
    n = 100
    ret_a = np.random.randn(n) * 0.01 + 0.0005
    ret_b = np.random.randn(n) * 0.015 + 0.0003
    ret_c = np.random.randn(n) * 0.008 + 0.0008
    return np.column_stack([ret_a, ret_b, ret_c])


class TestMarkowitzOptimize:
    def test_basic_2asset(self, optimizer, returns_2asset):
        result = optimizer.markowitz_optimize(returns_2asset, ["A", "B"])
        assert isinstance(result, PortfolioResult)
        assert result.method == "markowitz"
        assert len(result.weights) == 2
        assert sum(result.weights.values()) == pytest.approx(1.0, rel=1e-3)
        assert all(w >= 0 for w in result.weights.values())  # No short selling

    def test_target_return(self, optimizer, returns_2asset):
        result = optimizer.markowitz_optimize(returns_2asset, ["A", "B"], target_return=0.15)
        assert result.method == "markowitz"
        assert sum(result.weights.values()) == pytest.approx(1.0, rel=1e-3)

    def test_insufficient_data_equal_weight(self, optimizer):
        returns = np.array([[0.01, 0.02], [0.03, 0.01]])
        result = optimizer.markowitz_optimize(returns, ["A", "B"])
        assert result.method == "markowitz_equal"
        assert result.weights["A"] == pytest.approx(0.5)
        assert result.weights["B"] == pytest.approx(0.5)

    def test_single_asset_equal_weight(self, optimizer):
        returns = np.array([[0.01], [0.02], [0.03]])
        result = optimizer.markowitz_optimize(returns, ["A"])
        assert result.method == "markowitz_equal"
        assert result.weights["A"] == 1.0

    def test_sharpe_ratio(self, optimizer, returns_2asset):
        result = optimizer.markowitz_optimize(returns_2asset, ["A", "B"])
        assert isinstance(result.sharpe_ratio, float)

    def test_volatility_non_negative(self, optimizer, returns_2asset):
        result = optimizer.markowitz_optimize(returns_2asset, ["A", "B"])
        assert result.volatility >= 0


class TestBlackLitterman:
    def test_basic_with_views(self, optimizer, returns_2asset):
        views = {"A": 0.20, "B": 0.10}
        result = optimizer.black_litterman(returns_2asset, ["A", "B"], views)
        assert result.method == "black_litterman"
        assert sum(result.weights.values()) == pytest.approx(1.0, rel=1e-3)
        assert all(w >= 0 for w in result.weights.values())

    def test_with_confidences(self, optimizer, returns_2asset):
        views = {"A": 0.20, "B": 0.05}
        confs = {"A": 0.8, "B": 0.3}
        result = optimizer.black_litterman(returns_2asset, ["A", "B"], views, confs)
        assert result.method == "black_litterman"
        assert sum(result.weights.values()) == pytest.approx(1.0, rel=1e-3)

    def test_insufficient_data_equal_weight(self, optimizer):
        returns = np.array([[0.01, 0.02], [0.03, 0.01]])
        result = optimizer.black_litterman(returns, ["A", "B"], {"A": 0.1})
        assert result.method == "bl_equal"
        assert result.weights["A"] == pytest.approx(0.5)

    def test_view_not_in_symbols_ignored(self, optimizer, returns_2asset):
        views = {"C": 0.50, "A": 0.10}
        result = optimizer.black_litterman(returns_2asset, ["A", "B"], views)
        assert result.method == "black_litterman"
        assert sum(result.weights.values()) == pytest.approx(1.0, rel=1e-3)


class TestKellyCriterion:
    def test_positive_edge(self, optimizer):
        kelly = optimizer.kelly_criterion(win_rate=0.55, win_loss_ratio=1.5)
        assert kelly > 0
        # raw = (0.55*1.5 - 0.45) / 1.5 = (0.825 - 0.45) / 1.5 = 0.25
        # half = 0.125
        assert kelly == pytest.approx(0.125, rel=1e-3)

    def test_no_edge(self, optimizer):
        kelly = optimizer.kelly_criterion(win_rate=0.50, win_loss_ratio=1.0)
        # raw = (0.5*1 - 0.5) / 1 = 0 → half = 0
        assert kelly == 0.0

    def test_negative_edge(self, optimizer):
        kelly = optimizer.kelly_criterion(win_rate=0.30, win_loss_ratio=1.0)
        assert kelly == 0.0

    def test_capped_at_max_leverage(self, optimizer):
        kelly = optimizer.kelly_criterion(win_rate=0.90, win_loss_ratio=3.0, max_leverage=0.5)
        # raw = (0.9*3 - 0.1) / 3 = (2.7 - 0.1) / 3 = 0.8667 → half = 0.4333
        # capped at 0.5
        assert kelly <= 0.5

    def test_zero_ratio(self, optimizer):
        kelly = optimizer.kelly_criterion(win_rate=0.60, win_loss_ratio=0)
        assert kelly == 0.0


class TestRiskParity:
    def test_basic_2asset(self, optimizer, returns_2asset):
        result = optimizer.risk_parity(returns_2asset, ["A", "B"], target_volatility=0.15)
        assert result.method == "risk_parity"
        assert sum(result.weights.values()) == pytest.approx(1.0, rel=1e-3)
        assert all(w >= 0 for w in result.weights.values())

    def test_3asset(self, optimizer, returns_3asset):
        result = optimizer.risk_parity(returns_3asset, ["A", "B", "C"])
        assert result.method == "risk_parity"
        assert len(result.weights) == 3
        assert sum(result.weights.values()) == pytest.approx(1.0, rel=1e-3)

    def test_insufficient_data(self, optimizer):
        returns = np.array([[0.01, 0.02], [0.03, 0.01]])
        result = optimizer.risk_parity(returns, ["A", "B"])
        assert result.method == "risk_parity_equal"
        assert result.weights["A"] == pytest.approx(0.5)

    def test_volatility_non_negative(self, optimizer, returns_2asset):
        result = optimizer.risk_parity(returns_2asset, ["A", "B"])
        assert result.volatility >= 0

    def test_no_leverage(self, optimizer, returns_2asset):
        result = optimizer.risk_parity(returns_2asset, ["A", "B"], target_volatility=0.15)
        assert all(w <= 1.0 for w in result.weights.values())


class TestRebalancing:
    def test_check_rebalance_needed_true(self, optimizer):
        optimizer.set_target_weights({"A": 0.5, "B": 0.5})
        # A is 70% of portfolio → 20% deviation
        values = {"A": 700, "B": 300}
        assert optimizer.check_rebalance_needed(values) is True

    def test_check_rebalance_needed_false(self, optimizer):
        optimizer.set_target_weights({"A": 0.5, "B": 0.5})
        values = {"A": 510, "B": 490}  # 1% deviation
        assert optimizer.check_rebalance_needed(values) is False

    def test_no_target_weights(self, optimizer):
        assert optimizer.check_rebalance_needed({"A": 100}) is False

    def test_empty_values(self, optimizer):
        optimizer.set_target_weights({"A": 1.0})
        assert optimizer.check_rebalance_needed({}) is False

    def test_zero_total_value(self, optimizer):
        optimizer.set_target_weights({"A": 0.5, "B": 0.5})
        assert optimizer.check_rebalance_needed({"A": 0, "B": 0}) is False

    def test_set_target_weights_normalizes(self, optimizer):
        optimizer.set_target_weights({"A": 3, "B": 1})
        assert optimizer.target_weights["A"] == pytest.approx(0.75)
        assert optimizer.target_weights["B"] == pytest.approx(0.25)

    def test_compute_rebalance_trades(self, optimizer):
        optimizer.set_target_weights({"A": 0.5, "B": 0.5})
        trades = optimizer.compute_rebalance_trades({"A": 700, "B": 300})
        assert trades["A"] < 0  # Need to sell A
        assert trades["B"] > 0  # Need to buy B
        assert abs(trades["A"] + trades["B"]) < 1e-6  # Net zero

    def test_compute_rebalance_no_targets(self, optimizer):
        trades = optimizer.compute_rebalance_trades({"A": 100, "B": 100})
        assert trades == {}

    def test_compute_rebalance_zero_value(self, optimizer):
        optimizer.set_target_weights({"A": 0.5, "B": 0.5})
        trades = optimizer.compute_rebalance_trades({"A": 0, "B": 0})
        assert trades == {}


class TestPortfolioResult:
    def test_dataclass_fields(self):
        result = PortfolioResult(
            weights={"A": 0.6, "B": 0.4},
            expected_return=0.15,
            volatility=0.12,
            sharpe_ratio=1.08,
            method="test",
        )
        assert result.weights == {"A": 0.6, "B": 0.4}
        assert result.expected_return == 0.15
        assert result.volatility == 0.12
        assert result.sharpe_ratio == 1.08
        assert result.method == "test"


class TestAssetStats:
    def test_defaults(self):
        stats = AssetStats(symbol="BTC")
        assert stats.symbol == "BTC"
        assert stats.expected_return == 0.0
        assert stats.volatility == 0.0
        assert stats.weight == 0.0
