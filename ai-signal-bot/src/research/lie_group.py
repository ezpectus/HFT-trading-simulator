"""Lie Group Symmetries (symmetry-based market analysis).

Analyzes financial time series through the lens of Lie group symmetries,
detecting invariant structures and symmetry-breaking events that signal
regime changes.
"""
from __future__ import annotations

import math

MIN_PRICES = 40
DEFAULT_WINDOW_SIZE = 20
DEFAULT_LOOKBACK = 100


class LieResult:
    """Container for Lie group symmetry analysis results."""

    def __init__(
        self,
        trans: dict,
        scaling: dict,
        time_trans: dict,
        galilean: dict,
        lie_coeffs: list[dict],
        total_breaking: float,
        current: dict,
        signal: str,
        reason: str,
        noether: dict,
        breaking_scores: list[dict],
        returns: list[float],
    ) -> None:
        self.trans = trans
        self.scaling = scaling
        self.time_trans = time_trans
        self.galilean = galilean
        self.lie_coeffs = lie_coeffs
        self.total_breaking = total_breaking
        self.current = current
        self.signal = signal
        self.reason = reason
        self.noether = noether
        self.breaking_scores = breaking_scores
        self.returns = returns


def compute_returns(prices: list[float]) -> list[float]:
    """Simple returns."""
    return [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]


def _window_step(window_size: int) -> int:
    """Sliding window step (as in UI)."""
    return max(1, window_size // 2)


def translation_symmetry(returns: list[float], window_size: int) -> dict:
    """Translation symmetry: mean should be conserved across windows."""
    results = []
    step = _window_step(window_size)
    i = 0
    while i + window_size <= len(returns):
        window = returns[i : i + window_size]
        mean = sum(window) / len(window)
        results.append({"idx": i, "mean": mean, "conserved": mean})
        i += step

    means = [r["mean"] for r in results]
    overall_mean = sum(means) / len(means) if means else 0.0
    breaking = math.sqrt(sum((m - overall_mean) ** 2 for m in means) / len(means)) if means else 0.0
    return {"results": results, "breaking": breaking, "conserved": overall_mean}


def scaling_symmetry(returns: list[float], window_size: int) -> dict:
    """Scaling symmetry: std/mean ratio should be conserved."""
    results = []
    step = _window_step(window_size)
    i = 0
    while i + window_size <= len(returns):
        window = returns[i : i + window_size]
        mean = sum(window) / len(window)
        std = math.sqrt(sum((r - mean) ** 2 for r in window) / len(window))
        ratio = std / (abs(mean) + 1e-10)
        results.append({"idx": i, "std": std, "mean": mean, "ratio": ratio})
        i += step

    ratios = [r["ratio"] for r in results]
    mean_ratio = sum(ratios) / len(ratios) if ratios else 0.0
    breaking = math.sqrt(sum((r - mean_ratio) ** 2 for r in ratios) / len(ratios)) if ratios else 0.0
    return {"results": results, "breaking": breaking, "conserved": mean_ratio}


def time_translation_symmetry(returns: list[float], window_size: int, lag: int = 1) -> dict:
    """Time translation symmetry: autocorrelation structure."""
    results = []
    step = _window_step(window_size)
    i = 0
    while i + window_size + lag <= len(returns):
        window = returns[i : i + window_size]
        n = len(window)
        mean = sum(window) / n
        cov = 0.0
        var0 = 0.0
        for j in range(n - lag):
            cov += (window[j] - mean) * (window[j + lag] - mean)
            var0 += (window[j] - mean) ** 2
        acf = cov / var0 if var0 > 0 else 0.0
        results.append({"idx": i, "acf": acf})
        i += step

    acfs = [r["acf"] for r in results]
    mean_acf = sum(acfs) / len(acfs) if acfs else 0.0
    breaking = math.sqrt(sum((a - mean_acf) ** 2 for a in acfs) / len(acfs)) if acfs else 0.0
    return {"results": results, "breaking": breaking, "conserved": mean_acf}


def galilean_symmetry(returns: list[float], window_size: int) -> dict:
    """Galilean symmetry (trend invariance): detrended variance."""
    results = []
    step = _window_step(window_size)
    i = 0
    while i + window_size <= len(returns):
        window = returns[i : i + window_size]
        n = len(window)
        t_mean = (n - 1) / 2
        r_mean = sum(window) / n
        num = 0.0
        den = 0.0
        for j in range(n):
            num += (j - t_mean) * (window[j] - r_mean)
            den += (j - t_mean) ** 2
        slope = num / den if den > 0 else 0.0
        residuals = [window[j] - r_mean - slope * (j - t_mean) for j in range(n)]
        detrended_var = sum(r * r for r in residuals) / n
        results.append({"idx": i, "slope": slope, "detrended_var": detrended_var})
        i += step

    vars_ = [r["detrended_var"] for r in results]
    mean_var = sum(vars_) / len(vars_) if vars_ else 0.0
    breaking = math.sqrt(sum((v - mean_var) ** 2 for v in vars_) / len(vars_)) if vars_ else 0.0
    return {"results": results, "breaking": breaking, "conserved": mean_var}


def lie_algebra_coeffs(returns: list[float], window_size: int) -> list[dict]:
    """Lie algebra generator coefficients (infinitesimal)."""
    results = []
    step = _window_step(window_size)
    i = 0
    while i + window_size <= len(returns):
        window = returns[i : i + window_size]
        n = len(window)
        mean = sum(window) / n
        std = math.sqrt(sum((r - mean) ** 2 for r in window) / n)
        e1 = mean  # translation generator
        e2 = std  # scaling generator
        e3 = mean / (std + 1e-10)  # Sharpe-like (combined)
        results.append({"idx": i, "e1": e1, "e2": e2, "e3": e3})
        i += step
    return results


def lie_signal(total_breaking: float) -> tuple[str, str]:
    """Signal from total symmetry breaking score."""
    if total_breaking > 0.01:
        return "SYMMETRY_BROKEN", f"High symmetry breaking (score={total_breaking:.6f}) — regime change likely"
    if total_breaking > 0.005:
        return "WEAK_BREAKING", f"Moderate symmetry breaking (score={total_breaking:.6f})"
    return "SYMMETRIC", f"Low symmetry breaking (score={total_breaking:.6f}) — stable regime"


def lie_analysis(
    prices: list[float],
    window_size: int = DEFAULT_WINDOW_SIZE,
    lookback: int = DEFAULT_LOOKBACK,
) -> LieResult | None:
    """Full Lie group symmetry analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)

    # Compute all symmetries
    trans = translation_symmetry(returns, window_size)
    scaling = scaling_symmetry(returns, window_size)
    time_trans = time_translation_symmetry(returns, window_size, 1)
    galilean = galilean_symmetry(returns, window_size)
    lie_coeffs = lie_algebra_coeffs(returns, window_size)

    # Overall symmetry breaking score
    total_breaking = (trans["breaking"] + scaling["breaking"] + time_trans["breaking"] + galilean["breaking"]) / 4

    # Current Lie algebra coefficients
    current = lie_coeffs[-1] if lie_coeffs else {"idx": 0, "e1": 0.0, "e2": 0.0, "e3": 0.0}

    signal, reason = lie_signal(total_breaking)

    # Noether conserved quantities
    noether = {
        "momentum": trans["conserved"],
        "scaling_ratio": scaling["conserved"],
        "correlation": time_trans["conserved"],
        "detrended_var": galilean["conserved"],
    }

    # Identify which symmetry is most broken
    breaking_scores = [
        {"name": "Translation", "value": trans["breaking"], "color": "#06b6d4"},
        {"name": "Scaling", "value": scaling["breaking"], "color": "#f0b90b"},
        {"name": "Time Trans.", "value": time_trans["breaking"], "color": "#a855f7"},
        {"name": "Galilean", "value": galilean["breaking"], "color": "#0ecb81"},
    ]
    breaking_scores.sort(key=lambda s: s["value"], reverse=True)

    return LieResult(
        trans=trans,
        scaling=scaling,
        time_trans=time_trans,
        galilean=galilean,
        lie_coeffs=lie_coeffs,
        total_breaking=total_breaking,
        current=current,
        signal=signal,
        reason=reason,
        noether=noether,
        breaking_scores=breaking_scores,
        returns=returns,
    )
