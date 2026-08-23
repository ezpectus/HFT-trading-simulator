"""FFT-based market cycle analysis.

Uses Fast Fourier Transform to detect dominant price cycles,
spectral density, and cyclical components in price data.

Applications:
- Detect dominant cycle periods (e.g., 20-bar, 50-bar cycles)
- Spectral analysis for trend vs range classification
- Cycle-based entry/exit timing
- Power spectrum for volatility regime detection
"""
import math

import numpy as np


def _fft(a: list[complex]) -> list[complex]:
    """FFT via numpy (replaces Cooley-Tukey radix-2)."""
    return np.fft.fft(a).tolist()


def _ifft(a: list[complex]) -> list[complex]:
    """Inverse FFT via numpy."""
    return np.fft.ifft(a).tolist()


def power_spectrum(closes: list[float]) -> tuple[list[float], list[float]]:
    """Compute power spectral density of price series.

    Returns:
        frequencies: Normalized frequencies (cycles per bar)
        power: Power at each frequency
    """
    n = len(closes)
    if n < 4:
        return [], []

    # Detrend: remove linear regression
    mean = sum(closes) / n
    detrended = [c - mean for c in closes]

    # Constant/zero-variance series: return DC-dominated spectrum
    if all(abs(d) < 1e-12 for d in detrended):
        n_fft = 1
        while n_fft < n:
            n_fft <<= 1
        half = n_fft // 2
        freqs = [i / n_fft for i in range(half)]
        power = [0.0] * half
        if power:
            power[0] = 1.0
        return freqs, power

    # Apply Hann window to reduce spectral leakage
    window = [0.5 - 0.5 * math.cos(2 * math.pi * i / (n - 1)) for i in range(n)]
    windowed = [d * w for d, w in zip(detrended, window, strict=False)]

    # Pad to power of 2
    n_fft = 1
    while n_fft < n:
        n_fft <<= 1
    padded = [complex(x, 0) for x in windowed] + [0j] * (n_fft - n)

    # FFT
    spectrum = _fft(padded)

    # Power = |X|^2, take only first half (Nyquist)
    half = n_fft // 2
    power = [abs(spectrum[i]) ** 2 for i in range(half)]
    freqs = [i / n_fft for i in range(half)]

    # Normalize power
    total_power = sum(power)
    if total_power > 0:
        power = [p / total_power for p in power]

    return freqs, power


def dominant_cycles(closes: list[float], top_n: int = 3) -> list[tuple[float, float, float]]:
    """Find dominant cycle periods in price data.

    Returns:
        List of (period_bars, strength, frequency) sorted by strength.
        period_bars: Cycle length in bars (e.g., 20 = 20-bar cycle)
        strength: Relative power (0-1)
        frequency: Cycles per bar
    """
    freqs, power = power_spectrum(closes)
    if not freqs:
        return []

    # Find peaks in power spectrum
    peaks = []
    for i in range(1, len(power) - 1):
        if power[i] > power[i - 1] and power[i] > power[i + 1] and power[i] > 0.01:
            period = 1.0 / freqs[i] if freqs[i] > 0 else 0
            if period > 2:  # Ignore very short cycles (noise)
                peaks.append((period, power[i], freqs[i]))

    # Sort by strength
    peaks.sort(key=lambda x: x[1], reverse=True)
    return peaks[:top_n]


def cycle_strength(closes: list[float]) -> float:
    """Compute overall cyclical strength (0-1).

    High values indicate strong cyclical behavior (range market).
    Low values indicate trend-dominated market.
    """
    freqs, power = power_spectrum(closes)
    if not power:
        return 0.0

    # Exclude very low frequencies (DC + long-period trend) so trend dominance
    # does not inflate the cycle-strength score.
    skip = max(2, len(power) // 10)
    if len(power) <= skip:
        skip = 0

    filtered_power = power[skip:]
    total = sum(filtered_power)
    if total <= 0:
        return 0.0

    # Renormalize so entropy is computed over the filtered distribution
    filtered_power = [p / total for p in filtered_power]

    # Spectral entropy — lower entropy = more concentrated spectrum = stronger cycles
    entropy = 0.0
    for p in filtered_power:
        if p > 0:
            entropy -= p * math.log(p)

    max_entropy = math.log(len(filtered_power)) if len(filtered_power) > 1 else 1
    if max_entropy == 0:
        return 0.0

    # Normalized entropy (0 = concentrated, 1 = uniform)
    normalized_entropy = entropy / max_entropy

    # Cycle strength = 1 - normalized_entropy
    return max(0.0, min(1.0, 1.0 - normalized_entropy))


def spectral_trend_score(closes: list[float]) -> float:
    """Classify market regime using spectral analysis.

    Returns:
        -1.0 to +1.0
        Positive = trending (low-frequency dominant)
        Negative = ranging (high-frequency dominant)
        Near 0 = mixed
    """
    freqs, power = power_spectrum(closes)
    if not power:
        return 0.0

    # Split spectrum into low-freq (trend) and high-freq (noise/cycle)
    mid = len(freqs) // 4  # First quarter = trend frequencies

    low_power = sum(power[:mid])
    high_power = sum(power[mid:])

    total = low_power + high_power
    if total == 0:
        return 0.0

    # Trend score: positive when low-freq dominates
    return (low_power - high_power) / total


def fft_filter(closes: list[float], keep_ratio: float = 0.2) -> list[float]:
    """Low-pass filter using FFT — removes high-frequency noise."""
    n = len(closes)
    if n < 4:
        return closes[:]

    mean = sum(closes) / n
    detrended = [c - mean for c in closes]

    # Pad to power of 2
    n_fft = 1
    while n_fft < n:
        n_fft <<= 1
    padded = [complex(x, 0) for x in detrended] + [0j] * (n_fft - n)

    # Forward FFT
    spectrum = _fft(padded)

    # Zero out high frequencies
    cutoff = int(n_fft * keep_ratio / 2)
    for i in range(cutoff, n_fft - cutoff):
        spectrum[i] = 0j

    # Inverse FFT
    smoothed = _ifft(spectrum)

    # Extract real part and restore mean
    result = [smoothed[i].real + mean for i in range(n)]
    return result


def fft_cycle_indicator(closes: list[float]) -> dict:
    """Complete FFT cycle analysis for trading.

    Returns dict with:
    - dominant_cycles: Top cycle periods
    - cycle_strength: 0-1 (higher = more cyclical)
    - trend_score: -1 to +1 (positive = trending)
    - smoothed_price: FFT-filtered price
    - regime: "TRENDING" | "RANGING" | "MIXED"
    """
    cycles = dominant_cycles(closes, top_n=3)
    strength = cycle_strength(closes)
    trend = spectral_trend_score(closes)
    smoothed = fft_filter(closes, keep_ratio=0.15)

    if trend > 0.3:
        regime = "TRENDING"
    elif trend < -0.2:
        regime = "RANGING"
    else:
        regime = "MIXED"

    return {
        "dominant_cycles": [(round(p, 1), round(s, 3), round(f, 5)) for p, s, f in cycles],
        "cycle_strength": round(strength, 3),
        "trend_score": round(trend, 3),
        "smoothed_price": smoothed,
        "regime": regime,
        "top_cycle_period": cycles[0][0] if cycles else 0,
    }
