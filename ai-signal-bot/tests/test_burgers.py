"""Tests for Burgers Equation model."""
import math

import pytest

from src.research.burgers import (
    BurgersResult,
    burgers_analysis,
    burgers_signal,
    compute_returns,
    shock_threshold,
    solve_burgers,
)


def _prices(n=150):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


def _grid(n=40):
    """Standard grid for solver tests."""
    return [-2.0 + i * (4.0 / (n - 1)) for i in range(n)]


class TestComputeReturns:
    def test_basic(self):
        returns = compute_returns([100.0, 110.0, 121.0])
        assert returns == pytest.approx([0.1, 0.1])

    def test_single_pair(self):
        returns = compute_returns([100.0, 105.0])
        assert returns == pytest.approx([0.05])

    def test_negative_returns(self):
        returns = compute_returns([100.0, 90.0])
        assert returns == pytest.approx([-0.1])


class TestShockThreshold:
    def test_rms_based(self):
        u = [1.0, -1.0, 1.0, -1.0]
        assert shock_threshold(u) == pytest.approx(2.0)

    def test_positive(self):
        assert shock_threshold([0.1, 0.2, 0.3]) > 0

    def test_zeros(self):
        assert shock_threshold([0.0, 0.0, 0.0]) == pytest.approx(0.0)


class TestSolveBurgers:
    def test_length(self):
        x_grid = _grid()
        u0 = [math.sin(x) for x in x_grid]
        result = solve_burgers(u0, x_grid, 0.001, 50, 0.01)
        assert len(result["final_u"]) == len(x_grid)

    def test_history_non_empty(self):
        x_grid = _grid()
        u0 = [math.sin(x) for x in x_grid]
        result = solve_burgers(u0, x_grid, 0.001, 50, 0.01)
        assert len(result["history"]) > 1

    def test_final_finite(self):
        x_grid = _grid()
        u0 = [math.sin(x) for x in x_grid]
        result = solve_burgers(u0, x_grid, 0.001, 50, 0.01)
        assert all(math.isfinite(v) for v in result["final_u"])

    def test_periodic_boundary(self):
        x_grid = _grid()
        u0 = [math.sin(x) for x in x_grid]
        result = solve_burgers(u0, x_grid, 0.001, 50, 0.01)
        assert result["final_u"][0] == pytest.approx(result["final_u"][-2])
        assert result["final_u"][-1] == pytest.approx(result["final_u"][1])

    def test_zero_velocity_stays(self):
        # u=0 everywhere → no advection, no diffusion → stays 0
        x_grid = _grid()
        u0 = [0.0] * len(x_grid)
        result = solve_burgers(u0, x_grid, 0.01, 50, 0.01)
        assert all(v == pytest.approx(0.0) for v in result["final_u"])

    def test_diffusion_smooths(self):
        # Sharp spike → diffusion spreads it
        x_grid = _grid()
        u0 = [0.0] * len(x_grid)
        u0[len(x_grid) // 2] = 1.0
        result = solve_burgers(u0, x_grid, 0.001, 200, 0.1)
        # Neighbors of the spike should have non-zero values after diffusion
        mid = len(x_grid) // 2
        assert result["final_u"][mid - 1] > 0
        assert result["final_u"][mid + 1] > 0

    def test_shock_points_list(self):
        x_grid = _grid()
        u0 = [math.sin(x) for x in x_grid]
        result = solve_burgers(u0, x_grid, 0.001, 50, 0.01)
        assert isinstance(result["shock_points"], list)

    def test_history_snapshots(self):
        x_grid = _grid()
        u0 = [math.sin(x) for x in x_grid]
        result = solve_burgers(u0, x_grid, 0.001, 100, 0.01)
        # history = initial + ~20 snapshots
        assert len(result["history"]) == 21


class TestBurgersSignal:
    def test_shock_formation(self):
        signal, reason = burgers_signal(25, -0.5, 0.01)
        assert signal == "SHOCK_FORMATION"

    def test_weak_shocks(self):
        signal, reason = burgers_signal(10, -0.3, 0.01)
        assert signal == "WEAK_SHOCKS"

    def test_smooth_flow(self):
        signal, reason = burgers_signal(2, -0.1, 0.01)
        assert signal == "SMOOTH_FLOW"

    def test_boundary_shock(self):
        signal, reason = burgers_signal(20, -0.5, 0.01)
        assert signal == "WEAK_SHOCKS"

    def test_boundary_weak(self):
        signal, reason = burgers_signal(5, -0.3, 0.01)
        assert signal == "SMOOTH_FLOW"


class TestBurgersAnalysis:
    def test_basic_analysis(self):
        result = burgers_analysis(_prices(150))
        assert isinstance(result, BurgersResult)

    def test_insufficient_prices_returns_none(self):
        assert burgers_analysis(_prices(40)) is None

    def test_empty_returns_none(self):
        assert burgers_analysis([]) is None

    def test_signal_in_set(self):
        result = burgers_analysis(_prices(150))
        assert result.signal in {"SHOCK_FORMATION", "WEAK_SHOCKS", "SMOOTH_FLOW"}

    def test_x_grid_length(self):
        result = burgers_analysis(_prices(150))
        assert len(result.x_grid) == 80

    def test_u0_in_range(self):
        result = burgers_analysis(_prices(150))
        assert all(-1.0 <= v <= 1.0 for v in result.u0)

    def test_energy_history_non_empty(self):
        result = burgers_analysis(_prices(150))
        assert len(result.energy_history) > 1

    def test_energy_non_negative(self):
        result = burgers_analysis(_prices(150))
        assert all(e["energy"] >= 0 for e in result.energy_history)

    def test_entropy_history_non_empty(self):
        result = burgers_analysis(_prices(150))
        assert len(result.entropy_history) > 1

    def test_total_shocks_non_negative(self):
        result = burgers_analysis(_prices(150))
        assert result.total_shocks >= 0

    def test_max_shock_grad_finite(self):
        result = burgers_analysis(_prices(150))
        assert math.isfinite(result.max_shock_grad)

    def test_energy_decay_finite(self):
        result = burgers_analysis(_prices(150))
        assert math.isfinite(result.energy_decay)

    def test_shock_times_dict(self):
        result = burgers_analysis(_prices(150))
        assert isinstance(result.shock_times, dict)

    def test_dx_positive(self):
        result = burgers_analysis(_prices(150))
        assert result.dx > 0

    def test_final_u_finite(self):
        result = burgers_analysis(_prices(150))
        assert all(math.isfinite(v) for v in result.result["final_u"])

    def test_zero_viscosity_more_shocks(self):
        # Lower viscosity → more nonlinear steepening → more shocks
        visc = burgers_analysis(_prices(150), nu=0.0)
        smooth = burgers_analysis(_prices(150), nu=0.1)
        assert visc.total_shocks >= smooth.total_shocks

    def test_custom_steps(self):
        result = burgers_analysis(_prices(150), n_steps=100)
        assert len(result.energy_history) > 1

    def test_energy_decays(self):
        result = burgers_analysis(_prices(150))
        assert result.energy_history[-1]["energy"] <= result.energy_history[0]["energy"] + 1e-9
