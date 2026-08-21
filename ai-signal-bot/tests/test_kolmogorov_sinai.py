"""Tests for Kolmogorov-Sinai Entropy model."""
import math

import pytest

from src.research.kolmogorov_sinai import (
    KsResult,
    block_entropy,
    compute_returns,
    factorial,
    ks_analysis,
    ks_signal,
    largest_lyapunov,
    permutation_entropy,
    sample_entropy,
    symbolize,
)


def _prices(n=250):
    """Synthetic price series (periodic cycle)."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


def _random_returns(n=200, seed=7):
    """Seeded pseudo-random returns."""
    import random

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


class TestSymbolize:
    def test_length(self):
        returns = _random_returns(100)
        symbols = symbolize(returns, 3)
        assert len(symbols) == len(returns)

    def test_symbols_in_range(self):
        returns = _random_returns(100)
        symbols = symbolize(returns, 3)
        assert all(0 <= s <= 2 for s in symbols)

    def test_all_three_symbols_present(self):
        returns = _random_returns(300)
        symbols = symbolize(returns, 3)
        assert len(set(symbols)) == 3

    def test_two_symbols(self):
        returns = _random_returns(200)
        symbols = symbolize(returns, 2)
        assert all(s in (0, 1) for s in symbols)

    def test_deterministic(self):
        returns = _random_returns(100)
        assert symbolize(returns, 3) == symbolize(returns, 3)

    def test_threshold_partition(self):
        # Values below median → 0, above → 1 for nSymbols=2
        returns = [1.0, 2.0, 3.0, 4.0]
        symbols = symbolize(returns, 2)
        assert symbols == [0, 0, 1, 1]


class TestBlockEntropy:
    def test_constant_symbols_zero(self):
        assert block_entropy([1, 1, 1, 1, 1], 2) == pytest.approx(0.0)

    def test_uniform_blocks(self):
        # All 2-grams distinct and equiprobable
        symbols = [0, 1, 2, 3, 0, 1, 2, 3]
        assert block_entropy(symbols, 2) == pytest.approx(math.log2(4))

    def test_small_data_zero(self):
        assert block_entropy([1, 2], 3) == pytest.approx(0.0)

    def test_single_block(self):
        assert block_entropy([1, 2, 3], 3) == pytest.approx(0.0)

    def test_non_negative(self):
        symbols = [0, 1, 0, 1, 2, 0, 1, 2, 0]
        assert block_entropy(symbols, 3) >= 0


class TestFactorial:
    def test_zero(self):
        assert factorial(0) == 1

    def test_one(self):
        assert factorial(1) == 1

    def test_five(self):
        assert factorial(5) == 120

    def test_ten(self):
        assert factorial(10) == 3628800


class TestPermutationEntropy:
    def test_monotonic_zero(self):
        result = permutation_entropy([1.0, 2.0, 3.0, 4.0, 5.0], 3)
        assert result["entropy"] == pytest.approx(0.0)
        assert result["normalized"] == pytest.approx(0.0)

    def test_normalized_in_unit_interval(self):
        returns = _random_returns(200)
        result = permutation_entropy(returns, 4)
        assert 0 <= result["normalized"] <= 1.0

    def test_order_too_large(self):
        result = permutation_entropy([1.0, 2.0], 3)
        assert result["entropy"] == pytest.approx(0.0)

    def test_max_entropy_uniform_patterns(self):
        # Multiple distinct ordinal patterns → positive entropy bounded by log2(3!)
        returns = [0.3, 0.1, 0.2, 0.6, 0.4, 0.5, 0.9, 0.7, 0.8]
        result = permutation_entropy(returns, 3)
        assert 0 < result["entropy"] <= math.log2(6)

    def test_pattern_count(self):
        result = permutation_entropy([1.0, 2.0, 3.0, 4.0], 3)
        assert len(result["patterns"]) == 1


class TestSampleEntropy:
    def test_constant_data_small(self):
        returns = [0.5] * 100
        assert sample_entropy(returns, 2, 0.2) < 0.1

    def test_random_data_positive(self):
        returns = _random_returns(200)
        assert sample_entropy(returns, 2, 0.2) > 0

    def test_finite(self):
        returns = _random_returns(200)
        assert math.isfinite(sample_entropy(returns, 2, 0.2))

    def test_periodic_finite(self):
        returns = [0.01, -0.005, 0.0, 0.005, -0.01] * 40
        assert math.isfinite(sample_entropy(returns, 2, 0.2))


class TestLargestLyapunov:
    def test_small_data_zero(self):
        result = largest_lyapunov([0.1] * 30, 20)
        assert result["lle"] == pytest.approx(0.0)
        assert result["divergences"] == []

    def test_periodic_near_zero(self):
        returns = [0.01, -0.005, 0.0, 0.005, -0.01] * 40
        result = largest_lyapunov(returns, 20)
        assert abs(result["lle"]) < 0.1

    def test_divergences_present(self):
        returns = _random_returns(200)
        result = largest_lyapunov(returns, 20)
        assert len(result["divergences"]) >= 3

    def test_lle_finite(self):
        returns = _random_returns(200)
        result = largest_lyapunov(returns, 20)
        assert math.isfinite(result["lle"])

    def test_divergence_lags_ordered(self):
        returns = _random_returns(200)
        result = largest_lyapunov(returns, 20)
        lags = [d["lag"] for d in result["divergences"]]
        assert lags == sorted(lags)


class TestKsSignal:
    def test_chaotic(self):
        signal, reason = ks_signal(0.05, 0.3)
        assert signal == "CHAOTIC"

    def test_periodic(self):
        signal, reason = ks_signal(0.0, 0.005)
        assert signal == "PERIODIC"

    def test_high_entropy(self):
        signal, reason = ks_signal(0.0, 0.8)
        assert signal == "HIGH_ENTROPY"

    def test_stochastic(self):
        signal, reason = ks_signal(0.0, 0.3)
        assert signal == "STOCHASTIC"

    def test_boundary_chaotic(self):
        signal, reason = ks_signal(0.01, 0.3)
        assert signal == "STOCHASTIC"


class TestKsAnalysis:
    def test_basic_analysis(self):
        result = ks_analysis(_prices(250))
        assert isinstance(result, KsResult)

    def test_insufficient_prices_returns_none(self):
        assert ks_analysis(_prices(100)) is None

    def test_empty_returns_none(self):
        assert ks_analysis([]) is None

    def test_signal_in_set(self):
        result = ks_analysis(_prices(250))
        assert result.signal in {"CHAOTIC", "PERIODIC", "HIGH_ENTROPY", "STOCHASTIC"}

    def test_periodic_data_signal(self):
        result = ks_analysis(_prices(250))
        assert result.signal == "PERIODIC"

    def test_block_entropies_length(self):
        result = ks_analysis(_prices(250))
        assert len(result.block_entropies) == 8

    def test_block_entropy_increasing(self):
        result = ks_analysis(_prices(250))
        entropies = [b["entropy"] for b in result.block_entropies]
        assert entropies == sorted(entropies)

    def test_ks_entropy_finite(self):
        result = ks_analysis(_prices(250))
        assert math.isfinite(result.ks_entropy)

    def test_pe_normalized_in_unit_interval(self):
        result = ks_analysis(_prices(250))
        assert 0 <= result.pe["normalized"] <= 1.0

    def test_se_finite(self):
        result = ks_analysis(_prices(250))
        assert math.isfinite(result.se)

    def test_lle_finite(self):
        result = ks_analysis(_prices(250))
        assert math.isfinite(result.lle["lle"])

    def test_sliding_non_empty(self):
        result = ks_analysis(_prices(250))
        assert len(result.sliding_ks) > 1

    def test_sliding_ks_non_negative(self):
        result = ks_analysis(_prices(250))
        assert all(s["ks"] >= 0 for s in result.sliding_ks)

    def test_predictability_horizon(self):
        result = ks_analysis(_prices(250))
        assert result.predictability_horizon == float("inf")

    def test_symbols_length(self):
        result = ks_analysis(_prices(250))
        assert len(result.symbols) == len(result.returns)

    def test_custom_params(self):
        result = ks_analysis(_prices(250), n_symbols=4, max_block=6, perm_order=5)
        assert len(result.block_entropies) == 6
        assert all(0 <= s <= 3 for s in result.symbols)

    def test_random_data_high_entropy(self):
        result = ks_analysis(_random_returns(250), lookback=200)
        assert result.signal in {"CHAOTIC", "HIGH_ENTROPY", "STOCHASTIC"}
