"""Tests for Banach Fixed-Point model."""
import math

import pytest

from src.research.banach import (
    BanachResult,
    banach_analysis,
    banach_signal,
    best_response,
    compute_returns,
    contraction_constant,
    fixed_point_iteration,
)


def _prices(n=150):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


def _params(coupling=0.05):
    """Converging game parameters (q < 1)."""
    return {
        "a1": 0.02,
        "b1": 0.05,
        "c1": coupling,
        "a2": -0.01,
        "b2": 0.05,
        "c2": coupling,
    }


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


class TestBestResponse:
    def test_formula(self):
        params = _params()
        result = best_response(0.1, 0.2, params)
        assert result["x"] == pytest.approx((0.02 - 0.05 * 0.2) / 0.1)
        assert result["y"] == pytest.approx((-0.01 - 0.05 * 0.1) / 0.1)

    def test_zero_coupling_independent(self):
        params = _params(coupling=0.0)
        result = best_response(0.1, 0.2, params)
        assert result["x"] == pytest.approx(0.02 / 0.1)
        assert result["y"] == pytest.approx(-0.01 / 0.1)

    def test_deterministic(self):
        params = _params()
        assert best_response(0.1, 0.2, params) == best_response(0.1, 0.2, params)


class TestContractionConstant:
    def test_formula(self):
        params = _params(coupling=0.05)
        assert contraction_constant(params) == pytest.approx(math.sqrt(0.0025 / 0.01))

    def test_less_than_one_small_coupling(self):
        assert contraction_constant(_params(coupling=0.05)) < 1

    def test_greater_than_one_large_coupling(self):
        assert contraction_constant(_params(coupling=0.3)) > 1

    def test_zero_coupling_zero(self):
        assert contraction_constant(_params(coupling=0.0)) == pytest.approx(0.0)

    def test_non_negative(self):
        assert contraction_constant(_params(coupling=0.1)) >= 0


class TestFixedPointIteration:
    def test_trajectory_non_empty(self):
        result = fixed_point_iteration(0.01, -0.005, _params(), 50)
        assert len(result["trajectory"]) > 1

    def test_converges_to_nash(self):
        params = _params(coupling=0.05)
        result = fixed_point_iteration(0.01, -0.005, params, 50)
        det = 4 * 0.05 * 0.05 - 0.05 * 0.05
        nash_x = (0.02 * 0.1 - 0.05 * (-0.01)) / det
        nash_y = ((-0.01) * 0.1 - 0.05 * 0.02) / det
        last = result["trajectory"][-1]
        assert last["x"] == pytest.approx(nash_x, abs=1e-3)
        assert last["y"] == pytest.approx(nash_y, abs=1e-3)

    def test_error_decreasing(self):
        result = fixed_point_iteration(0.01, -0.005, _params(), 50)
        errors = [e["error"] for e in result["errors"]]
        assert errors == sorted(errors, reverse=True)

    def test_converged_flag(self):
        result = fixed_point_iteration(0.01, -0.005, _params(), 50)
        assert result["converged"] is True

    def test_diverging_not_converged(self):
        result = fixed_point_iteration(0.01, -0.005, _params(coupling=0.3), 50)
        assert result["converged"] is False

    def test_breaks_early(self):
        result = fixed_point_iteration(0.01, -0.005, _params(), 50)
        assert len(result["trajectory"]) < 50

    def test_first_point_is_initial(self):
        result = fixed_point_iteration(0.01, -0.005, _params(), 50)
        assert result["trajectory"][0]["x"] == pytest.approx(0.01)
        assert result["trajectory"][0]["y"] == pytest.approx(-0.005)


class TestBanachSignal:
    def test_equilibrium_found(self):
        signal, reason = banach_signal(0.5, True, 0.3, -0.2, 25, 1e-9, 50)
        assert signal == "EQUILIBRIUM_FOUND"

    def test_converging_slow(self):
        signal, reason = banach_signal(0.9, False, 0.3, -0.2, 50, 0.01, 50)
        assert signal == "CONVERGING_SLOW"

    def test_diverging(self):
        signal, reason = banach_signal(1.5, False, 0.3, -0.2, 50, 1.0, 50)
        assert signal == "DIVERGING"

    def test_q_one_diverging(self):
        signal, reason = banach_signal(1.0, False, 0.3, -0.2, 50, 1.0, 50)
        assert signal == "DIVERGING"


class TestBanachAnalysis:
    def test_basic_analysis(self):
        result = banach_analysis(_prices(150))
        assert isinstance(result, BanachResult)

    def test_insufficient_prices_returns_none(self):
        assert banach_analysis(_prices(30)) is None

    def test_empty_returns_none(self):
        assert banach_analysis([]) is None

    def test_signal_in_set(self):
        result = banach_analysis(_prices(150))
        assert result.signal in {"EQUILIBRIUM_FOUND", "CONVERGING_SLOW", "DIVERGING"}

    def test_q_finite(self):
        result = banach_analysis(_prices(150))
        assert math.isfinite(result.q)

    def test_nash_finite(self):
        result = banach_analysis(_prices(150))
        assert math.isfinite(result.nash_x)
        assert math.isfinite(result.nash_y)

    def test_trajectory_non_empty(self):
        result = banach_analysis(_prices(150))
        assert len(result.result["trajectory"]) > 1

    def test_final_error_finite(self):
        result = banach_analysis(_prices(150))
        assert math.isfinite(result.final_error)

    def test_error_decay_length(self):
        result = banach_analysis(_prices(150))
        assert len(result.error_decay) == len(result.result["errors"])

    def test_error_decay_finite(self):
        result = banach_analysis(_prices(150))
        assert all(math.isfinite(e["log_error"]) for e in result.error_decay)

    def test_params_keys(self):
        result = banach_analysis(_prices(150))
        assert set(result.params.keys()) == {"a1", "b1", "c1", "a2", "b2", "c2"}

    def test_mean_std_finite(self):
        result = banach_analysis(_prices(150))
        assert math.isfinite(result.mean_r)
        assert math.isfinite(result.std_r)

    def test_small_coupling_equilibrium(self):
        result = banach_analysis(_prices(150), coupling=0.05)
        assert result.signal in {"EQUILIBRIUM_FOUND", "CONVERGING_SLOW"}

    def test_large_coupling_diverging(self):
        result = banach_analysis(_prices(150), coupling=0.3)
        assert result.signal == "DIVERGING"

    def test_custom_max_iter(self):
        result = banach_analysis(_prices(150), max_iter=20)
        assert len(result.result["trajectory"]) <= 21

    def test_deterministic(self):
        r1 = banach_analysis(_prices(150), coupling=0.05)
        r2 = banach_analysis(_prices(150), coupling=0.05)
        assert r1.nash_x == pytest.approx(r2.nash_x)
        assert r1.final_error == pytest.approx(r2.final_error)

    def test_convergence_rate_finite(self):
        result = banach_analysis(_prices(150), coupling=0.05)
        assert math.isfinite(result.convergence_rate)
