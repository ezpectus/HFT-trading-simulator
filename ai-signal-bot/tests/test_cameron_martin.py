"""Tests for Cameron-Martin model."""
import math

import pytest

from src.research.cameron_martin import (
    CmResult,
    cameron_martin_analysis,
    compute_returns,
    shift_function,
)


def _prices(n=200):
    """Synthetic price series (periodic cycle)."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


def _drift_prices(n=200):
    """Prices with a late upward drift regime."""
    prices = [100.0]
    for i in range(1, n):
        r = 0.005 if i < n - 60 else 0.02
        prices.append(prices[-1] * (1 + r))
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


class TestShiftFunction:
    def test_constant(self):
        assert shift_function("constant", 0, 100, 0.01) == pytest.approx(0.02)
        assert shift_function("constant", 50, 100, 0.01) == pytest.approx(0.02)

    def test_linear(self):
        assert shift_function("linear", 0, 100, 0.01) == pytest.approx(0.01)
        assert shift_function("linear", 100, 100, 0.01) == pytest.approx(0.02)

    def test_sinusoidal(self):
        assert shift_function("sinusoidal", 0, 100, 0.01) == pytest.approx(0.0)
        assert shift_function("sinusoidal", 5, 100, 0.01) == pytest.approx(0.02 * math.sin(math.pi / 2))

    def test_mixed(self):
        assert shift_function("mixed", 0, 100, 0.01) == pytest.approx(0.01)

    def test_zero_mu(self):
        assert shift_function("constant", 10, 100, 0.0) == pytest.approx(0.0)


class TestCameronMartinAnalysis:
    def test_basic_analysis(self):
        result = cameron_martin_analysis(_prices(200))
        assert isinstance(result, CmResult)

    def test_insufficient_prices_returns_none(self):
        assert cameron_martin_analysis(_prices(50)) is None

    def test_empty_returns_none(self):
        assert cameron_martin_analysis([]) is None

    def test_signal_in_set(self):
        result = cameron_martin_analysis(_prices(200))
        assert result.signal in {"STRONG_DRIFT_ALIGNMENT", "DRIFT_PRESENT", "ANTI_DRIFT", "NO_DRIFT_SHIFT"}

    def test_comparisons_non_empty(self):
        result = cameron_martin_analysis(_prices(200))
        assert len(result.comparisons) > 0

    def test_grid_length(self):
        result = cameron_martin_analysis(_prices(200))
        assert len(result.grid) == 81

    def test_grid_x_range(self):
        result = cameron_martin_analysis(_prices(200))
        assert result.grid[0]["x"] == pytest.approx(-5.0)
        assert result.grid[-1]["x"] == pytest.approx(5.0)

    def test_cum_trajectory_length(self):
        result = cameron_martin_analysis(_prices(200))
        assert len(result.cum_trajectory) == 200 - 1

    def test_current_keys(self):
        result = cameron_martin_analysis(_prices(200))
        assert set(result.current.keys()) == {
            "idx", "log_rn", "rn_derivative", "inner_prod", "h_norm_sq",
            "mu_w", "sig_w", "optimal_shift", "shift_efficiency",
        }

    def test_mu0_finite(self):
        result = cameron_martin_analysis(_prices(200))
        assert math.isfinite(result.mu0)

    def test_sig0_positive(self):
        result = cameron_martin_analysis(_prices(200))
        assert result.sig0 > 0

    def test_log_rn_finite(self):
        result = cameron_martin_analysis(_prices(200))
        assert math.isfinite(result.current["log_rn"])

    def test_rn_derivative_positive(self):
        result = cameron_martin_analysis(_prices(200))
        assert result.current["rn_derivative"] > 0

    def test_log_rn_relation(self):
        result = cameron_martin_analysis(_prices(200))
        assert result.current["log_rn"] == pytest.approx(
            result.current["inner_prod"] - 0.5 * result.current["h_norm_sq"]
        )

    def test_symmetric_data_no_drift(self):
        result = cameron_martin_analysis(_prices(200))
        assert result.signal == "NO_DRIFT_SHIFT"

    def test_drift_data_strong_alignment(self):
        result = cameron_martin_analysis(_drift_prices(200))
        assert result.signal in {"STRONG_DRIFT_ALIGNMENT", "DRIFT_PRESENT"}

    def test_linear_mode(self):
        result = cameron_martin_analysis(_prices(200), shift_mode="linear")
        assert result.signal in {"STRONG_DRIFT_ALIGNMENT", "DRIFT_PRESENT", "ANTI_DRIFT", "NO_DRIFT_SHIFT"}

    def test_sinusoidal_mode(self):
        result = cameron_martin_analysis(_prices(200), shift_mode="sinusoidal")
        assert result.signal in {"STRONG_DRIFT_ALIGNMENT", "DRIFT_PRESENT", "ANTI_DRIFT", "NO_DRIFT_SHIFT"}

    def test_mixed_mode(self):
        result = cameron_martin_analysis(_prices(200), shift_mode="mixed")
        assert result.signal in {"STRONG_DRIFT_ALIGNMENT", "DRIFT_PRESENT", "ANTI_DRIFT", "NO_DRIFT_SHIFT"}

    def test_custom_window(self):
        result = cameron_martin_analysis(_prices(200), window_size=20)
        assert len(result.comparisons) > 0

    def test_deterministic(self):
        r1 = cameron_martin_analysis(_prices(200))
        r2 = cameron_martin_analysis(_prices(200))
        assert r1.current["log_rn"] == pytest.approx(r2.current["log_rn"])
        assert r1.mu0 == pytest.approx(r2.mu0)

    def test_cumulative_finite(self):
        result = cameron_martin_analysis(_prices(200))
        assert all(math.isfinite(c["cum_log_rn"]) for c in result.cum_trajectory)

    def test_grid_rn_positive(self):
        result = cameron_martin_analysis(_prices(200))
        assert all(g["rn"] > 0 for g in result.grid)

    def test_shift_efficiency_finite(self):
        result = cameron_martin_analysis(_prices(200))
        assert all(math.isfinite(c["shift_efficiency"]) for c in result.comparisons)
