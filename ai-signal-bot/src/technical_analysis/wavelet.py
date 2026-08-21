"""Wavelet Decomposition (Multi-Resolution Analysis) for price series.

Implements discrete wavelet transforms with Haar (D2) and Daubechies D4
wavelets, decomposing a price series into trend + detail components at
multiple scales.

    Haar:      scaling phi(t) = 1 on [0,1), wavelet psi(t) = 1 on [0,1/2), -1 on [1/2,1)
    Daubechies D4: h = [(1+sqrt3)/4sqrt2, (3+sqrt3)/4sqrt2, (3-sqrt3)/4sqrt2, (1-sqrt3)/4sqrt2]

    DWT:  c[j] = sum_k h[k] * s[2j+k],  d[j] = sum_k g[k] * s[2j+k]
    IDWT: s[2j+k] += h[k]*c[j] + g[k]*d[j]

MRA reconstruction: price = trend(J) + details(1..J).
Denoising via soft thresholding of detail coefficients.
SNR signal: BUY/SELL when trend is clear (SNR > 3 dB), HOLD when noisy (SNR < 1 dB).

Ported from UI-only WaveletDecomposition.jsx into trading logic.
Reference: future_development.md §0.1 — high priority model.
"""
from __future__ import annotations

import math

HAAR_H = [1 / math.sqrt(2), 1 / math.sqrt(2)]
HAAR_G = [1 / math.sqrt(2), -1 / math.sqrt(2)]

SQRT3 = math.sqrt(3)
DB4_H = [
    (1 + SQRT3) / (4 * math.sqrt(2)),
    (3 + SQRT3) / (4 * math.sqrt(2)),
    (3 - SQRT3) / (4 * math.sqrt(2)),
    (1 - SQRT3) / (4 * math.sqrt(2)),
]
DB4_G = [DB4_H[3], -DB4_H[2], DB4_H[1], -DB4_H[0]]

MIN_SIGNAL = 16
COMPONENT_COLORS = ["#f0b90b", "#0ecb81", "#f6465d", "#a855f7", "#ec4899"]


class WaveletResult:
    """Container for wavelet decomposition analysis results."""

    def __init__(
        self,
        prices: list[float],
        components: list[dict],
        variances: list[float],
        energy_pct: list[float],
        denoised_signal: list[float],
        signal: str,
        reason: str,
        snr: float,
        current_price: float,
        denoised_price: float,
        levels: int,
        wavelet: str,
    ) -> None:
        self.prices = prices
        self.components = components
        self.variances = variances
        self.energy_pct = energy_pct
        self.denoised_signal = denoised_signal
        self.signal = signal
        self.reason = reason
        self.snr = snr
        self.current_price = current_price
        self.denoised_price = denoised_price
        self.levels = levels
        self.wavelet = wavelet


def _filters(wavelet: str) -> tuple[list[float], list[float]]:
    """Return (h, g) filter pair for the requested wavelet."""
    if wavelet == "db4":
        return DB4_H, DB4_G
    return HAAR_H, HAAR_G


def dwt(signal: list[float], wavelet: str = "haar") -> tuple[list[float], list[float]]:
    """Single-level discrete wavelet transform (periodic convolution)."""
    h, g = _filters(wavelet)
    lh = len(h)
    n = len(signal)
    n2 = n // 2
    approx = [0.0] * n2
    detail = [0.0] * n2
    for i in range(n2):
        for j in range(lh):
            idx = (2 * i + j) % n
            approx[i] += h[j] * signal[idx]
            detail[i] += g[j] * signal[idx]
    return approx, detail


def idwt(approx: list[float], detail: list[float], wavelet: str = "haar") -> list[float]:
    """Single-level inverse discrete wavelet transform."""
    h, g = _filters(wavelet)
    lh = len(h)
    n2 = len(approx)
    n = n2 * 2
    signal = [0.0] * n
    for i in range(n2):
        for j in range(lh):
            idx = (2 * i + j) % n
            signal[idx] += h[j] * approx[i] + g[j] * detail[i]
    return signal


def wavelet_decompose(
    signal: list[float],
    levels: int,
    wavelet: str = "haar",
) -> dict:
    """Multi-level wavelet decomposition: approx + list of detail levels."""
    max_levels = math.floor(math.log2(len(signal)))
    j = min(levels, max_levels)
    details: list[list[float]] = []
    current = signal[:]
    for _ in range(j):
        approx, detail = dwt(current, wavelet)
        details.append(detail)
        current = approx
        if len(current) < 2:
            break
    return {"approx": current, "details": details, "levels": len(details)}


def mra_reconstruct(decomp: dict, original_length: int, wavelet: str = "haar") -> list[dict]:
    """MRA reconstruction: trend + per-level detail components at full resolution."""
    approx = decomp["approx"]
    details = decomp["details"]
    levels = decomp["levels"]
    components: list[dict] = []

    trend = approx[:]
    for _ in range(levels - 1, -1, -1):
        trend = idwt(trend, [0.0] * len(trend), wavelet)
    while len(trend) < original_length:
        trend.append(trend[-1] if trend else 0.0)
    components.append({"name": "Trend", "data": trend[:original_length], "color": "#06b6d4"})

    for level in range(levels):
        current_approx = [0.0] * len(details[level])
        current_detail = details[level][:]
        for l in range(levels - 1, -1, -1):
            if l == level:
                current_approx = [0.0] * len(current_detail)
                recon = idwt(current_approx, current_detail, wavelet)
                current_approx = recon
                current_detail = [0.0] * len(recon)
            else:
                current_approx = idwt(current_approx, [0.0] * len(current_approx), wavelet)
        while len(current_approx) < original_length:
            current_approx.append(current_approx[-1] if current_approx else 0.0)
        components.append(
            {
                "name": f"D{level + 1}",
                "data": current_approx[:original_length],
                "color": COMPONENT_COLORS[level % len(COMPONENT_COLORS)],
            }
        )

    return components


def wavelet_variance(decomp: dict) -> list[float]:
    """Variance (energy) at each scale, including the final approximation."""
    variances = [_variance(d) for d in decomp["details"]]
    variances.append(_variance(decomp["approx"]))
    return variances


def _variance(values: list[float]) -> float:
    """Sample variance of a coefficient series."""
    if not values:
        return 0.0
    mean = sum(values) / len(values)
    return sum((v - mean) ** 2 for v in values) / len(values)


def denoise(decomp: dict, threshold: float, wavelet: str = "haar") -> dict:
    """Soft-threshold detail coefficients: |v| < t -> 0, else v*(1 - t/|v|)."""
    new_details = [
        [0.0 if abs(v) < threshold else v * (1 - threshold / abs(v)) for v in d]
        for d in decomp["details"]
    ]
    return {"approx": decomp["approx"], "details": new_details, "levels": decomp["levels"]}


def reconstruct(decomp: dict, wavelet: str = "haar") -> list[float]:
    """Reconstruct the full signal from a decomposition."""
    current = decomp["approx"][:]
    for l in range(decomp["levels"] - 1, -1, -1):
        current = idwt(current, decomp["details"][l], wavelet)
    return current


def wavelet_signal(trend_slope: float, snr: float) -> tuple[str, str]:
    """Trading signal from trend slope and signal-to-noise ratio."""
    if trend_slope > 0 and snr > 3:
        return "BUY", f"Trend up, SNR={snr:.1f}dB (low noise)"
    if trend_slope < 0 and snr > 3:
        return "SELL", f"Trend down, SNR={snr:.1f}dB (low noise)"
    if snr < 1:
        return "HOLD", f"High noise (SNR={snr:.1f}dB), trend unclear"
    direction = "up" if trend_slope > 0 else "down"
    return "NEUTRAL", f"Marginal: trend={direction}, SNR={snr:.1f}dB"


def wavelet_analysis(
    prices: list[float],
    levels: int = 4,
    wavelet: str = "haar",
    threshold: float = 0.0,
) -> WaveletResult | None:
    """Full wavelet MRA analysis of a price series. None if fewer than 16 prices."""
    if not prices or len(prices) < MIN_SIGNAL:
        return None

    next_pow2 = 2 ** math.ceil(math.log2(len(prices)))
    padded = prices[:]
    last = prices[-1]
    while len(padded) < next_pow2:
        padded.append(last)

    decomp = wavelet_decompose(padded, levels, wavelet)
    components = mra_reconstruct(decomp, len(prices), wavelet)
    variances = wavelet_variance(decomp)

    denoised = denoise(decomp, threshold, wavelet) if threshold > 0 else decomp
    reconstructed = reconstruct(denoised, wavelet)
    denoised_signal = reconstructed[: len(prices)]

    total_var = sum(variances) + 1e-10
    energy_pct = [v / total_var * 100 for v in variances]

    trend_data = components[0]["data"]
    trend_slope = trend_data[-1] - trend_data[-2] if len(trend_data) > 1 else 0.0
    detail_energy = sum(variances[:-1])
    trend_energy = variances[-1]
    snr = 10 * math.log10(trend_energy / detail_energy) if detail_energy > 0 else 999.0

    signal, reason = wavelet_signal(trend_slope, snr)
    return WaveletResult(
        prices=prices,
        components=components,
        variances=variances,
        energy_pct=energy_pct,
        denoised_signal=denoised_signal,
        signal=signal,
        reason=reason,
        snr=snr,
        current_price=prices[-1],
        denoised_price=denoised_signal[-1],
        levels=levels,
        wavelet=wavelet,
    )
