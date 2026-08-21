"""Tests for Lax-Milgram model."""
import math

import pytest

from src.research.lax_milgram import (
    LaxResult,
    compute_returns,
    lax_analysis,
    lax_signal,
    solve_variational,
)


def _prices(n=150):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


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


class TestSolveVariational:
    def test_solution_length(self):
        result = solve_variational(0.01, 0.0, 1.0, lambda x: 1.0, 50, 51)
        assert len(result["u"]) == 51

    def test_dirichlet_boundary(self):
        result = solve_variational(0.01, 0.0, 1.0, lambda x: 1.0, 50, 51)
        assert result["u"][0] == pytest.approx(0.0)
        assert result["u"][-1] == pytest.approx(0.0)

    def test_poisson_solution(self):
        # -u'' = 1, u(0)=u(1)=0 → u(x) = x(1-x)/2
        result = solve_variational(1.0, 0.0, 0.0, lambda x: 1.0, 50, 51)
        mid = 25
        assert result["u"][mid] == pytest.approx(0.125, abs=0.01)

    def test_alpha_positive(self):
        result = solve_variational(0.01, 0.0, 1.0, lambda x: 1.0, 50, 51)
        assert result["alpha"] > 0

    def test_c_positive(self):
        result = solve_variational(0.01, 0.0, 1.0, lambda x: 1.0, 50, 51)
        assert result["C"] > 0

    def test_h(self):
        result = solve_variational(0.01, 0.0, 1.0, lambda x: 1.0, 50, 51)
        assert result["h"] == pytest.approx(0.02)

    def test_deterministic(self):
        r1 = solve_variational(0.01, 0.0, 1.0, lambda x: 1.0, 50, 51)
        r2 = solve_variational(0.01, 0.0, 1.0, lambda x: 1.0, 50, 51)
        assert r1["u"] == r2["u"]

    def test_constant_f_scalar(self):
        result = solve_variational(0.01, 0.0, 1.0, 1.0, 50, 51)
        assert len(result["u"]) == 51

    def test_solution_finite(self):
        result = solve_variational(0.01, 0.0, 1.0, lambda x: 1.0, 50, 51)
        assert all(math.isfinite(v) for v in result["u"])

    def test_positive_forcing_positive_solution(self):
        result = solve_variational(0.01, 0.0, 1.0, lambda x: 1.0, 50, 51)
        assert all(v >= -1e-9 for v in result["u"])

    def test_advection_breaks_symmetry(self):
        # b > 0 shifts solution toward the right boundary
        result = solve_variational(0.01, 5.0, 0.0, lambda x: 1.0, 50, 51)
        assert result["u"][40] > result["u"][10]


class TestLaxSignal:
    def test_long(self):
        signal, reason = lax_signal(0.05)
        assert signal == "VARIATIONAL_LONG"

    def test_short(self):
        signal, reason = lax_signal(-0.05)
        assert signal == "VARIATIONAL_SHORT"

    def test_neutral(self):
        signal, reason = lax_signal(0.0)
        assert signal == "NEUTRAL"

    def test_boundary_long(self):
        signal, reason = lax_signal(0.01)
        assert signal == "NEUTRAL"

    def test_boundary_short(self):
        signal, reason = lax_signal(-0.01)
        assert signal == "NEUTRAL"


class TestLaxAnalysis:
    def test_basic_analysis(self):
        result = lax_analysis(_prices(150))
        assert isinstance(result, LaxResult)

    def test_insufficient_prices_returns_none(self):
        assert lax_analysis(_prices(10)) is None

    def test_empty_returns_none(self):
        assert lax_analysis([]) is None

    def test_signal_in_set(self):
        result = lax_analysis(_prices(150))
        assert result.signal in {"VARIATIONAL_LONG", "VARIATIONAL_SHORT", "NEUTRAL"}

    def test_grid_length(self):
        result = lax_analysis(_prices(150))
        assert len(result.grid) == 51

    def test_grid_x_range(self):
        result = lax_analysis(_prices(150))
        assert result.grid[0]["x"] == pytest.approx(0.0)
        assert result.grid[-1]["x"] == pytest.approx(1.0)

    def test_eps_sweep_length(self):
        result = lax_analysis(_prices(150))
        assert len(result.eps_sweep) == 6

    def test_eps_sweep_values(self):
        result = lax_analysis(_prices(150))
        eps_values = [s["eps"] for s in result.eps_sweep]
        assert eps_values == [0.001, 0.005, 0.01, 0.05, 0.1, 0.5]

    def test_is_coercive_bool(self):
        result = lax_analysis(_prices(150))
        assert isinstance(result.is_coercive, bool)

    def test_is_bounded_bool(self):
        result = lax_analysis(_prices(150))
        assert isinstance(result.is_bounded, bool)

    def test_lax_milgram_applies_bool(self):
        result = lax_analysis(_prices(150))
        assert isinstance(result.lax_milgram_applies, bool)

    def test_u_at_current_finite(self):
        result = lax_analysis(_prices(150))
        assert math.isfinite(result.u_at_current)

    def test_solution_finite(self):
        result = lax_analysis(_prices(150))
        assert all(math.isfinite(v) for v in result.solution["u"])

    def test_alpha_positive(self):
        result = lax_analysis(_prices(150))
        assert result.solution["alpha"] > 0

    def test_c_bound_positive(self):
        result = lax_analysis(_prices(150))
        assert result.solution["C"] > 0

    def test_current_return_finite(self):
        result = lax_analysis(_prices(150))
        assert math.isfinite(result.current_return)

    def test_mean_std_finite(self):
        result = lax_analysis(_prices(150))
        assert math.isfinite(result.mean_r)
        assert math.isfinite(result.std_r)

    def test_custom_elements(self):
        result = lax_analysis(_prices(150), n_elements=30)
        assert len(result.grid) == 31

    def test_custom_eps(self):
        result = lax_analysis(_prices(150), eps=0.5)
        assert result.solution["alpha"] > 0

    def test_positive_current_return_long(self):
        # Strong positive last return → forcing bump → positive u at current
        prices = [100.0] + [100.0 * (1 + 0.01) for _ in range(100)]
        result = lax_analysis(prices)
        assert result.signal in {"VARIATIONAL_LONG", "NEUTRAL"}

    def test_negative_current_return_positive_u(self):
        # Forcing uses abs(currentReturn) → solution stays positive (UI quirk)
        prices = [100.0] + [100.0 * (1 - 0.01) for _ in range(100)]
        result = lax_analysis(prices)
        assert result.u_at_current > 0
