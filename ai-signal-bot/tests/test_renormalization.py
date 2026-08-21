"""Tests for Renormalization Group model."""
import math
import random

import pytest

from src.research.renormalization import (
    RgResult,
    autocorrelation,
    coarse_grain,
    compute_returns,
    correlation_length,
    kurtosis_at_scale,
    rg_analysis,
    rg_signal,
    scaling_exponent,
    volatility_at_scale,
)


def _prices(n=250):
    """Synthetic price series (periodic cycle)."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


def _random_returns(n=250, seed=7):
    """Seeded pseudo-random returns."""
    rng = random.Random(seed)
    return [rng.uniform(-0.01, 0.01) for _ in range(n)]


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


class TestCoarseGrain:
    def test_sum_preserved(self):
        returns = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]
        assert sum(coarse_grain(returns, 2)) == pytest.approx(sum(returns))

    def test_length(self):
        returns = list(range(10))
        assert len(coarse_grain(returns, 3)) == 3

    def test_non_overlapping(self):
        returns = [1.0, 2.0, 3.0, 4.0]
        assert coarse_grain(returns, 2) == pytest.approx([3.0, 7.0])

    def test_scale_one_identity(self):
        returns = [0.1, 0.2, 0.3]
        assert coarse_grain(returns, 1) == pytest.approx(returns)

    def test_remainder_dropped(self):
        returns = [1.0, 2.0, 3.0, 4.0, 5.0]
        assert coarse_grain(returns, 2) == pytest.approx([3.0, 7.0])


class TestVolatilityAtScale:
    def test_constant_zero(self):
        assert volatility_at_scale([0.01] * 20, 2) == pytest.approx(0.0)

    def test_scale_one_equals_std(self):
        returns = _random_returns(100)
        mean = sum(returns) / len(returns)
        std = math.sqrt(sum((r - mean) ** 2 for r in returns) / len(returns))
        assert volatility_at_scale(returns, 1) == pytest.approx(std)

    def test_small_data_zero(self):
        assert volatility_at_scale([0.1, 0.2], 5) == pytest.approx(0.0)

    def test_non_negative(self):
        returns = _random_returns(100)
        assert volatility_at_scale(returns, 3) >= 0


class TestKurtosisAtScale:
    def test_normal_approx_zero(self):
        rng = random.Random(1)
        returns = [rng.gauss(0, 1) for _ in range(500)]
        assert kurtosis_at_scale(returns, 1) == pytest.approx(0.0, abs=0.5)

    def test_heavy_tails_positive(self):
        rng = random.Random(2)
        returns = [rng.gauss(0, 1) * (5 if rng.random() < 0.05 else 1) for _ in range(500)]
        assert kurtosis_at_scale(returns, 1) > 0

    def test_small_data_zero(self):
        assert kurtosis_at_scale([0.1, 0.2, 0.3], 1) == pytest.approx(0.0)

    def test_constant_zero(self):
        assert kurtosis_at_scale([0.01] * 20, 2) == pytest.approx(0.0)


class TestAutocorrelation:
    def test_lag_zero_one(self):
        returns = _random_returns(100)
        assert autocorrelation(returns, 0) == pytest.approx(1.0)

    def test_white_noise_small(self):
        returns = _random_returns(300)
        assert abs(autocorrelation(returns, 1)) < 0.3

    def test_periodic_high(self):
        returns = [1.0, -1.0] * 100
        assert autocorrelation(returns, 2) == pytest.approx(1.0)

    def test_small_data_zero(self):
        assert autocorrelation([0.1, 0.2], 3) == pytest.approx(0.0)

    def test_constant_zero(self):
        assert autocorrelation([0.5] * 50, 1) == pytest.approx(0.0)


class TestScalingExponent:
    def test_quadratic(self):
        assert scaling_exponent([1, 2, 4, 8], [1, 4, 16, 64]) == pytest.approx(2.0, abs=0.01)

    def test_linear(self):
        assert scaling_exponent([1, 2, 4, 8], [1, 2, 4, 8]) == pytest.approx(1.0, abs=0.01)

    def test_constant_zero(self):
        assert scaling_exponent([1, 2, 4, 8], [1, 1, 1, 1]) == pytest.approx(0.0, abs=0.01)

    def test_half(self):
        assert scaling_exponent([1, 4, 16, 64], [1, 2, 4, 8]) == pytest.approx(0.5, abs=0.01)

    def test_negative_values_clamped(self):
        # Negative values are clamped to 1e-10 in log space; result finite
        assert math.isfinite(scaling_exponent([1, 2, 4], [-1, -2, -3]))


class TestCorrelationLength:
    def test_white_noise_short(self):
        returns = _random_returns(300)
        assert correlation_length(returns) <= 3

    def test_periodic_long(self):
        returns = [1.0, -1.0] * 100
        assert correlation_length(returns) == 20

    def test_positive(self):
        returns = _random_returns(100)
        assert correlation_length(returns) >= 1


class TestRgSignal:
    def test_phase_transition(self):
        signal, reason = rg_signal(6.0, 0.5)
        assert signal == "PHASE_TRANSITION"

    def test_subdiffusive(self):
        signal, reason = rg_signal(1.0, 0.3)
        assert signal == "SUBDIFFUSIVE"

    def test_superdiffusive(self):
        signal, reason = rg_signal(1.0, 0.7)
        assert signal == "SUPERDIFFUSIVE"

    def test_normal(self):
        signal, reason = rg_signal(1.0, 0.5)
        assert signal == "NORMAL"

    def test_boundary_subdiffusive(self):
        signal, reason = rg_signal(1.0, 0.45)
        assert signal == "NORMAL"


class TestRgAnalysis:
    def test_basic_analysis(self):
        result = rg_analysis(_prices(250))
        assert isinstance(result, RgResult)

    def test_insufficient_prices_returns_none(self):
        assert rg_analysis(_prices(40)) is None

    def test_empty_returns_none(self):
        assert rg_analysis([]) is None

    def test_signal_in_set(self):
        result = rg_analysis(_prices(250))
        assert result.signal in {"PHASE_TRANSITION", "SUBDIFFUSIVE", "SUPERDIFFUSIVE", "NORMAL"}

    def test_scales_length(self):
        result = rg_analysis(_prices(250))
        assert len(result.scales) == 20

    def test_scales_start_at_one(self):
        result = rg_analysis(_prices(250))
        assert result.scales[0]["n"] == 1

    def test_vol_scaling_finite(self):
        result = rg_analysis(_prices(250))
        assert math.isfinite(result.vol_scaling)

    def test_kurt_scaling_finite(self):
        result = rg_analysis(_prices(250))
        assert math.isfinite(result.kurt_scaling)

    def test_corr_lengths_length(self):
        result = rg_analysis(_prices(250))
        assert len(result.corr_lengths) == 10

    def test_rg_flow_length(self):
        result = rg_analysis(_prices(250))
        assert len(result.rg_flow) == 20

    def test_rg_flow_normalized(self):
        result = rg_analysis(_prices(250))
        assert all(r["g"] >= 0 for r in result.rg_flow)

    def test_fixed_points_list(self):
        result = rg_analysis(_prices(250))
        assert isinstance(result.fixed_points, list)

    def test_max_kurt_change_finite(self):
        result = rg_analysis(_prices(250))
        assert math.isfinite(result.max_kurt_change["delta"])

    def test_current_xi_positive(self):
        result = rg_analysis(_prices(250))
        assert result.current_xi >= 1

    def test_is_scale_invariant_bool(self):
        result = rg_analysis(_prices(250))
        assert isinstance(result.is_scale_invariant, bool)

    def test_random_data_signal(self):
        result = rg_analysis(_random_returns(250))
        assert result.signal in {"PHASE_TRANSITION", "SUBDIFFUSIVE", "SUPERDIFFUSIVE", "NORMAL"}

    def test_custom_max_scale(self):
        result = rg_analysis(_prices(250), max_scale=10)
        assert len(result.scales) == 10
        assert len(result.corr_lengths) == 10

    def test_vol_scaling_in_reasonable_range(self):
        result = rg_analysis(_prices(250))
        assert -1.0 <= result.vol_scaling <= 2.0
