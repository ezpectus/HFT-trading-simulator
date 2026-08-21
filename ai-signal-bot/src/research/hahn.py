"""Hahn Decomposition (signed measure splitting for signal/noise).

Applies the Hahn decomposition theorem to split the return distribution
into positive (signal) and negative (noise) sets based on a signed
measure derived from expected value.

    Hahn decomposition: X = P ∪ N, P ∩ N = ∅
    where μ(A) ≥ 0 for all A ⊂ P (positive set)
    and μ(A) ≤ 0 for all A ⊂ N (negative set)

    Jordan decomposition: μ = μ+ - μ-
    μ+(A) = μ(A ∩ P), μ-(A) = -μ(A ∩ N)
    Total variation: |μ| = μ+ + μ-

    For trading: signed measure = E[return·indicator]
    P = set where expected return > 0 (signal)
    N = set where expected return < 0 (noise/anti-signal)

Applications: signal/noise separation, trade region identification,
signed volume analysis, directional bias detection.

Ported from UI-only HahnDecomposition.jsx into trading logic.
Reference: future_development.md §0.2 — extended model list.
"""
from __future__ import annotations

import math

MIN_PRICES = 20
DEFAULT_LOOKBACK = 150
DEFAULT_N_BINS = 30
DEFAULT_THRESHOLD = 0.0
ROLLING_WINDOW = 30


class HahnResult:
    """Container for Hahn decomposition analysis results."""

    def __init__(
        self,
        bins: list[dict],
        positive_bins: list[dict],
        negative_bins: list[dict],
        mu_plus: float,
        mu_minus: float,
        total_variation: float,
        snr: float,
        cumulative: list[dict],
        rolling_decomp: list[dict],
        signal: str,
        reason: str,
        current_snr: float,
        current_bias: float,
        min_r: float,
        max_r: float,
    ) -> None:
        self.bins = bins
        self.positive_bins = positive_bins
        self.negative_bins = negative_bins
        self.mu_plus = mu_plus
        self.mu_minus = mu_minus
        self.total_variation = total_variation
        self.snr = snr
        self.cumulative = cumulative
        self.rolling_decomp = rolling_decomp
        self.signal = signal
        self.reason = reason
        self.current_snr = current_snr
        self.current_bias = current_bias
        self.min_r = min_r
        self.max_r = max_r


def compute_returns(prices: list[float]) -> list[float]:
    """Simple returns."""
    return [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]


def hahn_decomposition(returns: list[float], n_bins: int = DEFAULT_N_BINS, threshold: float = DEFAULT_THRESHOLD) -> dict:
    """Hahn/Jordan decomposition of the return distribution."""
    n = len(returns)
    min_r = min(returns)
    max_r = max(returns)
    bin_width = (max_r - min_r) / n_bins if max_r > min_r else 1.0

    bins = []
    for i in range(n_bins):
        lo = min_r + i * bin_width
        hi = lo + bin_width
        mid = (lo + hi) / 2
        if i == n_bins - 1:
            count = sum(1 for r in returns if lo <= r <= hi)
        else:
            count = sum(1 for r in returns if lo <= r < hi)
        freq = count / n
        # Signed measure: μ(bin) = E[return·1_{bin}] = mid·freq
        signed_measure = mid * freq
        bins.append(
            {
                "lo": lo,
                "hi": hi,
                "mid": mid,
                "count": count,
                "freq": freq,
                "signed_measure": signed_measure,
                "is_positive": signed_measure > threshold,
            }
        )

    # Hahn decomposition: P (positive set) and N (negative set)
    positive_bins = [b for b in bins if b["is_positive"]]
    negative_bins = [b for b in bins if not b["is_positive"]]

    # Jordan decomposition
    mu_plus = sum(b["signed_measure"] for b in positive_bins)
    mu_minus = abs(sum(b["signed_measure"] for b in negative_bins))
    total_variation = mu_plus + mu_minus

    # Signal-to-noise ratio
    snr = mu_plus / (mu_minus + 1e-10)

    # Cumulative signed measure
    cum_mu = 0.0
    cumulative = []
    for b in bins:
        cum_mu += b["signed_measure"]
        cumulative.append({"mid": b["mid"], "cum_mu": cum_mu})

    return {
        "bins": bins,
        "positive_bins": positive_bins,
        "negative_bins": negative_bins,
        "mu_plus": mu_plus,
        "mu_minus": mu_minus,
        "total_variation": total_variation,
        "snr": snr,
        "cumulative": cumulative,
        "min_r": min_r,
        "max_r": max_r,
    }


def rolling_decomposition(returns: list[float], window_size: int = ROLLING_WINDOW) -> list[dict]:
    """Rolling Hahn decomposition over time."""
    n = len(returns)
    step = max(3, window_size // 4)
    rolling = []
    i = 0
    while i + window_size <= n:
        window = returns[i : i + window_size]
        w_mean = sum(window) / len(window)
        pos = [r for r in window if r > 0]
        neg = [r for r in window if r < 0]
        pos_sum = sum(pos)
        neg_sum = abs(sum(neg))
        rolling.append(
            {
                "idx": i,
                "mu_plus": pos_sum / window_size,
                "mu_minus": neg_sum / window_size,
                "total_var": (pos_sum + neg_sum) / window_size,
                "snr": pos_sum / (neg_sum + 1e-10),
                "bias": w_mean,
            }
        )
        i += step
    return rolling


def hahn_signal(current_snr: float, current_bias: float) -> tuple[str, str]:
    """Signal from current SNR and bias."""
    if current_snr > 2 and current_bias > 0:
        return "STRONG_SIGNAL_LONG", f"Positive set dominates (SNR={current_snr:.2f}, bias={current_bias:.6f})"
    if current_snr > 2 and current_bias < 0:
        return "STRONG_SIGNAL_SHORT", f"Negative set dominates (SNR={current_snr:.2f}, bias={current_bias:.6f})"
    if current_snr > 1.2:
        return "WEAK_SIGNAL", f"Mild directional bias (SNR={current_snr:.2f}, bias={current_bias:.6f})"
    return "BALANCED", f"Signal/noise balanced (SNR={current_snr:.2f})"


def hahn_analysis(
    prices: list[float],
    lookback: int = DEFAULT_LOOKBACK,
    n_bins: int = DEFAULT_N_BINS,
    threshold: float = DEFAULT_THRESHOLD,
) -> HahnResult | None:
    """Full Hahn decomposition analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)

    n = len(returns)
    if n < 20:
        return None

    decomp = hahn_decomposition(returns, n_bins, threshold)

    # Rolling Hahn decomposition over time
    rolling = rolling_decomposition(returns)

    # Current signal
    current_snr = rolling[-1]["snr"] if rolling else decomp["snr"]
    current_bias = rolling[-1]["bias"] if rolling else 0.0
    signal, reason = hahn_signal(current_snr, current_bias)

    return HahnResult(
        bins=decomp["bins"],
        positive_bins=decomp["positive_bins"],
        negative_bins=decomp["negative_bins"],
        mu_plus=decomp["mu_plus"],
        mu_minus=decomp["mu_minus"],
        total_variation=decomp["total_variation"],
        snr=decomp["snr"],
        cumulative=decomp["cumulative"],
        rolling_decomp=rolling,
        signal=signal,
        reason=reason,
        current_snr=current_snr,
        current_bias=current_bias,
        min_r=decomp["min_r"],
        max_r=decomp["max_r"],
    )
