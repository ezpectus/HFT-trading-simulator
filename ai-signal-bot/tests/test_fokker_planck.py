"""Tests for Fokker-Planck Equation model."""
import math

import pytest

from src.research.fokker_planck import (
    FokkerPlanckResult,
    compute_returns,
    fokker_planck_analysis,
    fp_signal,
    solve_fokker_planck,
)


def _prices(n=120):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


def _grid(n=40):
    """Standard grid for solver tests."""
    x_grid = [-2.0 + i * (4.0 / (n - 1)) for i in range(n)]
    p0 = [math.exp(-x * x / 2) for x in x_grid]
    total = sum(p0) * (x_grid[1] - x_grid[0])
    p0 = [v / total for v in p0]
    return x_grid, p0


class TestComputeReturns:
    def test_basic(self):
        returns = compute_returns([100.0, 110.0, 121.0])
        assert returns == pytest.approx([0.1, 0.1])


class TestSolveFokkerPlanck:
    def test_basic_solve(self):
        x_grid, p0 = _grid()
        result = solve_fokker_planck(x_grid, p0, lambda x: 0.0, lambda x: 0.1, 0.01, 50)
        assert len(result["final_p"]) == len(x_grid)
        assert len(result["history"]) > 1

    def test_density_non_negative(self):
        x_grid, p0 = _grid()
        result = solve_fokker_planck(x_grid, p0, lambda x: 0.0, lambda x: 0.1, 0.01, 50)
        assert all(v >= 0 for v in result["final_p"])

    def test_density_normalized(self):
        x_grid, p0 = _grid()
        result = solve_fokker_planck(x_grid, p0, lambda x: 0.0, lambda x: 0.1, 0.01, 50)
        total = sum(result["final_p"]) * (x_grid[1] - x_grid[0])
        assert total == pytest.approx(1.0, abs=0.05)

    def test_diffusion_spreads_density(self):
        x_grid, p0 = _grid()
        # Narrow initial
        p0_narrow = [math.exp(-x * x / 0.1) for x in x_grid]
        total = sum(p0_narrow) * (x_grid[1] - x_grid[0])
        p0_narrow = [v / total for v in p0_narrow]
        result = solve_fokker_planck(x_grid, p0_narrow, lambda x: 0.0, lambda x: 0.5, 0.01, 100)
        # Variance should increase
        var0 = sum((x_grid[i] - 0) ** 2 * p0_narrow[i] for i in range(len(x_grid))) * (x_grid[1] - x_grid[0])
        var1 = sum((x_grid[i] - 0) ** 2 * result["final_p"][i] for i in range(len(x_grid))) * (x_grid[1] - x_grid[0])
        assert var1 > var0


class TestFPSignal:
    def test_bullish(self):
        signal, reason = fp_signal(0.02, 0.01)
        assert signal == "BULLISH_DENSITY"

    def test_bearish(self):
        signal, reason = fp_signal(-0.02, -0.01)
        assert signal == "BEARISH_DENSITY"

    def test_neutral(self):
        signal, reason = fp_signal(0.01, 0.01)
        assert signal == "NEUTRAL"

    def test_boundary_bullish(self):
        signal, reason = fp_signal(0.011, 0.01)
        assert signal == "NEUTRAL"


class TestFokkerPlanckAnalysis:
    def test_basic_analysis_ou(self):
        result = fokker_planck_analysis(_prices(120), model_type="ou")
        assert isinstance(result, FokkerPlanckResult)

    def test_gbm_model(self):
        result = fokker_planck_analysis(_prices(120), model_type="gbm")
        assert isinstance(result, FokkerPlanckResult)

    def test_const_model(self):
        result = fokker_planck_analysis(_prices(120), model_type="const")
        assert isinstance(result, FokkerPlanckResult)

    def test_insufficient_prices_returns_none(self):
        assert fokker_planck_analysis(_prices(20)) is None

    def test_empty_returns_none(self):
        assert fokker_planck_analysis([]) is None

    def test_signal_in_set(self):
        result = fokker_planck_analysis(_prices(120))
        assert result.signal in {"BULLISH_DENSITY", "BEARISH_DENSITY", "NEUTRAL"}

    def test_x_grid_length(self):
        result = fokker_planck_analysis(_prices(120))
        assert len(result.x_grid) == 80

    def test_p0_normalized(self):
        result = fokker_planck_analysis(_prices(120))
        total = sum(result.p0) * result.dx
        assert total == pytest.approx(1.0, abs=0.01)

    def test_forecast_p_non_negative(self):
        result = fokker_planck_analysis(_prices(120))
        assert all(v >= 0 for v in result.forecast_p)

    def test_var5_finite(self):
        result = fokker_planck_analysis(_prices(120))
        assert math.isfinite(result.var5)

    def test_median_finite(self):
        result = fokker_planck_analysis(_prices(120))
        assert math.isfinite(result.median)

    def test_kl_div_non_negative(self):
        result = fokker_planck_analysis(_prices(120))
        assert result.kl_div >= -0.01

    def test_params_present(self):
        result = fokker_planck_analysis(_prices(120))
        assert result.params["kappa"] > 0
        assert result.params["sigma_ou"] > 0

    def test_history_length(self):
        result = fokker_planck_analysis(_prices(120), n_steps=100)
        assert len(result.history) > 1

    def test_stationary_p_positive(self):
        result = fokker_planck_analysis(_prices(120))
        assert all(v > 0 for v in result.stationary_p)
