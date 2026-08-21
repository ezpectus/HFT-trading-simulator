"""Tests for Pontryagin Maximum Principle model."""
import math

import pytest

from src.research.pontryagin import (
    PontryaginResult,
    compute_returns,
    pmp_signal,
    pontryagin_analysis,
    solve_pmp,
)


def _prices(n=120):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


class TestComputeReturns:
    def test_basic(self):
        returns = compute_returns([100.0, 110.0, 121.0])
        assert returns == pytest.approx([0.1, 0.1])


class TestSolvePMP:
    def test_basic_solve(self):
        result = solve_pmp(1.0, 1.0, 0.1, 0.01, 0.05, 50)
        assert result["trajectory"] is not None
        assert len(result["trajectory"]) == 50

    def test_terminal_inventory_zero(self):
        result = solve_pmp(1.0, 1.0, 0.1, 0.01, 0.05, 100)
        assert abs(result["trajectory"][-1]["x"]) < 0.1

    def test_initial_inventory(self):
        result = solve_pmp(1.0, 1.0, 0.1, 0.01, 0.05, 50)
        assert result["trajectory"][0]["x"] == pytest.approx(1.0)

    def test_total_cost_positive(self):
        result = solve_pmp(1.0, 1.0, 0.1, 0.01, 0.05, 50)
        assert result["total_cost"] > 0

    def test_twap_cost_positive(self):
        result = solve_pmp(1.0, 1.0, 0.1, 0.01, 0.05, 50)
        assert result["twap_cost"] > 0

    def test_savings_non_negative(self):
        result = solve_pmp(1.0, 1.0, 0.1, 0.01, 0.05, 100)
        assert result["savings"] >= -0.01

    def test_selling_trajectory(self):
        result = solve_pmp(1.0, 1.0, 0.1, 0.01, 0.05, 50)
        assert all(t["u"] <= 0.01 for t in result["trajectory"])


class TestPMPSignal:
    def test_significant_savings(self):
        signal, reason = pmp_signal(15.0)
        assert signal == "SIGNIFICANT_SAVINGS"

    def test_optimal_execution(self):
        signal, reason = pmp_signal(5.0)
        assert signal == "OPTIMAL_EXECUTION"

    def test_twap_preferred(self):
        signal, reason = pmp_signal(-2.0)
        assert signal == "TWAP_PREFERRED"

    def test_boundary_significant(self):
        signal, reason = pmp_signal(10.0)
        assert signal == "OPTIMAL_EXECUTION"


class TestPontryaginAnalysis:
    def test_basic_analysis(self):
        result = pontryagin_analysis(_prices(120))
        assert isinstance(result, PontryaginResult)

    def test_insufficient_prices_returns_none(self):
        assert pontryagin_analysis(_prices(20)) is None

    def test_empty_returns_none(self):
        assert pontryagin_analysis([]) is None

    def test_signal_in_set(self):
        result = pontryagin_analysis(_prices(120))
        assert result.signal in {"SIGNIFICANT_SAVINGS", "OPTIMAL_EXECUTION", "TWAP_PREFERRED"}

    def test_trajectory_length(self):
        result = pontryagin_analysis(_prices(120))
        assert len(result.trajectory) == 100

    def test_total_cost_finite(self):
        result = pontryagin_analysis(_prices(120))
        assert math.isfinite(result.total_cost)

    def test_twap_cost_positive(self):
        result = pontryagin_analysis(_prices(120))
        assert result.twap_cost > 0

    def test_immediate_cost_positive(self):
        result = pontryagin_analysis(_prices(120))
        assert result.immediate_cost > 0

    def test_savings_pct_finite(self):
        result = pontryagin_analysis(_prices(120))
        assert math.isfinite(result.savings_pct)

    def test_trade_direction_in_set(self):
        result = pontryagin_analysis(_prices(120))
        assert result.trade_direction in {"SELLING", "BUYING", "NEUTRAL"}

    def test_eta_calibrated_positive(self):
        result = pontryagin_analysis(_prices(120))
        assert result.eta_calibrated > 0

    def test_custom_params(self):
        result = pontryagin_analysis(_prices(120), kappa=0.2, lambda_=0.02, eta=0.1, x0=2.0, t=0.5)
        assert isinstance(result, PontryaginResult)

    def test_current_u_finite(self):
        result = pontryagin_analysis(_prices(120))
        assert math.isfinite(result.current_u)
