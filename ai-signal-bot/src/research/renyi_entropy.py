"""Rényi Entropy Dynamics (order-α entropy tracking).

Tracks Rényi entropy at various orders α to probe different aspects of
the return distribution: tail behavior, concentration, and diversity.
"""
from __future__ import annotations

import math

from src.research._common import compute_returns

MIN_PRICES = 60
DEFAULT_N_BINS = 20
DEFAULT_LOOKBACK = 150
DEFAULT_WINDOW_SIZE = 40
ALPHAS = [0, 0.5, 1, 2, 3, 5, 10, float("inf")]
DIM_ALPHAS = [0.5, 1, 2, 3, 5, 10]
N_BINS_LIST = [5, 10, 15, 20, 25, 30, 40, 50]


class RenyiResult:
    """Container for Rényi entropy analysis results."""

    def __init__(
        self,
        renyi_spectrum: list[dict],
        dims: list[dict],
        sliding_renyi: list[dict],
        current: dict,
        concentration_ratio: float,
        efficiency: float,
        signal: str,
        reason: str,
        probs: list[float],
        n_bins: int,
    ) -> None:
        self.renyi_spectrum = renyi_spectrum
        self.dims = dims
        self.sliding_renyi = sliding_renyi
        self.current = current
        self.concentration_ratio = concentration_ratio
        self.efficiency = efficiency
        self.signal = signal
        self.reason = reason
        self.probs = probs
        self.n_bins = n_bins


def histogram(data: list[float], n_bins: int) -> dict:
    """Histogram probabilities."""
    min_v = min(data)
    max_v = max(data)
    bin_w = (max_v - min_v) / n_bins if max_v > min_v else 1.0
    counts = [0] * n_bins
    for v in data:
        idx = min(n_bins - 1, max(0, math.floor((v - min_v) / bin_w)))
        counts[idx] += 1
    total = len(data)
    return {"probs": [c / total for c in counts], "min": min_v, "max": max_v, "bin_w": bin_w}


def renyi_entropy(probs: list[float], alpha: float) -> float:
    """Rényi entropy at order α (base-2)."""
    if alpha <= 0:
        # Hartley entropy: log of support size
        support = sum(1 for p in probs if p > 0)
        return math.log2(support) if support > 0 else 0.0
    if abs(alpha - 1) < 1e-6:
        # Shannon entropy
        return -sum(p * math.log2(p) for p in probs if p > 0)
    if alpha == float("inf"):
        # Min-entropy
        return -math.log2(max(probs))
    # General: (1/(1-α)) · log₂ Σ p_i^α
    total = sum(p ** alpha for p in probs if p > 0)
    return math.log2(total) / (1 - alpha)


def tsallis_entropy(probs: list[float], q: float) -> float:
    """Tsallis entropy at order q (natural log)."""
    if abs(q - 1) < 1e-6:
        return -sum(p * math.log(p) for p in probs if p > 0)
    return (1 - sum(p ** q for p in probs if p > 0)) / (q - 1)


def generalized_dimensions(returns: list[float], n_bins_list: list[int], alpha: float) -> list[dict]:
    """Generalized (fractal) dimensions via entropy vs resolution regression."""
    results = []
    for n_bins in n_bins_list:
        probs = histogram(returns, n_bins)["probs"]
        h = renyi_entropy(probs, alpha)
        results.append({"n_bins": n_bins, "log_r": math.log2(n_bins), "entropy": h, "dim": h / math.log2(n_bins)})
    return results


def renyi_signal(concentration_ratio: float) -> tuple[str, str]:
    """Signal from H_∞/H_0 concentration ratio."""
    if concentration_ratio < 0.3:
        return "DIVERSE", f"H_∞/H_0 = {concentration_ratio:.4f} (diverse distribution, low concentration)"
    if concentration_ratio > 0.7:
        return "CONCENTRATED", f"H_∞/H_0 = {concentration_ratio:.4f} (concentrated distribution, high tail risk)"
    return "BALANCED", f"H_∞/H_0 = {concentration_ratio:.4f} (balanced distribution)"


def renyi_analysis(
    prices: list[float],
    n_bins: int = DEFAULT_N_BINS,
    lookback: int = DEFAULT_LOOKBACK,
    window_size: int = DEFAULT_WINDOW_SIZE,
) -> RenyiResult | None:
    """Full Rényi entropy analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)

    # Full distribution Rényi entropies at various α
    probs = histogram(returns, n_bins)["probs"]
    renyi_spectrum = [
        {
            "alpha": alpha,
            "entropy": renyi_entropy(probs, alpha),
            "tsallis": tsallis_entropy(probs, 0.01 if alpha == 0 else alpha),
        }
        for alpha in ALPHAS
    ]

    # Generalized dimensions D_α (linear regression H_α vs log₂(nBins))
    dims = []
    for alpha in DIM_ALPHAS:
        gd = generalized_dimensions(returns, N_BINS_LIST, alpha)
        xs = [g["log_r"] for g in gd]
        ys = [g["entropy"] for g in gd]
        mean_x = sum(xs) / len(xs)
        mean_y = sum(ys) / len(ys)
        num = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(len(xs)))
        den = sum((xs[i] - mean_x) ** 2 for i in range(len(xs)))
        d = num / den if den > 0 else 0.0
        dims.append({"alpha": alpha, "D": d, "gd": gd})

    # Sliding window Rényi entropy at α=2 (collision entropy)
    sliding_renyi = []
    step = max(3, window_size // 4)
    i = 0
    while i + window_size <= len(returns):
        window = returns[i : i + window_size]
        wp = histogram(window, n_bins)["probs"]
        sliding_renyi.append(
            {
                "idx": i,
                "h0": renyi_entropy(wp, 0),
                "h1": renyi_entropy(wp, 1),
                "h2": renyi_entropy(wp, 2),
                "h_inf": renyi_entropy(wp, float("inf")),
            }
        )
        i += step

    current = sliding_renyi[-1] if sliding_renyi else {"h0": 0.0, "h1": 0.0, "h2": 0.0, "h_inf": 0.0}

    # Signal: compare H_0 (diversity) vs H_∞ (concentration)
    concentration_ratio = current["h_inf"] / (current["h0"] + 1e-10)
    signal, reason = renyi_signal(concentration_ratio)

    # Efficiency: H_1 / H_0 (Shannon / Hartley)
    efficiency = current["h1"] / (current["h0"] + 1e-10)

    return RenyiResult(
        renyi_spectrum=renyi_spectrum,
        dims=dims,
        sliding_renyi=sliding_renyi,
        current=current,
        concentration_ratio=concentration_ratio,
        efficiency=efficiency,
        signal=signal,
        reason=reason,
        probs=probs,
        n_bins=n_bins,
    )
