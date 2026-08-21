"""Tests for Lie Group Symmetries model."""
import math
import random

import pytest

from src.research.lie_group import (
    LieResult,
    compute_returns,
    galilean_symmetry,
    lie_algebra_coeffs,
    lie_analysis,
    lie_signal,
    scaling_symmetry,
    time_translation_symmetry,
    translation_symmetry,
)


def _prices(n=150):
    """Synthetic price series (periodic cycle)."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


def _random_returns(n=150, seed=7):
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


class TestTranslationSymmetry:
    def test_results_non_empty(self):
        result = translation_symmetry(_random_returns(100), 20)
        assert len(result["results"]) > 0

    def test_breaking_non_negative(self):
        result = translation_symmetry(_random_returns(100), 20)
        assert result["breaking"] >= 0

    def test_constant_returns_zero_breaking(self):
        result = translation_symmetry([0.01] * 100, 20)
        assert result["breaking"] == pytest.approx(0.0)

    def test_conserved_is_mean_of_means(self):
        result = translation_symmetry(_random_returns(100), 20)
        means = [r["mean"] for r in result["results"]]
        assert result["conserved"] == pytest.approx(sum(means) / len(means))

    def test_window_mean(self):
        result = translation_symmetry([0.1, 0.2, 0.3, 0.4], 2)
        assert result["results"][0]["mean"] == pytest.approx(0.15)


class TestScalingSymmetry:
    def test_results_non_empty(self):
        result = scaling_symmetry(_random_returns(100), 20)
        assert len(result["results"]) > 0

    def test_breaking_non_negative(self):
        result = scaling_symmetry(_random_returns(100), 20)
        assert result["breaking"] >= 0

    def test_ratio_positive(self):
        result = scaling_symmetry(_random_returns(100), 20)
        assert all(r["ratio"] > 0 for r in result["results"])

    def test_constant_returns_zero_breaking(self):
        result = scaling_symmetry([0.01] * 100, 20)
        assert result["breaking"] == pytest.approx(0.0)

    def test_std_matches(self):
        window = [0.1, 0.2, 0.3, 0.4]
        result = scaling_symmetry(window, 2)
        mean = 0.15
        std = math.sqrt(sum((v - mean) ** 2 for v in window[:2]) / 2)
        assert result["results"][0]["std"] == pytest.approx(std)


class TestTimeTranslationSymmetry:
    def test_results_non_empty(self):
        result = time_translation_symmetry(_random_returns(100), 20)
        assert len(result["results"]) > 0

    def test_breaking_non_negative(self):
        result = time_translation_symmetry(_random_returns(100), 20)
        assert result["breaking"] >= 0

    def test_acf_in_range(self):
        result = time_translation_symmetry(_random_returns(100), 20)
        assert all(-1.0 <= r["acf"] <= 1.0 for r in result["results"])

    def test_periodic_acf(self):
        returns = [1.0, -1.0] * 50
        result = time_translation_symmetry(returns, 20, lag=2)
        assert result["results"][0]["acf"] == pytest.approx(1.0)

    def test_constant_zero_acf(self):
        result = time_translation_symmetry([0.01] * 100, 20)
        assert result["results"][0]["acf"] == pytest.approx(0.0)


class TestGalileanSymmetry:
    def test_results_non_empty(self):
        result = galilean_symmetry(_random_returns(100), 20)
        assert len(result["results"]) > 0

    def test_breaking_non_negative(self):
        result = galilean_symmetry(_random_returns(100), 20)
        assert result["breaking"] >= 0

    def test_detrended_var_non_negative(self):
        result = galilean_symmetry(_random_returns(100), 20)
        assert all(r["detrended_var"] >= 0 for r in result["results"])

    def test_linear_trend_zero_residual(self):
        # Perfect linear trend → slope captures it → residuals ≈ 0
        returns = [i * 0.001 for i in range(100)]
        result = galilean_symmetry(returns, 20)
        assert result["results"][0]["detrended_var"] < 1e-6

    def test_constant_zero_slope(self):
        result = galilean_symmetry([0.01] * 100, 20)
        assert result["results"][0]["slope"] == pytest.approx(0.0)


class TestLieAlgebraCoeffs:
    def test_results_non_empty(self):
        result = lie_algebra_coeffs(_random_returns(100), 20)
        assert len(result) > 0

    def test_e1_is_mean(self):
        result = lie_algebra_coeffs([0.1, 0.2, 0.3, 0.4], 2)
        assert result[0]["e1"] == pytest.approx(0.15)

    def test_e2_is_std(self):
        result = lie_algebra_coeffs([0.1, 0.2, 0.3, 0.4], 2)
        mean = 0.15
        std = math.sqrt(sum((v - mean) ** 2 for v in [0.1, 0.2]) / 2)
        assert result[0]["e2"] == pytest.approx(std)

    def test_e3_sharpe_like(self):
        result = lie_algebra_coeffs([0.1, 0.2, 0.3, 0.4], 2)
        assert result[0]["e3"] == pytest.approx(0.15 / (result[0]["e2"] + 1e-10))

    def test_e2_positive(self):
        result = lie_algebra_coeffs(_random_returns(100), 20)
        assert all(c["e2"] > 0 for c in result)


class TestLieSignal:
    def test_symmetry_broken(self):
        signal, reason = lie_signal(0.02)
        assert signal == "SYMMETRY_BROKEN"

    def test_weak_breaking(self):
        signal, reason = lie_signal(0.007)
        assert signal == "WEAK_BREAKING"

    def test_symmetric(self):
        signal, reason = lie_signal(0.001)
        assert signal == "SYMMETRIC"

    def test_boundary_broken(self):
        signal, reason = lie_signal(0.01)
        assert signal == "WEAK_BREAKING"

    def test_boundary_weak(self):
        signal, reason = lie_signal(0.005)
        assert signal == "SYMMETRIC"


class TestLieAnalysis:
    def test_basic_analysis(self):
        result = lie_analysis(_prices(150))
        assert isinstance(result, LieResult)

    def test_insufficient_prices_returns_none(self):
        assert lie_analysis(_prices(30)) is None

    def test_empty_returns_none(self):
        assert lie_analysis([]) is None

    def test_signal_in_set(self):
        result = lie_analysis(_prices(150))
        assert result.signal in {"SYMMETRY_BROKEN", "WEAK_BREAKING", "SYMMETRIC"}

    def test_periodic_data_symmetric(self):
        result = lie_analysis(_prices(150))
        assert result.signal == "SYMMETRIC"

    def test_total_breaking_finite(self):
        result = lie_analysis(_prices(150))
        assert math.isfinite(result.total_breaking)

    def test_noether_keys(self):
        result = lie_analysis(_prices(150))
        assert set(result.noether.keys()) == {"momentum", "scaling_ratio", "correlation", "detrended_var"}

    def test_breaking_scores_sorted(self):
        result = lie_analysis(_prices(150))
        values = [s["value"] for s in result.breaking_scores]
        assert values == sorted(values, reverse=True)

    def test_breaking_scores_length(self):
        result = lie_analysis(_prices(150))
        assert len(result.breaking_scores) == 4

    def test_current_coeffs_finite(self):
        result = lie_analysis(_prices(150))
        assert math.isfinite(result.current["e1"])
        assert math.isfinite(result.current["e2"])
        assert math.isfinite(result.current["e3"])

    def test_lie_coeffs_non_empty(self):
        result = lie_analysis(_prices(150))
        assert len(result.lie_coeffs) > 0

    def test_trans_results_non_empty(self):
        result = lie_analysis(_prices(150))
        assert len(result.trans["results"]) > 0

    def test_scaling_results_non_empty(self):
        result = lie_analysis(_prices(150))
        assert len(result.scaling["results"]) > 0

    def test_time_trans_results_non_empty(self):
        result = lie_analysis(_prices(150))
        assert len(result.time_trans["results"]) > 0

    def test_galilean_results_non_empty(self):
        result = lie_analysis(_prices(150))
        assert len(result.galilean["results"]) > 0

    def test_random_data_signal(self):
        result = lie_analysis(_random_returns(150))
        assert result.signal in {"SYMMETRY_BROKEN", "WEAK_BREAKING", "SYMMETRIC"}

    def test_custom_window(self):
        result = lie_analysis(_prices(150), window_size=30)
        assert len(result.lie_coeffs) > 0

    def test_returns_length(self):
        result = lie_analysis(_prices(150))
        assert len(result.returns) == 99
