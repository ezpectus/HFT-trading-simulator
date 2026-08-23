"""Tensor Decomposition (CP / ALS) for multi-way financial data.

Decomposes multi-dimensional tensors using CANDECOMP/PARAFAC (CP)
decomposition for dimensionality reduction and latent factor extraction.
"""
from __future__ import annotations

import math
import random


MIN_SYMBOLS = 2
DEFAULT_RANK = 3
DEFAULT_LOOKBACK = 100
DEFAULT_MAX_ITER = 50
TIMEFRAMES = [1, 5, 15]
N_FEATURES = 5
FEATURE_LABELS = ["Return", "Volatility", "Range", "Momentum", "LogVolume"]


class TensorDecompResult:
    """Container for tensor decomposition results."""

    def __init__(
        self,
        symbols: list[str],
        a: list[list[float]],
        b: list[list[float]],
        c: list[list[float]],
        weights: list[float],
        errors: list[float],
        rank: int,
        n_assets: int,
        n_tf: int,
        n_time: int,
        n_features: int,
        recon_quality: float,
        final_error: float,
        signal: str,
        reason: str,
    ) -> None:
        self.symbols = symbols
        self.a = a
        self.b = b
        self.c = c
        self.weights = weights
        self.errors = errors
        self.rank = rank
        self.n_assets = n_assets
        self.n_tf = n_tf
        self.n_time = n_time
        self.n_features = n_features
        self.recon_quality = recon_quality
        self.final_error = final_error
        self.signal = signal
        self.reason = reason


def build_tensor(
    candles: dict,
    exchange: str,
    symbols: list[str],
    timeframes: list[int],
    lookback: int,
) -> dict | None:
    """Build tensor: assets x (timeframes x time) x features."""
    n_assets = len(symbols)
    n_tf = len(timeframes)
    n_time = int(lookback / max(timeframes))

    tensor: list[list[list[float]]] = []
    for symbol in symbols:
        cds = candles.get(exchange, {}).get(symbol)
        if not cds or len(cds) < lookback:
            return None

        asset_slice: list[list[list[float]]] = []
        for tf in timeframes:
            features: list[list[float]] = []
            for t in range(n_time):
                start = len(cds) - lookback + t * tf
                window = cds[start : start + tf]
                if len(window) < 2:
                    features.append([0.0] * N_FEATURES)
                    continue

                prices = [c["close"] for c in window]
                ret = (prices[-1] - prices[0]) / prices[0]
                returns = [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]
                mean = sum(returns) / len(returns)
                vol = math.sqrt(sum((r - mean) ** 2 for r in returns) / len(returns))
                price_range = (max(prices) - min(prices)) / prices[0]
                momentum = ret / (vol + 1e-10)
                volume = sum(c.get("volume", 1) or 1 for c in window) / len(window)

                features.append([ret, vol, price_range, momentum, math.log(volume + 1)])
            asset_slice.append(features)
        tensor.append(asset_slice)

    flat_tensor: list[list[list[float]]] = []
    for a in range(n_assets):
        matrix: list[list[float]] = []
        for f in range(n_tf):
            for t in range(n_time):
                matrix.append(tensor[a][f][t])
        flat_tensor.append(matrix)

    return {
        "tensor": flat_tensor,
        "n_assets": n_assets,
        "n_tf": n_tf,
        "n_time": n_time,
        "n_features": N_FEATURES,
        "n_cols": n_tf * n_time,
    }


def cp_decompose(
    tensor: list[list[list[float]]],
    rank: int,
    max_iter: int = DEFAULT_MAX_ITER,
    seed: int | None = None,
) -> dict:
    """CP decomposition via ALS (3D: assets x time x features)."""
    rng = random.Random(seed)
    i_dim = len(tensor)
    j_dim = len(tensor[0])
    k_dim = len(tensor[0][0])

    def init_factor(n: int, r: int) -> list[list[float]]:
        return [[rng.random() - 0.5 for _ in range(r)] for _ in range(n)]

    a = init_factor(i_dim, rank)
    b = init_factor(j_dim, rank)
    c = init_factor(k_dim, rank)
    errors: list[float] = []

    for _ in range(max_iter):
        for i in range(i_dim):
            for r in range(rank):
                num = 0.0
                den = 0.0
                for j in range(j_dim):
                    for k in range(k_dim):
                        num += tensor[i][j][k] * b[j][r] * c[k][r]
                        den += b[j][r] * b[j][r] * c[k][r] * c[k][r]
                if den > 1e-10:
                    a[i][r] = num / den

        for j in range(j_dim):
            for r in range(rank):
                num = 0.0
                den = 0.0
                for i in range(i_dim):
                    for k in range(k_dim):
                        num += tensor[i][j][k] * a[i][r] * c[k][r]
                        den += a[i][r] * a[i][r] * c[k][r] * c[k][r]
                if den > 1e-10:
                    b[j][r] = num / den

        for k in range(k_dim):
            for r in range(rank):
                num = 0.0
                den = 0.0
                for i in range(i_dim):
                    for j in range(j_dim):
                        num += tensor[i][j][k] * a[i][r] * b[j][r]
                        den += a[i][r] * a[i][r] * b[j][r] * b[j][r]
                if den > 1e-10:
                    c[k][r] = num / den

        error = 0.0
        for i in range(i_dim):
            for j in range(j_dim):
                for k in range(k_dim):
                    recon = sum(a[i][r] * b[j][r] * c[k][r] for r in range(rank))
                    error += (tensor[i][j][k] - recon) ** 2
        errors.append(error)

    weights = [0.0] * rank
    for r in range(rank):
        max_a = max((abs(a[i][r]) for i in range(i_dim)), default=1e-10)
        weights[r] = max_a
        for i in range(i_dim):
            a[i][r] /= max_a

    return {"A": a, "B": b, "C": c, "weights": weights, "errors": errors, "rank": rank}


def tensor_signal(c: list[list[float]], dominant_r: int) -> tuple[str, str]:
    """Signal from dominant factor feature loadings."""
    if c[0][dominant_r] > 0 and c[3][dominant_r] > 0:
        return "BUY", f"Factor {dominant_r + 1}: positive return + momentum loading"
    if c[0][dominant_r] < 0 and c[3][dominant_r] < 0:
        return "SELL", f"Factor {dominant_r + 1}: negative return + momentum loading"
    return "NEUTRAL", f"Factor {dominant_r + 1}: mixed loadings"


def tensor_decomp_analysis(
    candles: dict,
    exchange: str,
    symbols: list[str],
    rank: int = DEFAULT_RANK,
    lookback: int = DEFAULT_LOOKBACK,
    max_iter: int = DEFAULT_MAX_ITER,
    seed: int | None = None,
) -> TensorDecompResult | None:
    """Full tensor decomposition analysis. None if insufficient data."""
    if not candles or not symbols or len(symbols) < MIN_SYMBOLS:
        return None

    valid_symbols = [
        s for s in symbols
        if candles.get(exchange, {}).get(s) and len(candles[exchange][s]) >= lookback
    ]
    if len(valid_symbols) < MIN_SYMBOLS:
        return None

    result = build_tensor(candles, exchange, valid_symbols, TIMEFRAMES, lookback)
    if result is None:
        return None

    tensor = result["tensor"]
    cp = cp_decompose(tensor, rank, max_iter, seed)

    current_factors = cp["A"][0]
    dominant_r = max(range(rank), key=lambda r: abs(current_factors[r]))
    signal, reason = tensor_signal(cp["C"], dominant_r)

    final_error = cp["errors"][-1]
    total_energy = sum(v * v for matrix in tensor for row in matrix for v in row)
    recon_quality = 1 - final_error / total_energy if total_energy > 0 else 0.0

    return TensorDecompResult(
        symbols=valid_symbols,
        a=cp["A"],
        b=cp["B"],
        c=cp["C"],
        weights=cp["weights"],
        errors=cp["errors"],
        rank=rank,
        n_assets=result["n_assets"],
        n_tf=result["n_tf"],
        n_time=result["n_time"],
        n_features=result["n_features"],
        recon_quality=recon_quality,
        final_error=final_error,
        signal=signal,
        reason=reason,
    )
