"""Empirical Mode Decomposition (EMD) + Hilbert-Huang Transform (HHT).

EMD adaptively decomposes a signal into Intrinsic Mode Functions (IMFs)
via the sifting process; HHT computes instantaneous frequency/amplitude.

    IMF criteria:
    1. Number of extrema = number of zero crossings (+-1)
    2. Mean of upper/lower envelopes = 0 at every point

    Sifting:
    1. Find local maxima -> upper envelope (cubic spline)
    2. Find local minima -> lower envelope (cubic spline)
    3. mean = (upper + lower) / 2;  h = signal - mean
    4. Repeat until SD < threshold;  residue = signal - IMF

    Hilbert Transform (FFT-based): H(f) = -j*sign(f)
    Analytic signal: z(t) = x(t) + j*H[x(t)] = a(t)*e^(j*phi(t))
    Instantaneous frequency: omega(t) = d(phi)/dt

Ported from UI-only EmpiricalModeDecomposition.jsx into trading logic.
Reference: future_development.md §0.2 — medium priority model.
"""
from __future__ import annotations

import cmath
import math

MIN_PRICES = 32
DEFAULT_MAX_IMFS = 8
DEFAULT_MAX_ITER = 30
DEFAULT_SD_THRESHOLD = 0.05


class EMDResult:
    """Container for EMD/HHT analysis results."""

    def __init__(
        self,
        imfs: list[list[float]],
        residue: list[float],
        hht: list[dict],
        energies: list[float],
        mean_freqs: list[float],
        energy_pct: list[float],
        dominant_idx: int,
        sig_dir: str,
        reason: str,
        n: int,
    ) -> None:
        self.imfs = imfs
        self.residue = residue
        self.hht = hht
        self.energies = energies
        self.mean_freqs = mean_freqs
        self.energy_pct = energy_pct
        self.dominant_idx = dominant_idx
        self.sig_dir = sig_dir
        self.reason = reason
        self.n = n


def cubic_spline(x_points: list[float], y_points: list[float], x_query: float) -> float:
    """Natural cubic spline interpolation."""
    n = len(x_points)
    if n < 2:
        return y_points[0]

    sorted_pairs = sorted(zip(x_points, y_points))
    xs = [p[0] for p in sorted_pairs]
    ys = [p[1] for p in sorted_pairs]

    if n == 2:
        t = (x_query - xs[0]) / (xs[1] - xs[0])
        return ys[0] + t * (ys[1] - ys[0])

    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    alpha = [0.0] * (n - 2)
    for i in range(1, n - 1):
        alpha[i - 1] = 3 * ((ys[i + 1] - ys[i]) / h[i] - (ys[i] - ys[i - 1]) / h[i - 1])

    l = [1.0] * n
    mu = [0.0] * n
    z = [0.0] * n
    c = [0.0] * n
    b = [0.0] * (n - 1)
    d = [0.0] * (n - 1)

    for i in range(1, n - 1):
        l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1]
        mu[i] = h[i] / l[i]
        z[i] = (alpha[i - 1] - h[i - 1] * z[i - 1]) / l[i]

    for j in range(n - 2, -1, -1):
        c[j] = z[j] - mu[j] * c[j + 1]
        b[j] = (ys[j + 1] - ys[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3
        d[j] = (c[j + 1] - c[j]) / (3 * h[j])

    idx = n - 2
    for i in range(n - 1):
        if xs[i] <= x_query <= xs[i + 1]:
            idx = i
            break

    dx = x_query - xs[idx]
    return ys[idx] + b[idx] * dx + c[idx] * dx * dx + d[idx] * dx * dx * dx


def _find_maxima(signal: list[float]) -> list[dict]:
    """Local maxima with endpoint handling."""
    maxima = []
    for i in range(1, len(signal) - 1):
        if signal[i] > signal[i - 1] and signal[i] >= signal[i + 1]:
            maxima.append({"index": i, "value": signal[i]})
    if signal[0] > signal[1]:
        maxima.insert(0, {"index": 0, "value": signal[0]})
    if signal[-1] > signal[-2]:
        maxima.append({"index": len(signal) - 1, "value": signal[-1]})
    return maxima


def _find_minima(signal: list[float]) -> list[dict]:
    """Local minima with endpoint handling."""
    minima = []
    for i in range(1, len(signal) - 1):
        if signal[i] < signal[i - 1] and signal[i] <= signal[i + 1]:
            minima.append({"index": i, "value": signal[i]})
    if signal[0] < signal[1]:
        minima.insert(0, {"index": 0, "value": signal[0]})
    if signal[-1] < signal[-2]:
        minima.append({"index": len(signal) - 1, "value": signal[-1]})
    return minima


def sift(signal: list[float], max_iter: int = DEFAULT_MAX_ITER, sd_threshold: float = DEFAULT_SD_THRESHOLD) -> list[float]:
    """Sifting process extracting one IMF."""
    h = signal[:]
    prev_h = signal[:]

    for _ in range(max_iter):
        maxima = _find_maxima(h)
        minima = _find_minima(h)
        if len(maxima) < 2 or len(minima) < 2:
            break

        max_x = [m["index"] for m in maxima]
        max_y = [m["value"] for m in maxima]
        min_x = [m["index"] for m in minima]
        min_y = [m["value"] for m in minima]

        upper = [cubic_spline(max_x, max_y, i) for i in range(len(h))]
        lower = [cubic_spline(min_x, min_y, i) for i in range(len(h))]
        mean = [(upper[i] + lower[i]) / 2 for i in range(len(h))]

        h = [h[i] - mean[i] for i in range(len(h))]

        sd = sum((prev_h[i] - h[i]) ** 2 / (prev_h[i] ** 2 + 1e-10) for i in range(len(h))) / len(h)
        if sd < sd_threshold:
            break
        prev_h = h[:]

    return h


def emd(signal: list[float], max_imfs: int = DEFAULT_MAX_IMFS, max_iter: int = DEFAULT_MAX_ITER) -> dict:
    """Full EMD decomposition into IMFs + residue."""
    imfs: list[list[float]] = []
    residue = signal[:]

    for _ in range(max_imfs):
        imf = sift(residue, max_iter)
        imfs.append(imf)
        residue = [residue[i] - imf[i] for i in range(len(residue))]

        maxima = _find_maxima(residue)
        minima = _find_minima(residue)
        if len(maxima) < 2 and len(minima) < 2:
            break

    return {"imfs": imfs, "residue": residue}


def _fft(signal: list[float]) -> list[complex]:
    """Cooley-Tukey radix-2 FFT (power-of-2 input expected)."""
    n = len(signal)
    if n <= 1:
        return [complex(signal[0] if signal else 0, 0)]

    x = [complex(v, 0) for v in signal]
    j = 0
    for i in range(1, n):
        bit = n >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j ^= bit
        if i < j:
            x[i], x[j] = x[j], x[i]

    length = 2
    while length <= n:
        half = length >> 1
        angle = -2 * math.pi / length
        for i in range(0, n, length):
            for k in range(half):
                w_re = math.cos(angle * k)
                w_im = math.sin(angle * k)
                t = w_re * x[i + k + half].real - w_im * x[i + k + half].imag
                t_im = w_re * x[i + k + half].imag + w_im * x[i + k + half].real
                x[i + k + half] = complex(x[i + k].real - t, x[i + k].imag - t_im)
                x[i + k] = complex(x[i + k].real + t, x[i + k].imag + t_im)
        length <<= 1

    return x


def _ifft_direct(spectrum: list[complex], n: int) -> list[float]:
    """Direct DFT-based inverse FFT."""
    result = [0.0] * n
    for idx in range(n):
        total = 0.0
        for k in range(n):
            angle = 2 * math.pi * k * idx / n
            total += spectrum[k].real * math.cos(angle) - spectrum[k].imag * math.sin(angle)
        result[idx] = total / n
    return result


def hilbert_transform(signal: list[float]) -> dict:
    """Hilbert transform via FFT-based analytic signal."""
    n = len(signal)
    n2 = 2 ** math.ceil(math.log2(n))
    padded = signal + [0.0] * (n2 - n)

    spectrum = _fft(padded)

    for i in range(n2):
        if i == 0 or i == n2 // 2:
            continue
        if i < n2 // 2:
            re = spectrum[i].real
            im = spectrum[i].imag
            spectrum[i] = complex(im, -re)
        else:
            re = spectrum[i].real
            im = spectrum[i].imag
            spectrum[i] = complex(-im, re)

    hilbert = _ifft_direct(spectrum, n2)

    amplitude = [0.0] * n
    phase = [0.0] * n
    for i in range(n):
        real = signal[i]
        imag = hilbert[i]
        amplitude[i] = math.sqrt(real * real + imag * imag)
        phase[i] = math.atan2(imag, real)

    frequency = [0.0] * n
    for i in range(1, n):
        d_phase = phase[i] - phase[i - 1]
        if d_phase > math.pi:
            d_phase -= 2 * math.pi
        if d_phase < -math.pi:
            d_phase += 2 * math.pi
        frequency[i] = d_phase / (2 * math.pi)
    frequency[0] = frequency[1] if n > 1 else 0.0

    return {"amplitude": amplitude, "phase": phase, "frequency": frequency}


def emd_signal(trend_slope: float, dom_slope: float) -> tuple[str, str]:
    """Trading signal from trend (residue) slope and dominant IMF slope."""
    if trend_slope > 0 and dom_slope > 0:
        return "BUY", "Trend up + dominant IMF positive"
    if trend_slope < 0 and dom_slope < 0:
        return "SELL", "Trend down + dominant IMF negative"
    direction = "up" if trend_slope > 0 else "down"
    sign = "+" if dom_slope > 0 else "-"
    return "NEUTRAL", f"Trend: {direction}, IMF: {sign}"


def emd_analysis(
    prices: list[float],
    max_imfs: int = 5,
    max_iter: int = DEFAULT_MAX_ITER,
) -> EMDResult | None:
    """Full EMD/HHT analysis of a price series. None if insufficient data."""
    if not prices or len(prices) < MIN_PRICES:
        return None

    n = min(128, len(prices))
    prices = prices[-n:]
    mean = sum(prices) / n
    signal = [p - mean for p in prices]

    result = emd(signal, max_imfs, max_iter)
    imfs = result["imfs"]
    residue = result["residue"]

    hht = []
    for imf in imfs:
        if all(abs(v) < 1e-10 for v in imf):
            hht.append({"amplitude": [0.0] * n, "frequency": [0.0] * n, "phase": [0.0] * n})
        else:
            hht.append(hilbert_transform(imf))

    energies = []
    for imf in imfs:
        m = sum(imf) / len(imf)
        energies.append(sum((v - m) ** 2 for v in imf) / len(imf))
    total_energy = sum(energies) + 1e-10

    mean_freqs = []
    for h in hht:
        valid = [f for f in h["frequency"] if f > 0 and math.isfinite(f)]
        mean_freqs.append(sum(valid) / len(valid) if valid else 0.0)

    dominant_idx = max(range(len(energies)), key=lambda i: energies[i])
    dom_imf = imfs[dominant_idx]
    dom_slope = dom_imf[-1] - dom_imf[-2] if len(dom_imf) > 1 else 0.0
    trend_slope = residue[-1] - residue[-2] if len(residue) > 1 else 0.0

    sig_dir, reason = emd_signal(trend_slope, dom_slope)
    reason += f" (IMF{dominant_idx + 1})"

    return EMDResult(
        imfs=imfs,
        residue=residue,
        hht=hht,
        energies=energies,
        mean_freqs=mean_freqs,
        energy_pct=[e / total_energy * 100 for e in energies],
        dominant_idx=dominant_idx,
        sig_dir=sig_dir,
        reason=reason,
        n=n,
    )
