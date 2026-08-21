"""Tests for Information Bottleneck model."""
import math
import random

import pytest

from src.research.info_bottleneck import (
    IbResult,
    compute_returns,
    ib_analysis,
    ib_signal,
    information_bottleneck,
    kl_divergence,
    quantize,
)


def _prices(n=150):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


def _correlated(n=200):
    """Perfectly correlated quantized X, Y."""
    x = [i % 10 for i in range(n)]
    return x, x[:]


def _independent(n=300):
    """Independent quantized X, Y (seeded)."""
    rng1 = random.Random(1)
    rng2 = random.Random(2)
    x = [rng1.randint(0, 9) for _ in range(n)]
    y = [rng2.randint(0, 9) for _ in range(n)]
    return x, y


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


class TestQuantize:
    def test_basic(self):
        values = [0.0, 0.25, 0.5, 0.75, 1.0]
        assert quantize(values, 4) == [0, 1, 2, 3, 3]

    def test_single_value_zero(self):
        assert quantize([0.5], 10) == [0]

    def test_bins_in_range(self):
        values = [i / 100 for i in range(100)]
        bins = quantize(values, 10)
        assert all(0 <= b <= 9 for b in bins)

    def test_constant_values(self):
        assert quantize([3.0, 3.0, 3.0], 5) == [0, 0, 0]

    def test_max_bin(self):
        values = [1.0, 2.0, 3.0]
        assert quantize(values, 2)[-1] == 1


class TestKlDivergence:
    def test_zero_when_equal(self):
        assert kl_divergence([0.5, 0.5], [0.5, 0.5]) == pytest.approx(0.0)

    def test_positive(self):
        assert kl_divergence([0.9, 0.1], [0.5, 0.5]) > 0

    def test_asymmetric(self):
        p = [0.9, 0.1]
        q = [0.5, 0.5]
        assert kl_divergence(p, q) != kl_divergence(q, p)

    def test_zeros_ignored(self):
        assert kl_divergence([1.0, 0.0], [0.5, 0.5]) == pytest.approx(1.0)


class TestInformationBottleneck:
    def test_deterministic_with_seed(self):
        x, y = _correlated()
        r1 = information_bottleneck(x, y, 4, 5.0, 50, random.Random(42))
        r2 = information_bottleneck(x, y, 4, 5.0, 50, random.Random(42))
        assert r1["i_xt"] == pytest.approx(r2["i_xt"])
        assert r1["i_ty"] == pytest.approx(r2["i_ty"])

    def test_mutual_information_non_negative(self):
        x, y = _correlated()
        result = information_bottleneck(x, y, 4, 5.0, 50, random.Random(42))
        assert result["i_xt"] >= 0
        assert result["i_ty"] >= 0

    def test_assignments_length(self):
        x, y = _correlated()
        result = information_bottleneck(x, y, 4, 5.0, 50, random.Random(42))
        assert len(result["assignments"]) == len(x)

    def test_assignments_in_range(self):
        x, y = _correlated()
        result = information_bottleneck(x, y, 4, 5.0, 50, random.Random(42))
        assert all(0 <= a <= 3 for a in result["assignments"])

    def test_clusters_count(self):
        x, y = _correlated()
        result = information_bottleneck(x, y, 4, 5.0, 50, random.Random(42))
        assert len(result["clusters"]) == 4

    def test_cluster_sizes_sum(self):
        x, y = _correlated()
        result = information_bottleneck(x, y, 4, 5.0, 50, random.Random(42))
        assert sum(c["size"] for c in result["clusters"]) == len(x)

    def test_history_length(self):
        x, y = _correlated()
        result = information_bottleneck(x, y, 4, 5.0, 100, random.Random(42))
        assert len(result["history"]) == 100

    def test_ptx_rows_sum_to_one(self):
        x, y = _correlated()
        result = information_bottleneck(x, y, 4, 5.0, 50, random.Random(42))
        for row in result["ptx"]:
            assert sum(row) == pytest.approx(1.0, abs=1e-9)

    def test_correlated_high_ity(self):
        x, y = _correlated()
        result = information_bottleneck(x, y, 4, 10.0, 100, random.Random(42))
        assert result["i_ty"] > 1.0

    def test_independent_low_ity(self):
        x, y = _independent()
        result = information_bottleneck(x, y, 4, 5.0, 100, random.Random(42))
        assert result["i_ty"] < 0.8

    def test_high_beta_increases_ity(self):
        x, y = _correlated()
        low = information_bottleneck(x, y, 4, 0.5, 100, random.Random(42))
        high = information_bottleneck(x, y, 4, 50.0, 100, random.Random(42))
        assert high["i_ty"] >= low["i_ty"] - 0.5


class TestIbSignal:
    def test_buy(self):
        signal, reason = ib_signal(7.0, 10)
        assert signal == "BUY"

    def test_sell(self):
        signal, reason = ib_signal(3.0, 10)
        assert signal == "SELL"

    def test_neutral(self):
        signal, reason = ib_signal(5.0, 10)
        assert signal == "NEUTRAL"

    def test_boundary_buy(self):
        signal, reason = ib_signal(5.0, 10)
        assert signal == "NEUTRAL"


class TestIbAnalysis:
    def test_basic_analysis(self):
        result = ib_analysis(_prices(150))
        assert isinstance(result, IbResult)

    def test_insufficient_prices_returns_none(self):
        assert ib_analysis(_prices(50)) is None

    def test_empty_returns_none(self):
        assert ib_analysis([]) is None

    def test_signal_in_set(self):
        result = ib_analysis(_prices(150))
        assert result.signal in {"BUY", "SELL", "NEUTRAL"}

    def test_deterministic_with_seed(self):
        r1 = ib_analysis(_prices(150), seed=42)
        r2 = ib_analysis(_prices(150), seed=42)
        assert r1.i_xt == pytest.approx(r2.i_xt)
        assert r1.i_ty == pytest.approx(r2.i_ty)

    def test_rd_curve_length(self):
        result = ib_analysis(_prices(150))
        assert len(result.rd_curve) == 8

    def test_rd_curve_betas(self):
        result = ib_analysis(_prices(150))
        betas = [d["beta"] for d in result.rd_curve]
        assert betas == [0.1, 0.5, 1, 2, 5, 10, 20, 50]

    def test_history_length(self):
        result = ib_analysis(_prices(150))
        assert len(result.history) == 100

    def test_assignments_length(self):
        result = ib_analysis(_prices(150))
        assert len(result.assignments) == len(result.returns) - 1

    def test_clusters_count(self):
        result = ib_analysis(_prices(150))
        assert len(result.clusters) == 4

    def test_i_xt_non_negative(self):
        result = ib_analysis(_prices(150))
        assert result.i_xt >= 0

    def test_i_ty_non_negative(self):
        result = ib_analysis(_prices(150))
        assert result.i_ty >= 0

    def test_current_cluster_in_range(self):
        result = ib_analysis(_prices(150))
        assert 0 <= result.current_cluster < 4

    def test_xq_yq_lengths(self):
        result = ib_analysis(_prices(150))
        assert len(result.xq) == len(result.yq)

    def test_custom_params(self):
        result = ib_analysis(_prices(150), n_clusters=6, beta=10.0, n_bins=8, lag=2)
        assert result.n_clusters == 6
        assert len(result.clusters) == 6
        assert len(result.assignments) == len(result.returns) - 2

    def test_history_ity_finite(self):
        result = ib_analysis(_prices(150))
        assert all(math.isfinite(h["i_ty"]) for h in result.history)
