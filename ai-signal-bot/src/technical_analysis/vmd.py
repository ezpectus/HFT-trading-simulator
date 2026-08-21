"""Variational Mode Decomposition (VMD).

Non-recursive signal decomposition into K modes with compact spectral
support, solved via ADMM (Alternating Direction Method of Multipliers).
"""
from __future__ import annotations

import cmath
import math

MIN_PRICES = 32
DEFAULT_K = 4
DEFAULT_ALPHA = 2000.0
DEFAULT_TOL = 1e-6
DEFAULT_MAX_ITER = 100


class VMDResult:
    """Container for VMD decomposition results."""

    def __init__(
        self,
        modes: list[dict],
        residual: list[float],
        energies: list[float],
        energy_pct: list[float],
        center_freqs: list[float],
        omega_history: list[list[float]],
        n_iter: int,
        signal: list[float],
        dominant_mode: int,
        trend_idx: int,
        sig_dir: str,
        reason: str,
        n: int,
    ) -> None:
        self.modes = modes
        self.residual = residual
        self.energies = energies
        self.energy_pct = energy_pct
        self.center_freqs = center_freqs
        self.omega_history = omega_history
        self.n_iter = n_iter
        self.signal = signal
        self.dominant_mode = dominant_mode
        self.trend_idx = trend_idx
        self.sig_dir = sig_dir
        self.reason = reason
        self.n = n


def _fft(signal: list[float]) -> list[complex]:
    """Cooley-Tukey radix-2 FFT with zero padding."""
    n = len(signal)
    if n <= 1:
        return [complex(v, 0) for v in signal]

    n2 = 2 ** math.ceil(math.log2(n))
    x = [complex(signal[i], 0) if i < n else 0j for i in range(n2)]

    j = 0
    for i in range(1, n2):
        bit = n2 >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j ^= bit
        if i < j:
            x[i], x[j] = x[j], x[i]

    length = 2
    while length <= n2:
        half = length >> 1
        angle = -2 * math.pi / length
        w_re = math.cos(angle)
        w_im = math.sin(angle)
        for i in range(0, n2, length):
            cur_re = 1.0
            cur_im = 0.0
            for k in range(half):
                t = cur_re * x[i + k + half].real - cur_im * x[i + k + half].imag
                t_im = cur_re * x[i + k + half].imag + cur_im * x[i + k + half].real
                x[i + k + half] = complex(x[i + k].real - t, x[i + k].imag - t_im)
                x[i + k] = complex(x[i + k].real + t, x[i + k].imag + t_im)
                new_re = cur_re * w_re - cur_im * w_im
                cur_im = cur_re * w_im + cur_im * w_re
                cur_re = new_re
        length <<= 1

    return x


def _ifft(spectrum: list[complex]) -> list[float]:
    """Inverse FFT via direct DFT (mirrors UI for moderate sizes)."""
    n = len(spectrum)
    time = [0.0] * n
    for idx in range(n):
        total = 0.0
        for k in range(n):
            angle = 2 * math.pi * k * idx / n
            total += spectrum[k].real * math.cos(angle) - spectrum[k].imag * math.sin(angle)
        time[idx] = total / n
    return time


def vmd(
    signal: list[float],
    k: int,
    alpha: float = DEFAULT_ALPHA,
    tau: float = 0.0,
    dc: bool = False,
    tol: float = DEFAULT_TOL,
    max_iter: int = DEFAULT_MAX_ITER,
) -> dict:
    """Variational Mode Decomposition via ADMM."""
    n = len(signal)
    f = list(reversed(signal)) + signal + list(reversed(signal))
    n_ext = len(f)
    f_hat = _fft(f)

    u_hat = [[0j] * n_ext for _ in range(k)]
    omega = [0.5 * (k_idx + 1) / k for k_idx in range(k)]
    if dc:
        omega[0] = 0.0
    lambda_hat = [0j] * n_ext

    u_hat_prev = [row[:] for row in u_hat]
    omega_history = [omega[:]]

    for _ in range(max_iter):
        for k_idx in range(k):
            sum_other = [0j] * n_ext
            for l in range(k):
                if l == k_idx:
                    continue
                for i in range(n_ext):
                    sum_other[i] += u_hat[l][i]

            for i in range(n_ext):
                freq_idx = i if i < n_ext / 2 else i - n_ext
                w = freq_idx / n_ext
                numerator = f_hat[i] - sum_other[i] + lambda_hat[i] / 2
                denom = 1 + 2 * alpha * (w - omega[k_idx]) ** 2
                u_hat[k_idx][i] = numerator / denom

            if not dc or k_idx > 0:
                num = 0.0
                den = 0.0
                for i in range(n_ext):
                    w = i / n_ext if i < n_ext / 2 else (i - n_ext) / n_ext
                    mag2 = abs(u_hat[k_idx][i]) ** 2
                    num += w * mag2
                    den += mag2
                if den > 0:
                    omega[k_idx] = num / den

        for i in range(n_ext):
            total = sum(u_hat[k_idx][i] for k_idx in range(k))
            lambda_hat[i] = lambda_hat[i] + tau * (f_hat[i] - total)

        convergence = 0.0
        for k_idx in range(k):
            for i in range(n_ext):
                diff = u_hat[k_idx][i].real - u_hat_prev[k_idx][i].real
                convergence += diff * diff
        convergence /= n_ext

        omega_history.append(omega[:])
        if convergence < tol:
            break

        u_hat_prev = [row[:] for row in u_hat]

    modes: list[dict] = []
    for k_idx in range(k):
        time_signal = _ifft(u_hat[k_idx])
        start = n
        modes.append(
            {
                "signal": time_signal[start : start + n],
                "center_freq": omega[k_idx],
                "spectrum": [abs(u_hat[k_idx][i]) for i in range(n_ext // 2)],
            }
        )

    reconstructed = [0.0] * n
    for mode in modes:
        for i in range(n):
            reconstructed[i] += mode["signal"][i]
    residual = [signal[i] - reconstructed[i] for i in range(n)]

    energies = []
    for mode in modes:
        mean = sum(mode["signal"]) / len(mode["signal"])
        energies.append(sum((v - mean) ** 2 for v in mode["signal"]) / len(mode["signal"]))
    total_energy = sum(energies) + 1e-10

    return {
        "modes": modes,
        "residual": residual,
        "energies": energies,
        "energy_pct": [e / total_energy * 100 for e in energies],
        "center_freqs": omega,
        "omega_history": omega_history,
        "n_iter": len(omega_history),
    }


def vmd_signal(trend_slope: float, dom_last: float) -> tuple[str, str]:
    """Trading signal from trend mode slope and dominant mode value."""
    if trend_slope > 0 and dom_last > 0:
        return "BUY", "Trend up + dominant mode positive"
    if trend_slope < 0 and dom_last < 0:
        return "SELL", "Trend down + dominant mode negative"
    direction = "up" if trend_slope > 0 else "down"
    sign = "+" if dom_last > 0 else "-"
    return "NEUTRAL", f"Trend: {direction}, dominant: {sign}"


def vmd_analysis(
    prices: list[float],
    k: int = DEFAULT_K,
    alpha: float = DEFAULT_ALPHA,
    max_iter: int = DEFAULT_MAX_ITER,
) -> VMDResult | None:
    """Full VMD analysis of a price series. None if insufficient data."""
    if not prices or len(prices) < MIN_PRICES:
        return None

    n = min(128, len(prices))
    signal = prices[-n:]
    mean = sum(signal) / n
    detrended = [s - mean for s in signal]

    result = vmd(detrended, k, alpha, 0.0, False, DEFAULT_TOL, max_iter)

    dominant_mode = max(range(k), key=lambda i: result["energies"][i])
    dom_signal = result["modes"][dominant_mode]["signal"]
    dom_slope = dom_signal[-1] - dom_signal[-2] if len(dom_signal) > 1 else 0.0

    trend_idx = min(range(k), key=lambda i: result["center_freqs"][i])
    trend_signal = result["modes"][trend_idx]["signal"]
    trend_slope = trend_signal[-1] - trend_signal[-2] if len(trend_signal) > 1 else 0.0

    sig_dir, reason = vmd_signal(trend_slope, dom_signal[-1])
    reason += f" (freq={result['center_freqs'][dominant_mode]:.4f})"

    return VMDResult(
        modes=result["modes"],
        residual=result["residual"],
        energies=result["energies"],
        energy_pct=result["energy_pct"],
        center_freqs=result["center_freqs"],
        omega_history=result["omega_history"],
        n_iter=result["n_iter"],
        signal=signal,
        dominant_mode=dominant_mode,
        trend_idx=trend_idx,
        sig_dir=sig_dir,
        reason=reason,
        n=n,
    )
