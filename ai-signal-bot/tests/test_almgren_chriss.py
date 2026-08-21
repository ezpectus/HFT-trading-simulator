"""Tests for Almgren-Chriss optimal execution model."""
import math

import pytest

from src.research.almgren_chriss import (
    AlmgrenChrissResult,
    almgren_chriss,
    almgren_chriss_analysis,
    efficient_frontier,
    estimate_volatility,
)


class TestAlmgrenChriss:
    def test_invalid_x_returns_none(self):
        assert almgren_chriss(0, 1.0, 0.02, 0.1, 0.01, 1e-6) is None

    def test_invalid_t_returns_none(self):
        assert almgren_chriss(100, 0, 0.02, 0.1, 0.01, 1e-6) is None

    def test_invalid_sigma_returns_none(self):
        assert almgren_chriss(100, 1.0, 0, 0.1, 0.01, 1e-6) is None

    def test_invalid_eta_returns_none(self):
        assert almgren_chriss(100, 1.0, 0.02, 0, 0.01, 1e-6) is None

    def test_basic_result(self):
        result = almgren_chriss(100, 1.0, 0.02, 0.1, 0.01, 1e-6)
        assert isinstance(result, AlmgrenChrissResult)
        assert result.n_steps == 20

    def test_trajectory_starts_at_x(self):
        result = almgren_chriss(100, 1.0, 0.02, 0.1, 0.01, 1e-6)
        assert result.trajectory[0]["x"] == pytest.approx(100.0)

    def test_trajectory_ends_at_zero(self):
        result = almgren_chriss(100, 1.0, 0.02, 0.1, 0.01, 1e-6)
        assert result.trajectory[-1]["x"] == pytest.approx(0.0, abs=1e-9)

    def test_trajectory_monotonic_decreasing(self):
        result = almgren_chriss(100, 1.0, 0.02, 0.1, 0.01, 1e-6)
        xs = [p["x"] for p in result.trajectory]
        assert xs == sorted(xs, reverse=True)

    def test_trades_sum_to_x(self):
        result = almgren_chriss(100, 1.0, 0.02, 0.1, 0.01, 1e-6)
        total = sum(tr["amount"] for tr in result.trades)
        assert total == pytest.approx(100.0, abs=1e-6)

    def test_expected_cost_positive(self):
        result = almgren_chriss(100, 1.0, 0.02, 0.1, 0.01, 1e-6)
        assert result.expected_cost > 0

    def test_std_dev_positive(self):
        result = almgren_chriss(100, 1.0, 0.02, 0.1, 0.01, 1e-6)
        assert result.std_dev > 0

    def test_utility_consistency(self):
        result = almgren_chriss(100, 1.0, 0.02, 0.1, 0.01, 1e-6)
        variance = result.std_dev ** 2
        assert result.utility == pytest.approx(result.expected_cost + 1e-6 * variance)

    def test_kappa_positive(self):
        result = almgren_chriss(100, 1.0, 0.02, 0.1, 0.01, 1e-6)
        assert result.kappa > 0

    def test_perm_impact_cost(self):
        result = almgren_chriss(100, 1.0, 0.02, 0.1, 0.01, 1e-6)
        assert result.perm_impact_cost == pytest.approx(0.5 * 0.01 * 100 * 100)

    def test_high_risk_aversion_lower_variance(self):
        low = almgren_chriss(100, 1.0, 0.02, 0.1, 0.01, 1e-6)
        high = almgren_chriss(100, 1.0, 0.02, 0.1, 0.01, 1.0)
        assert high.std_dev < low.std_dev

    def test_high_risk_aversion_higher_cost(self):
        low = almgren_chriss(100, 1.0, 0.02, 0.1, 0.01, 1e-6)
        high = almgren_chriss(100, 1.0, 0.02, 0.1, 0.01, 1.0)
        assert high.expected_cost > low.expected_cost

    def test_zero_lambda_linear_trajectory(self):
        result = almgren_chriss(100, 1.0, 0.02, 0.1, 0.01, 0.0)
        mid = result.trajectory[result.n_steps // 2]["x"]
        assert mid == pytest.approx(50.0, abs=1e-6)

    def test_custom_n_steps(self):
        result = almgren_chriss(100, 1.0, 0.02, 0.1, 0.01, 1e-6, n_steps=50)
        assert result.n_steps == 50
        assert len(result.trades) == 50


class TestTWAPComparison:
    def test_twap_std_dev_ge_ac(self):
        result = almgren_chriss(100, 1.0, 0.02, 0.1, 0.01, 1.0)
        assert result.twap_std_dev > result.std_dev

    def test_twap_utility_ge_ac_utility(self):
        result = almgren_chriss(100, 1.0, 0.02, 0.1, 0.01, 1.0)
        assert result.twap_utility >= result.utility

    def test_twap_cost_positive(self):
        result = almgren_chriss(100, 1.0, 0.02, 0.1, 0.01, 1e-6)
        assert result.twap_cost > 0


class TestEfficientFrontier:
    def test_frontier_length(self):
        frontier = efficient_frontier(100, 1.0, 0.02, 0.1, 0.01)
        assert len(frontier) == 13

    def test_frontier_costs_positive(self):
        frontier = efficient_frontier(100, 1.0, 0.02, 0.1, 0.01)
        assert all(f["cost"] > 0 for f in frontier)

    def test_frontier_std_devs_positive(self):
        frontier = efficient_frontier(100, 1.0, 0.02, 0.1, 0.01)
        assert all(f["std_dev"] > 0 for f in frontier)

    def test_frontier_lambda_increasing(self):
        frontier = efficient_frontier(100, 1.0, 0.02, 0.1, 0.01)
        lambdas = [f["lambda"] for f in frontier]
        assert lambdas == sorted(lambdas)

    def test_high_lambda_lower_std_dev(self):
        frontier = efficient_frontier(100, 1.0, 0.02, 0.1, 0.01)
        assert frontier[-1]["std_dev"] < frontier[0]["std_dev"]


class TestEstimateVolatility:
    def test_basic_volatility(self):
        prices = [100.0 * (1 + 0.01 * (i % 3 - 1)) for i in range(30)]
        sigma = estimate_volatility(prices)
        assert sigma > 0

    def test_constant_prices_zero_vol(self):
        assert estimate_volatility([100.0] * 30) == pytest.approx(0.0)

    def test_insufficient_prices_default(self):
        assert estimate_volatility([100.0]) == pytest.approx(0.02)

    def test_empty_prices_default(self):
        assert estimate_volatility([]) == pytest.approx(0.02)


class TestAlmgrenChrissAnalysis:
    def test_analysis_from_prices(self):
        prices = [100.0 * (1 + 0.005 * (i % 5 - 2)) for i in range(40)]
        result = almgren_chriss_analysis(prices, order_size=100, time_horizon=1.0)
        assert isinstance(result, AlmgrenChrissResult)

    def test_analysis_custom_params(self):
        prices = [100.0 * (1 + 0.005 * (i % 5 - 2)) for i in range(40)]
        result = almgren_chriss_analysis(
            prices, order_size=50, time_horizon=2.0, eta=0.2, gamma=0.02, lambda_=1e-5, n_steps=10
        )
        assert result.n_steps == 10
        assert result.perm_impact_cost == pytest.approx(0.5 * 0.02 * 50 * 50)
