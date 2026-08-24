"""Tests for Transfer Entropy model."""
import math

import pytest

from src.research.transfer_entropy import (
    TransferEntropyResult,
    quantize,
    surrogate_te,
    te_signal,
    transfer_entropy,
    transfer_entropy_analysis,
)


def _returns(n=100, seed=42):
    """Synthetic return series."""
    import random as _random

    rng = _random.Random(seed)
    return [rng.gauss(0, 0.01) for _ in range(n)]


def _dependent_returns(n=100, lag=1):
    """Y depends on X's past (causal link X -> Y)."""
    x = [math.sin(i * 0.3) * 0.01 for i in range(n)]
    y = [0.0] * n
    for i in range(lag, n):
        y[i] = 0.8 * x[i - lag] + 0.2 * math.cos(i * 0.5) * 0.01
    return x, y


class TestQuantize:
    def test_basic_quantization(self):
        values = [0.0, 1.0, 2.0, 3.0, 4.0]
        result = quantize(values, n_bins=5)
        assert result == [0, 1, 2, 3, 4]

    def test_bins_in_range(self):
        values = [0.0, 1.0, 2.0, 3.0, 4.0]
        result = quantize(values, n_bins=3)
        assert all(0 <= v < 3 for v in result)

    def test_constant_values(self):
        result = quantize([5.0, 5.0, 5.0], n_bins=5)
        assert result == [0, 0, 0]

    def test_empty(self):
        assert quantize([]) == []


class TestTransferEntropy:
    def test_self_te_positive(self):
        returns = _returns(100)
        te = transfer_entropy(returns, returns, k=1, lag=1, n_bins=5)
        assert te >= 0

    def test_insufficient_tuples_zero(self):
        te = transfer_entropy([0.01] * 10, [0.01] * 10, k=1, lag=1, n_bins=5)
        assert te == 0.0

    def test_causal_link_detected(self):
        x, y = _dependent_returns(200, lag=1)
        te_xy = transfer_entropy(x, y, k=1, lag=1, n_bins=5)
        te_yx = transfer_entropy(y, x, k=1, lag=1, n_bins=5)
        assert te_xy > te_yx

    def test_non_negative(self):
        x, y = _dependent_returns(200)
        assert transfer_entropy(x, y) >= 0

    def test_independent_series_low_te(self):
        x = _returns(200, seed=1)
        y = _returns(200, seed=2)
        te = transfer_entropy(x, y, k=1, lag=1, n_bins=5)
        assert te < 0.5


class TestSurrogateTE:
    def test_deterministic_with_seed(self):
        x, y = _dependent_returns(200)
        a = surrogate_te(x, y, 1, 1, 5, 5, seed=42)
        b = surrogate_te(x, y, 1, 1, 5, 5, seed=42)
        assert a == b

    def test_surrogate_lower_than_causal_te(self):
        x, y = _dependent_returns(200)
        te = transfer_entropy(x, y, 1, 1, 5)
        sur = surrogate_te(x, y, 1, 1, 5, 10, seed=42)
        assert te >= sur - 0.1


class TestTESignal:
    def test_influencer(self):
        signal, reason = te_signal(0.05)
        assert signal == "INFLUENCER"

    def test_influenced(self):
        signal, reason = te_signal(-0.05)
        assert signal == "INFLUENCED"

    def test_neutral(self):
        signal, reason = te_signal(0.001)
        assert signal == "NEUTRAL"

    def test_boundary_positive(self):
        signal, reason = te_signal(0.01)
        assert signal == "NEUTRAL"


class TestTransferEntropyAnalysis:
    def test_basic_analysis(self):
        x, y = _dependent_returns(200)
        result = transfer_entropy_analysis(x, y, n_surrogates=5, seed=42)
        assert isinstance(result, TransferEntropyResult)

    def test_insufficient_data_returns_none(self):
        assert transfer_entropy_analysis([0.01] * 5, [0.01] * 5) is None

    def test_empty_returns_none(self):
        assert transfer_entropy_analysis([], []) is None

    def test_net_te_finite(self):
        x, y = _dependent_returns(200)
        result = transfer_entropy_analysis(x, y, n_surrogates=5, seed=42)
        assert math.isfinite(result.net_te)

    def test_ete_finite(self):
        x, y = _dependent_returns(200)
        result = transfer_entropy_analysis(x, y, n_surrogates=5, seed=42)
        assert math.isfinite(result.ete)

    def test_causal_direction_positive_net(self):
        x, y = _dependent_returns(200)
        result = transfer_entropy_analysis(x, y, n_surrogates=5, seed=42)
        assert result.te_xy > result.te_yx

    def test_signal_in_set(self):
        x, y = _dependent_returns(200)
        result = transfer_entropy_analysis(x, y, n_surrogates=5, seed=42)
        assert result.signal in {"INFLUENCER", "INFLUENCED", "NEUTRAL"}

    def test_deterministic_with_seed(self):
        x, y = _dependent_returns(200)
        a = transfer_entropy_analysis(x, y, n_surrogates=5, seed=7)
        b = transfer_entropy_analysis(x, y, n_surrogates=5, seed=7)
        assert a.te_xy == b.te_xy
        assert a.net_te == b.net_te

    def test_custom_params(self):
        x, y = _dependent_returns(200)
        result = transfer_entropy_analysis(x, y, k=2, lag=2, n_bins=4, n_surrogates=3, seed=42)
        assert result.n_tuples > 0

    def test_te_values_non_negative(self):
        x, y = _dependent_returns(200)
        result = transfer_entropy_analysis(x, y, n_surrogates=5, seed=42)
        assert result.te_xy >= 0
        assert result.te_yx >= 0
        assert result.surrogate_xy >= 0
        assert result.surrogate_yx >= 0
