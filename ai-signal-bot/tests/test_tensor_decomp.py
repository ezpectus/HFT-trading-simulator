"""Tests for Tensor Decomposition (CP/ALS) model."""
import math

import pytest

from src.research.tensor_decomp import (
    TensorDecompResult,
    build_tensor,
    cp_decompose,
    tensor_decomp_analysis,
    tensor_signal,
)


def _candles(n=120):
    """Synthetic candles for multiple symbols."""
    candles = {}
    for sym in ["BTC", "ETH", "SOL"]:
        series = []
        price = 100.0
        for i in range(n):
            price *= 1 + 0.005 * (i % 5 - 2)
            series.append({"close": price, "volume": 1000 + (i % 7) * 100})
        candles[sym] = series
    return {"binance": candles}


def _tensor(i=3, j=15, k=5):
    """Synthetic 3D tensor."""
    return [[[math.sin(i * 0.3 + j * 0.2 + k * 0.1) * 0.5 for k in range(k)] for j in range(j)] for i in range(i)]


class TestBuildTensor:
    def test_basic(self):
        result = build_tensor(_candles(120), "binance", ["BTC", "ETH", "SOL"], [1, 5, 15], 100)
        assert result is not None
        assert result["n_assets"] == 3
        assert result["n_tf"] == 3
        assert result["n_features"] == 5

    def test_insufficient_candles_none(self):
        assert build_tensor(_candles(30), "binance", ["BTC", "ETH", "SOL"], [1, 5, 15], 100) is None

    def test_tensor_shape(self):
        result = build_tensor(_candles(120), "binance", ["BTC", "ETH", "SOL"], [1, 5, 15], 100)
        assert len(result["tensor"]) == 3
        assert len(result["tensor"][0]) == 3 * result["n_time"]
        assert len(result["tensor"][0][0]) == 5


class TestCPDecompose:
    def test_basic_decomposition(self):
        result = cp_decompose(_tensor(), rank=3, max_iter=20, seed=42)
        assert len(result["A"]) == 3
        assert len(result["B"]) == 15
        assert len(result["C"]) == 5
        assert len(result["weights"]) == 3

    def test_deterministic_with_seed(self):
        a = cp_decompose(_tensor(), rank=3, max_iter=10, seed=7)
        b = cp_decompose(_tensor(), rank=3, max_iter=10, seed=7)
        assert a["A"] == b["A"]
        assert a["errors"] == b["errors"]

    def test_error_decreases(self):
        result = cp_decompose(_tensor(), rank=3, max_iter=30, seed=42)
        assert result["errors"][-1] < result["errors"][0]

    def test_errors_length(self):
        result = cp_decompose(_tensor(), rank=3, max_iter=15, seed=42)
        assert len(result["errors"]) == 15

    def test_weights_positive(self):
        result = cp_decompose(_tensor(), rank=3, max_iter=20, seed=42)
        assert all(w > 0 for w in result["weights"])


class TestTensorSignal:
    def test_buy(self):
        c = [[0.5, 0.1], [0.1, 0.1], [0.1, 0.1], [0.5, 0.1], [0.1, 0.1]]
        signal, reason = tensor_signal(c, 0)
        assert signal == "BUY"

    def test_sell(self):
        c = [[-0.5, 0.1], [0.1, 0.1], [0.1, 0.1], [-0.5, 0.1], [0.1, 0.1]]
        signal, reason = tensor_signal(c, 0)
        assert signal == "SELL"

    def test_neutral_mixed(self):
        c = [[0.5, 0.1], [0.1, 0.1], [0.1, 0.1], [-0.5, 0.1], [0.1, 0.1]]
        signal, reason = tensor_signal(c, 0)
        assert signal == "NEUTRAL"


class TestTensorDecompAnalysis:
    def test_basic_analysis(self):
        result = tensor_decomp_analysis(_candles(120), "binance", ["BTC", "ETH", "SOL"], seed=42)
        assert isinstance(result, TensorDecompResult)
        assert result.n_assets == 3

    def test_insufficient_symbols_returns_none(self):
        assert tensor_decomp_analysis(_candles(120), "binance", ["BTC"], seed=42) is None

    def test_empty_returns_none(self):
        assert tensor_decomp_analysis({}, "binance", ["BTC", "ETH"], seed=42) is None

    def test_signal_in_set(self):
        result = tensor_decomp_analysis(_candles(120), "binance", ["BTC", "ETH", "SOL"], seed=42)
        assert result.signal in {"BUY", "SELL", "NEUTRAL"}

    def test_recon_quality_bounded(self):
        result = tensor_decomp_analysis(_candles(120), "binance", ["BTC", "ETH", "SOL"], seed=42)
        assert result.recon_quality <= 1.5

    def test_final_error_non_negative(self):
        result = tensor_decomp_analysis(_candles(120), "binance", ["BTC", "ETH", "SOL"], seed=42)
        assert result.final_error >= 0

    def test_custom_rank(self):
        result = tensor_decomp_analysis(_candles(120), "binance", ["BTC", "ETH", "SOL"], rank=2, seed=42)
        assert result.rank == 2
        assert len(result.weights) == 2

    def test_deterministic_with_seed(self):
        a = tensor_decomp_analysis(_candles(120), "binance", ["BTC", "ETH", "SOL"], seed=7)
        b = tensor_decomp_analysis(_candles(120), "binance", ["BTC", "ETH", "SOL"], seed=7)
        assert a.weights == b.weights
        assert a.signal == b.signal

    def test_symbols_filtered(self):
        result = tensor_decomp_analysis(_candles(120), "binance", ["BTC", "ETH", "SOL", "XRP"], seed=42)
        assert "XRP" not in result.symbols

    def test_errors_decreasing(self):
        result = tensor_decomp_analysis(_candles(120), "binance", ["BTC", "ETH", "SOL"], seed=42)
        assert result.errors[-1] < result.errors[0]

    def test_factor_matrix_shapes(self):
        result = tensor_decomp_analysis(_candles(120), "binance", ["BTC", "ETH", "SOL"], seed=42)
        assert len(result.a) == 3
        assert len(result.c) == 5
