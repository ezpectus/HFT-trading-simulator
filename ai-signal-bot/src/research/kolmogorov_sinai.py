"""Kolmogorov-Sinai Entropy (chaos theory).

Measures the rate of information production in a dynamical system.
For chaotic systems, KS entropy is positive; for periodic systems, zero.

    KS entropy: h_KS = lim_{ε→0} lim_{n→∞} (1/n)·H(s_0, ..., s_{n-1})
    where s_i are symbolic partitions of the phase space.

    Estimation methods:
    1. Symbolic dynamics: partition returns into symbols, block entropy
       H_n = -Σ p(s_0...s_{n-1})·log₂ p(s_0...s_{n-1})
       h_KS = lim_{n→∞} (H_n - H_{n-1})
    2. Permutation entropy: ordinal patterns of length n, normalized by log₂(n!)
    3. Sample entropy: -ln(A/B) with tolerance r·std
    4. Largest Lyapunov exponent (Rosenstein's method): λ₁ = slope of
       log divergence vs lag (λ₁ > 0 → chaos)

    Predictability horizon: 1/h_KS

Ported from UI-only KolmogorovSinaiEntropy.jsx into trading logic.
Reference: future_development.md §0.2 — extended model list.
"""
from __future__ import annotations

import math

MIN_PRICES = 100
DEFAULT_N_SYMBOLS = 3
DEFAULT_MAX_BLOCK = 8
DEFAULT_PERM_ORDER = 4
DEFAULT_LOOKBACK = 200
SLIDING_WINDOW = 50
LLE_MAX_LAG = 20


class KsResult:
    """Container for Kolmogorov-Sinai entropy analysis results."""

    def __init__(
        self,
        block_entropies: list[dict],
        ks_entropy: float,
        pe: dict,
        se: float,
        lle: dict,
        predictability_horizon: float,
        sliding_ks: list[dict],
        signal: str,
        reason: str,
        symbols: list[int],
        returns: list[float],
    ) -> None:
        self.block_entropies = block_entropies
        self.ks_entropy = ks_entropy
        self.pe = pe
        self.se = se
        self.lle = lle
        self.predictability_horizon = predictability_horizon
        self.sliding_ks = sliding_ks
        self.signal = signal
        self.reason = reason
        self.symbols = symbols
        self.returns = returns


def compute_returns(prices: list[float]) -> list[float]:
    """Simple returns."""
    return [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]


def symbolize(returns: list[float], n_symbols: int = DEFAULT_N_SYMBOLS) -> list[int]:
    """Partition returns into symbols {0..n_symbols-1} via quantile thresholds."""
    sorted_r = sorted(returns)
    thresholds = [sorted_r[math.floor(len(sorted_r) * i / n_symbols)] for i in range(1, n_symbols)]
    symbols = []
    for r in returns:
        s = 0
        for i, thr in enumerate(thresholds):
            if r > thr:
                s = i + 1
        symbols.append(s)
    return symbols


def block_entropy(symbols: list[int], block_size: int) -> float:
    """Entropy H_n of n-grams of symbols."""
    n = len(symbols)
    if n < block_size:
        return 0.0
    blocks: dict = {}
    for i in range(n - block_size + 1):
        key = tuple(symbols[i : i + block_size])
        blocks[key] = blocks.get(key, 0) + 1
    total = n - block_size + 1
    entropy = 0.0
    for count in blocks.values():
        p = count / total
        if p > 0:
            entropy -= p * math.log2(p)
    return entropy


def factorial(n: int) -> int:
    """n!"""
    f = 1
    for i in range(2, n + 1):
        f *= i
    return f


def permutation_entropy(returns: list[float], order: int = DEFAULT_PERM_ORDER) -> dict:
    """Permutation entropy of ordinal patterns, normalized by log₂(order!)."""
    n = len(returns)
    if n < order:
        return {"entropy": 0.0, "normalized": 0.0, "patterns": {}}
    patterns: dict = {}
    for i in range(n - order + 1):
        window = returns[i : i + order]
        indexed = sorted(range(order), key=lambda k: window[k])
        pattern = tuple(indexed)
        patterns[pattern] = patterns.get(pattern, 0) + 1
    total = n - order + 1
    entropy = 0.0
    for count in patterns.values():
        p = count / total
        if p > 0:
            entropy -= p * math.log2(p)
    max_entropy = math.log2(factorial(order))
    normalized = entropy / max_entropy if max_entropy > 0 else 0.0
    return {"entropy": entropy, "normalized": normalized, "patterns": patterns}


def sample_entropy(returns: list[float], m: int = 2, r: float = 0.2) -> float:
    """Sample entropy: -ln(A/B) with tolerance r·std (RMS)."""
    n = len(returns)
    std = math.sqrt(sum(v * v for v in returns) / n)
    threshold = r * std

    def count_matches(length: int) -> int:
        count = 0
        for i in range(n - length):
            for j in range(i + 1, n - length):
                match = True
                for k in range(length):
                    if abs(returns[i + k] - returns[j + k]) > threshold:
                        match = False
                        break
                if match:
                    count += 1
        return count

    a = count_matches(m + 1)
    b = count_matches(m)
    if b == 0:
        return 0.0
    return -math.log(a / b)


def largest_lyapunov(returns: list[float], max_lag: int = LLE_MAX_LAG) -> dict:
    """Largest Lyapunov exponent via Rosenstein's method (embedding dim 2, delay 1)."""
    n = len(returns)
    if n < max_lag * 2:
        return {"lle": 0.0, "divergences": []}

    points = [[returns[i], returns[i + 1]] for i in range(n - 1)]

    divergences = []
    for lag in range(1, max_lag + 1):
        total_log = 0.0
        count = 0
        for i in range(len(points) - lag):
            min_dist = float("inf")
            nn_idx = -1
            for j in range(len(points)):
                if abs(j - i) < 5:
                    continue
                d = math.sqrt((points[i][0] - points[j][0]) ** 2 + (points[i][1] - points[j][1]) ** 2)
                if d < min_dist and d > 0:
                    min_dist = d
                    nn_idx = j
            if nn_idx >= 0 and nn_idx + lag < len(points) and i + lag < len(points):
                d0 = min_dist
                dt = math.sqrt(
                    (points[i + lag][0] - points[nn_idx + lag][0]) ** 2
                    + (points[i + lag][1] - points[nn_idx + lag][1]) ** 2
                )
                if d0 > 0 and dt > 0:
                    total_log += math.log(dt / d0)
                    count += 1
        if count > 0:
            divergences.append({"lag": lag, "log_div": total_log / count})

    if len(divergences) < 3:
        return {"lle": 0.0, "divergences": divergences}

    n_d = len(divergences)
    mean_x = sum(d["lag"] for d in divergences) / n_d
    mean_y = sum(d["log_div"] for d in divergences) / n_d
    num = sum((d["lag"] - mean_x) * (d["log_div"] - mean_y) for d in divergences)
    den = sum((d["lag"] - mean_x) ** 2 for d in divergences)
    slope = num / den if den > 0 else 0.0

    return {"lle": slope, "divergences": divergences}


def ks_signal(lle: float, ks_entropy: float) -> tuple[str, str]:
    """Signal from Lyapunov exponent and KS entropy."""
    if lle > 0.01:
        return "CHAOTIC", f"Positive Lyapunov exponent λ₁={lle:.4f} (chaotic, sensitive to initial conditions)"
    if ks_entropy < 0.01:
        return "PERIODIC", f"KS entropy ≈ 0 ({ks_entropy:.4f}) (periodic/predictable)"
    if ks_entropy > 0.5:
        return "HIGH_ENTROPY", f"KS entropy = {ks_entropy:.4f} (high complexity, hard to predict)"
    return "STOCHASTIC", f"KS entropy = {ks_entropy:.4f} (moderate complexity)"


def ks_analysis(
    prices: list[float],
    n_symbols: int = DEFAULT_N_SYMBOLS,
    max_block: int = DEFAULT_MAX_BLOCK,
    perm_order: int = DEFAULT_PERM_ORDER,
    lookback: int = DEFAULT_LOOKBACK,
) -> KsResult | None:
    """Full Kolmogorov-Sinai analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)

    # Symbolic dynamics
    symbols = symbolize(returns, n_symbols)

    # Block entropy for different block sizes
    block_entropies = []
    for b in range(1, max_block + 1):
        h = block_entropy(symbols, b)
        rate = h - block_entropies[b - 2]["entropy"] if b > 1 else h
        block_entropies.append({"block_size": b, "entropy": h, "rate": rate})

    # KS entropy estimate: H_n - H_{n-1} as n → ∞
    ks_entropy = block_entropies[-1]["rate"]

    # Permutation entropy
    pe = permutation_entropy(returns, perm_order)

    # Sample entropy
    se = sample_entropy(returns, 2, 0.2)

    # Largest Lyapunov exponent
    lle = largest_lyapunov(returns, LLE_MAX_LAG)

    # Predictability horizon: 1 / h_KS
    predictability_horizon = 1 / ks_entropy if ks_entropy > 0 else float("inf")

    # Sliding window KS entropy
    sliding_ks = []
    step = max(5, SLIDING_WINDOW // 4)
    i = 0
    while i + SLIDING_WINDOW <= len(returns):
        window = returns[i : i + SLIDING_WINDOW]
        wsym = symbolize(window, n_symbols)
        be = [block_entropy(wsym, b) for b in range(1, min(5, max_block) + 1)]
        ks = be[-1] - be[-2]
        sliding_ks.append({"idx": i, "ks": ks if ks > 0 else 0.0})
        i += step

    signal, reason = ks_signal(lle["lle"], ks_entropy)

    return KsResult(
        block_entropies=block_entropies,
        ks_entropy=ks_entropy,
        pe=pe,
        se=se,
        lle=lle,
        predictability_horizon=predictability_horizon,
        sliding_ks=sliding_ks,
        signal=signal,
        reason=reason,
        symbols=symbols,
        returns=returns,
    )
