"""Unit tests for risk and portfolio optimization."""

import numpy as np
import pytest

from src.risk.kelly import KellyPositionSizer
from src.risk.portfolio_optimizer import PortfolioOptimizer, PortfolioResult


def make_returns(n=300, n_assets=3):
    rng = np.random.default_rng(42)
    returns = rng.multivariate_normal(
        mean=[0.001, 0.002, 0.0015],
        cov=[[0.004, 0.001, 0.0005],
             [0.001, 0.006, 0.001],
             [0.0005, 0.001, 0.003]],
        size=n,
    )
    return returns


class TestPortfolioOptimizer:
    def test_markowitz(self):
        opt = PortfolioOptimizer()
        returns = make_returns()
        result = opt.markowitz_optimize(returns, ["BTC", "ETH", "SOL"])
        assert sum(result.weights.values()) == pytest.approx(1.0, abs=0.01)
        assert result.method == "markowitz"

    def test_risk_parity(self):
        opt = PortfolioOptimizer()
        returns = make_returns()
        result = opt.risk_parity(returns, ["BTC", "ETH", "SOL"])
        assert sum(result.weights.values()) == pytest.approx(1.0, abs=0.01)
        assert result.method == "risk_parity"

    def test_black_litterman(self):
        opt = PortfolioOptimizer()
        returns = make_returns()
        views = {"BTC": 0.05, "ETH": 0.08}
        confidences = {"BTC": 0.7, "ETH": 0.6}
        result = opt.black_litterman(returns, ["BTC", "ETH", "SOL"], views, confidences)
        assert sum(result.weights.values()) == pytest.approx(1.0, abs=0.05)
        assert result.method == "black_litterman"

    def test_kelly_criterion(self):
        opt = PortfolioOptimizer()
        kelly = opt.kelly_criterion(win_rate=0.55, win_loss_ratio=1.5, max_leverage=1.0)
        assert 0 < kelly <= 1.0

    def test_kelly_zero(self):
        opt = PortfolioOptimizer()
        kelly = opt.kelly_criterion(win_rate=0.3, win_loss_ratio=0.5)
        assert kelly == 0.0

    def test_rebalance_check(self):
        opt = PortfolioOptimizer()
        opt.set_target_weights({"BTC": 0.5, "ETH": 0.5})
        # Within threshold
        assert not opt.check_rebalance_needed({"BTC": 52000, "ETH": 48000})
        # Outside threshold
        assert opt.check_rebalance_needed({"BTC": 90000, "ETH": 10000})

    def test_rebalance_trades(self):
        opt = PortfolioOptimizer()
        opt.set_target_weights({"BTC": 0.5, "ETH": 0.5})
        trades = opt.compute_rebalance_trades({"BTC": 80000, "ETH": 20000})
        assert trades["BTC"] < 0  # Need to sell BTC
        assert trades["ETH"] > 0  # Need to buy ETH
