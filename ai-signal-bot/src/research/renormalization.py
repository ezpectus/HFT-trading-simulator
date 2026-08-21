"""Renormalization Group (multi-scale market dynamics).

Applies renormalization group concepts from statistical physics to analyze
market dynamics across multiple time scales, detecting scale-invariant
behavior and phase transitions.
"""
from __future__ import annotations

import math

MIN_PRICES = 50
DEFAULT_MAX_SCALE = 20
DEFAULT_LOOKBACK = 200
CORR_LAG_MAX = 20
CORR_DECAY_THRESHOLD = 0.1
FIXED_POINT_TOL = 0.001
PHASE_TRANSITION_KURT = 5.0


class RgResult:
    """Container for Renormalization Group analysis results."""

    def __init__(
        self,
        scales: list[dict],
        vol_scaling: float,
        kurt_scaling: float,
        corr_lengths: list[dict],
        rg_flow: list[dict],
        fixed_points: list[dict],
        max_kurt_change: dict,
        current_xi: float,
        signal: str,
        reason: str,
        is_scale_invariant: bool,
    ) -> None:
        self.scales = scales
        self.vol_scaling = vol_scaling
        self.kurt_scaling = kurt_scaling
        self.corr_lengths = corr_lengths
        self.rg_flow = rg_flow
        self.fixed_points = fixed_points
        self.max_kurt_change = max_kurt_change
        self.current_xi = current_xi
        self.signal = signal
        self.reason = reason
        self.is_scale_invariant = is_scale_invariant


def compute_returns(prices: list[float]) -> list[float]:
    """Simple returns."""
    return [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]


def coarse_grain(returns: list[float], n: int) -> list[float]:
    """Aggregate n consecutive returns (non-overlapping blocks)."""
    aggregated = []
    for i in range(0, len(returns) - n + 1, n):
        aggregated.append(sum(returns[i : i + n]))
    return aggregated


def volatility_at_scale(returns: list[float], n: int) -> float:
    """Volatility (std) of coarse-grained returns at scale n."""
    cg = coarse_grain(returns, n)
    if len(cg) < 2:
        return 0.0
    mean = sum(cg) / len(cg)
    return math.sqrt(sum((r - mean) ** 2 for r in cg) / len(cg))


def kurtosis_at_scale(returns: list[float], n: int) -> float:
    """Excess kurtosis of coarse-grained returns at scale n."""
    cg = coarse_grain(returns, n)
    if len(cg) < 4:
        return 0.0
    mean = sum(cg) / len(cg)
    std = math.sqrt(sum((r - mean) ** 2 for r in cg) / len(cg))
    if std == 0:
        return 0.0
    return sum(((r - mean) / std) ** 4 for r in cg) / len(cg) - 3


def autocorrelation(returns: list[float], lag: int) -> float:
    """Autocorrelation at lag k."""
    n = len(returns)
    if n < lag + 2:
        return 0.0
    mean = sum(returns) / n
    cov = 0.0
    var0 = 0.0
    var_lag = 0.0
    for i in range(n - lag):
        cov += (returns[i] - mean) * (returns[i + lag] - mean)
        var0 += (returns[i] - mean) ** 2
        var_lag += (returns[i + lag] - mean) ** 2
    return cov / math.sqrt(var0 * var_lag) if var0 > 0 and var_lag > 0 else 0.0


def scaling_exponent(scales: list[float], values: list[float]) -> float:
    """Scaling exponent via log-log regression."""
    log_s = [math.log(s) for s in scales]
    log_v = [math.log(max(1e-10, v)) for v in values]
    n = len(log_s)
    mean_x = sum(log_s) / n
    mean_y = sum(log_v) / n
    num = sum((log_s[i] - mean_x) * (log_v[i] - mean_y) for i in range(n))
    den = sum((log_s[i] - mean_x) ** 2 for i in range(n))
    return num / den if den > 0 else 0.0


def correlation_length(returns: list[float]) -> int:
    """Correlation length: first lag where |AC| < decay threshold."""
    for lag in range(1, CORR_LAG_MAX):
        ac = abs(autocorrelation(returns, lag))
        if ac < CORR_DECAY_THRESHOLD:
            return lag
    return CORR_LAG_MAX


def rg_signal(max_kurt_delta: float, vol_scaling: float) -> tuple[str, str]:
    """Signal from kurtosis change and volatility scaling exponent."""
    if max_kurt_delta > PHASE_TRANSITION_KURT:
        return "PHASE_TRANSITION", f"Large kurtosis change (Δκ={max_kurt_delta:.2f}) — possible phase transition"
    if vol_scaling < 0.45:
        return "SUBDIFFUSIVE", f"Vol scaling exponent κ = {vol_scaling:.3f} < 0.5 (sub-diffusive, mean-reverting)"
    if vol_scaling > 0.55:
        return "SUPERDIFFUSIVE", f"Vol scaling exponent κ = {vol_scaling:.3f} > 0.5 (super-diffusive, trending)"
    return "NORMAL", f"Vol scaling exponent κ = {vol_scaling:.3f} ≈ 0.5 (diffusive, efficient market)"


def rg_analysis(
    prices: list[float],
    max_scale: int = DEFAULT_MAX_SCALE,
    lookback: int = DEFAULT_LOOKBACK,
) -> RgResult | None:
    """Full Renormalization Group analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)

    # Multi-scale analysis
    scales = []
    for n in range(1, max_scale + 1):
        vol = volatility_at_scale(returns, n)
        kurt = kurtosis_at_scale(returns, n)
        ac1 = autocorrelation(coarse_grain(returns, n), 1)
        scales.append({"n": n, "vol": vol, "kurt": kurt, "ac1": ac1})

    # Scaling exponents
    vol_scaling = scaling_exponent([s["n"] for s in scales], [s["vol"] for s in scales])
    kurt_filtered = [s for s in scales if s["kurt"] > 0]
    kurt_scaling = (
        scaling_exponent([s["n"] for s in kurt_filtered], [s["kurt"] for s in kurt_filtered])
        if kurt_filtered
        else 0.0
    )

    # Correlation length at different scales
    corr_lengths = []
    for n in range(1, min(10, max_scale) + 1):
        cg = coarse_grain(returns, n)
        corr_lengths.append({"n": n, "xi": correlation_length(cg)})

    # RG flow: coupling strength (volatility) vs scale
    rg_flow = [{"scale": s["n"], "g": s["vol"] / math.sqrt(s["n"])} for s in scales]

    # Fixed point detection: where dg/dln(λ) ≈ 0
    fixed_points = []
    for i in range(1, len(rg_flow) - 1):
        dg_prev = rg_flow[i]["g"] - rg_flow[i - 1]["g"]
        dg_next = rg_flow[i + 1]["g"] - rg_flow[i]["g"]
        if abs(dg_prev) < FIXED_POINT_TOL and abs(dg_next) < FIXED_POINT_TOL:
            fixed_points.append(rg_flow[i])

    # Phase transition detection: sudden change in kurtosis
    kurt_changes = []
    for i in range(1, len(scales)):
        delta = abs(scales[i]["kurt"] - scales[i - 1]["kurt"])
        kurt_changes.append({"scale": scales[i]["n"], "delta": delta})
    max_kurt_change = max(kurt_changes, key=lambda k: k["delta"]) if kurt_changes else {"scale": 0, "delta": 0.0}

    # Current correlation length
    current_xi = corr_lengths[0]["xi"] if corr_lengths else 0

    signal, reason = rg_signal(max_kurt_change["delta"], vol_scaling)

    # Scale-invariant regime check
    is_scale_invariant = abs(vol_scaling - 0.5) < 0.05 and len(fixed_points) > 0

    return RgResult(
        scales=scales,
        vol_scaling=vol_scaling,
        kurt_scaling=kurt_scaling,
        corr_lengths=corr_lengths,
        rg_flow=rg_flow,
        fixed_points=fixed_points,
        max_kurt_change=max_kurt_change,
        current_xi=current_xi,
        signal=signal,
        reason=reason,
        is_scale_invariant=is_scale_invariant,
    )
