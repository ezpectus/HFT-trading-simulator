"""Tests for Rényi Entropy Dynamics model."""
import math

import pytest

from src.research.renyi_entropy import (
    RenyiResult,
    compute_returns,
    generalized_dimensions,
    histogram,
    renyi_analysis,
    renyi_entropy,
    renyi_signal,
    tsallis_entropy,
)


def _prices(n=200):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


def _uniform_probs(n=10):
    """Uniform probabilities over n bins."""
    return [1.0 / n] * n


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


class TestHistogram:
    def test_probs_sum_to_one(self):
        data = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
        result = histogram(data, 10)
        assert sum(result["probs"]) == pytest.approx(1.0)

    def test_bin_count(self):
        result = histogram([1.0, 2.0, 3.0, 4.0], 4)
        assert len(result["probs"]) == 4

    def test_single_value(self):
        result = histogram([5.0, 5.0, 5.0], 10)
        assert result["probs"][0] == pytest.approx(1.0)
        assert result["bin_w"] == pytest.approx(1.0)

    def test_uniform_data(self):
        data = list(range(100))
        result = histogram(data, 10)
        assert all(p == pytest.approx(0.1) for p in result["probs"])

    def test_min_max(self):
        result = histogram([1.0, 2.0, 3.0], 5)
        assert result["min"] == pytest.approx(1.0)
        assert result["max"] == pytest.approx(3.0)


class TestRenyiEntropy:
    def test_alpha_zero_hartley(self):
        probs = [0.5, 0.25, 0.25]
        assert renyi_entropy(probs, 0) == pytest.approx(math.log2(3))

    def test_alpha_one_shannon(self):
        probs = [0.5, 0.25, 0.25]
        expected = -(0.5 * math.log2(0.5) + 0.25 * math.log2(0.25) + 0.25 * math.log2(0.25))
        assert renyi_entropy(probs, 1) == pytest.approx(expected)

    def test_alpha_two_collision(self):
        probs = [0.5, 0.25, 0.25]
        assert renyi_entropy(probs, 2) == pytest.approx(-math.log2(0.25 + 0.0625 + 0.0625))

    def test_alpha_infinity_min_entropy(self):
        probs = [0.5, 0.25, 0.25]
        assert renyi_entropy(probs, float("inf")) == pytest.approx(-math.log2(0.5))

    def test_uniform_all_orders(self):
        probs = _uniform_probs(8)
        for alpha in (0, 0.5, 1, 2, 3, 5, 10, float("inf")):
            assert renyi_entropy(probs, alpha) == pytest.approx(math.log2(8))

    def test_deterministic_zero(self):
        probs = [1.0, 0.0, 0.0]
        for alpha in (0, 1, 2, float("inf")):
            assert renyi_entropy(probs, alpha) == pytest.approx(0.0)

    def test_non_increasing_in_alpha(self):
        probs = [0.4, 0.3, 0.2, 0.1]
        h0 = renyi_entropy(probs, 0)
        h1 = renyi_entropy(probs, 1)
        h2 = renyi_entropy(probs, 2)
        hinf = renyi_entropy(probs, float("inf"))
        assert h0 >= h1 >= h2 >= hinf

    def test_zeros_ignored(self):
        probs = [0.5, 0.5, 0.0, 0.0]
        assert renyi_entropy(probs, 1) == pytest.approx(1.0)


class TestTsallisEntropy:
    def test_q_one_shannon(self):
        probs = [0.5, 0.25, 0.25]
        expected = -(0.5 * math.log(0.5) + 0.25 * math.log(0.25) + 0.25 * math.log(0.25))
        assert tsallis_entropy(probs, 1) == pytest.approx(expected)

    def test_uniform(self):
        probs = _uniform_probs(5)
        # S_q = (1 - 5·(1/5)^q)/(q-1)
        q = 2
        expected = (1 - 5 * (1 / 5) ** q) / (q - 1)
        assert tsallis_entropy(probs, q) == pytest.approx(expected)

    def test_deterministic_zero(self):
        assert tsallis_entropy([1.0, 0.0], 2) == pytest.approx(0.0)

    def test_positive(self):
        assert tsallis_entropy([0.5, 0.5], 2) > 0


class TestGeneralizedDimensions:
    def test_uniform_dimension_one(self):
        # Uniform data on a line: H_α ~ log2(nBins) → D_α ≈ 1
        returns = [i / 1000 for i in range(1000)]
        for alpha in (1, 2):
            gd = generalized_dimensions(returns, [5, 10, 20, 40], alpha)
            xs = [g["log_r"] for g in gd]
            ys = [g["entropy"] for g in gd]
            mean_x = sum(xs) / len(xs)
            mean_y = sum(ys) / len(ys)
            num = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(len(xs)))
            den = sum((xs[i] - mean_x) ** 2 for i in range(len(xs)))
            assert num / den == pytest.approx(1.0, abs=0.15)

    def test_constant_dimension_zero(self):
        returns = [1.0] * 100
        gd = generalized_dimensions(returns, [5, 10, 20], 1)
        assert all(g["entropy"] == pytest.approx(0.0) for g in gd)

    def test_result_shape(self):
        returns = [i / 100 for i in range(100)]
        gd = generalized_dimensions(returns, [5, 10, 15, 20], 2)
        assert len(gd) == 4
        assert gd[0]["n_bins"] == 5
        assert gd[0]["log_r"] == pytest.approx(math.log2(5))


class TestRenyiSignal:
    def test_diverse(self):
        signal, reason = renyi_signal(0.1)
        assert signal == "DIVERSE"

    def test_concentrated(self):
        signal, reason = renyi_signal(0.9)
        assert signal == "CONCENTRATED"

    def test_balanced(self):
        signal, reason = renyi_signal(0.5)
        assert signal == "BALANCED"

    def test_boundary_diverse(self):
        signal, reason = renyi_signal(0.3)
        assert signal == "BALANCED"

    def test_boundary_concentrated(self):
        signal, reason = renyi_signal(0.7)
        assert signal == "BALANCED"


class TestRenyiAnalysis:
    def test_basic_analysis(self):
        result = renyi_analysis(_prices(200))
        assert isinstance(result, RenyiResult)

    def test_insufficient_prices_returns_none(self):
        assert renyi_analysis(_prices(50)) is None

    def test_empty_returns_none(self):
        assert renyi_analysis([]) is None

    def test_signal_in_set(self):
        result = renyi_analysis(_prices(200))
        assert result.signal in {"DIVERSE", "CONCENTRATED", "BALANCED"}

    def test_spectrum_length(self):
        result = renyi_analysis(_prices(200))
        assert len(result.renyi_spectrum) == 8

    def test_spectrum_alphas(self):
        result = renyi_analysis(_prices(200))
        alphas = [r["alpha"] for r in result.renyi_spectrum]
        assert alphas == [0, 0.5, 1, 2, 3, 5, 10, float("inf")]

    def test_dims_length(self):
        result = renyi_analysis(_prices(200))
        assert len(result.dims) == 6

    def test_dims_finite(self):
        result = renyi_analysis(_prices(200))
        assert all(math.isfinite(d["D"]) for d in result.dims)

    def test_sliding_non_empty(self):
        result = renyi_analysis(_prices(200))
        assert len(result.sliding_renyi) > 1

    def test_sliding_window_size(self):
        result = renyi_analysis(_prices(200))
        assert result.sliding_renyi[0]["idx"] == 0

    def test_current_values_finite(self):
        result = renyi_analysis(_prices(200))
        assert math.isfinite(result.current["h0"])
        assert math.isfinite(result.current["h1"])
        assert math.isfinite(result.current["h2"])
        assert math.isfinite(result.current["h_inf"])

    def test_efficiency_in_unit_interval(self):
        result = renyi_analysis(_prices(200))
        assert 0 <= result.efficiency <= 1.0

    def test_concentration_ratio_finite(self):
        result = renyi_analysis(_prices(200))
        assert math.isfinite(result.concentration_ratio)

    def test_probs_sum_to_one(self):
        result = renyi_analysis(_prices(200))
        assert sum(result.probs) == pytest.approx(1.0)

    def test_n_bins(self):
        result = renyi_analysis(_prices(200), n_bins=30)
        assert result.n_bins == 30
        assert len(result.probs) == 30

    def test_custom_window(self):
        result = renyi_analysis(_prices(200), window_size=60)
        assert len(result.sliding_renyi) > 0

    def test_h0_ge_hinf(self):
        result = renyi_analysis(_prices(200))
        assert result.current["h0"] >= result.current["h_inf"] - 1e-9

    def test_tsallis_present(self):
        result = renyi_analysis(_prices(200))
        assert all(math.isfinite(r["tsallis"]) for r in result.renyi_spectrum)
