"""Tests for Stochastic Optimal Control (HJB) model."""
import math

import pytest

from src.research.stochastic_control import (
    StochasticControlResult,
    compute_returns,
    sc_signal,
    solve_hjb,
    stochastic_control_analysis,
)


def _prices(n=120, trend=0.001):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + trend + 0.005 * (i % 5 - 2)))
    return prices


def _grid(n_x=20, n_t=10):
    """Standard HJB grid."""
    x_grid = [0.1 + i * (2.9 / (n_x - 1)) for i in range(n_x)]
    dt = 1.0 / n_t
    t_grid = [i * dt for i in range(n_t + 1)]
    return x_grid, t_grid, dt, 2.9 / (n_x - 1)


class TestComputeReturns:
    def test_basic(self):
        returns = compute_returns([100.0, 110.0, 121.0])
        assert returns == pytest.approx([0.1, 0.1])

    def test_length(self):
        assert len(compute_returns(_prices(50))) == 49


class TestSolveHJB:
    def test_basic_solve(self):
        x_grid, t_grid, dt, dx = _grid()
        result = solve_hjb(x_grid, t_grid, 0.1, 0.2, 2.0, 0.05, dt, dx)
        assert len(result["V"]) == len(t_grid)
        assert len(result["U"]) == len(t_grid)
        assert len(result["V"][0]) == len(x_grid)

    def test_terminal_condition_log(self):
        x_grid, t_grid, dt, dx = _grid()
        result = solve_hjb(x_grid, t_grid, 0.1, 0.2, 2.0, 0.05, dt, dx)
        last = result["V"][-1]
        assert last[5] == pytest.approx(math.log(x_grid[5]))

    def test_policy_bounded(self):
        x_grid, t_grid, dt, dx = _grid()
        result = solve_hjb(x_grid, t_grid, 0.1, 0.2, 2.0, 0.05, dt, dx)
        assert all(-2.0 <= u <= 2.0 for row in result["U"] for u in row)

    def test_value_finite(self):
        x_grid, t_grid, dt, dx = _grid()
        result = solve_hjb(x_grid, t_grid, 0.1, 0.2, 2.0, 0.05, dt, dx)
        assert all(math.isfinite(v) for row in result["V"] for v in row)

    def test_positive_drift_long_policy(self):
        x_grid, t_grid, dt, dx = _grid()
        result = solve_hjb(x_grid, t_grid, 0.5, 0.1, 0.5, 0.05, dt, dx)
        mid = len(x_grid) // 2
        assert result["U"][0][mid] > 0


class TestSCSignal:
    def test_long(self):
        signal, reason = sc_signal(0.5, 2.0)
        assert signal == "LONG"

    def test_short(self):
        signal, reason = sc_signal(-0.5, 2.0)
        assert signal == "SHORT"

    def test_neutral(self):
        signal, reason = sc_signal(0.1, 2.0)
        assert signal == "NEUTRAL"

    def test_boundary_long(self):
        signal, reason = sc_signal(0.3, 2.0)
        assert signal == "NEUTRAL"


class TestStochasticControlAnalysis:
    def test_basic_analysis(self):
        result = stochastic_control_analysis(_prices(120))
        assert isinstance(result, StochasticControlResult)

    def test_insufficient_prices_returns_none(self):
        assert stochastic_control_analysis(_prices(20)) is None

    def test_empty_returns_none(self):
        assert stochastic_control_analysis([]) is None

    def test_signal_in_set(self):
        result = stochastic_control_analysis(_prices(120))
        assert result.signal in {"LONG", "SHORT", "NEUTRAL"}

    def test_optimal_position_bounded(self):
        result = stochastic_control_analysis(_prices(120))
        assert -2.0 <= result.optimal_position <= 2.0

    def test_current_value_finite(self):
        result = stochastic_control_analysis(_prices(120))
        assert math.isfinite(result.current_value)

    def test_mu_sigma_positive(self):
        result = stochastic_control_analysis(_prices(120))
        assert result.sigma > 0
        assert math.isfinite(result.mu)

    def test_sharpe_finite(self):
        result = stochastic_control_analysis(_prices(120))
        assert math.isfinite(result.sharpe)

    def test_position_trajectory_length(self):
        result = stochastic_control_analysis(_prices(120), n_t=20)
        assert len(result.position_trajectory) == 20

    def test_value_slices_count(self):
        result = stochastic_control_analysis(_prices(120))
        assert len(result.value_slices) == 4

    def test_grid_shapes(self):
        result = stochastic_control_analysis(_prices(120), n_x=40, n_t=15)
        assert len(result.x_grid) == 40
        assert len(result.t_grid) == 16

    def test_custom_gamma(self):
        result = stochastic_control_analysis(_prices(120), gamma=5.0)
        assert isinstance(result, StochasticControlResult)

    def test_trending_prices_long(self):
        result = stochastic_control_analysis(_prices(120, trend=0.01), gamma=0.5)
        assert result.optimal_position > 0
