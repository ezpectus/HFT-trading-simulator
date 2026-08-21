"""Compressed Sensing (Sparse Signal Recovery).

Recovers sparse signals from undersampled observations via L1 minimization
and greedy pursuit.

    Measurement model: y = Phi * x   (Phi: m x n, m < n)
    Recovery: min ||x||_1  s.t.  Phi*x = y
    Guarantee: m >= C * k * log(n/k)  (RIP)

    OMP (Orthogonal Matching Pursuit):
    1. Find column of Phi most correlated with residual
    2. Add to support set
    3. Solve least squares on support
    4. Update residual

    ISTA (Iterative Shrinkage-Thresholding):
    x <- soft_threshold(x - step * Phi^T(Phi*x - y), lambda*step)

Ported from UI-only CompressedSensing.jsx into trading logic.
Reference: future_development.md §0.2 — medium priority model.
"""
from __future__ import annotations

import math
import random

MIN_PRICES = 16
DEFAULT_SPARSITY = 5
DEFAULT_SAMPLE_RATIO = 0.5
DEFAULT_LAMBDA = 0.01
DEFAULT_LOOKBACK = 64
DEFAULT_METHOD = "omp"
ANOMALY_COEFF = 0.3
SUPPORT_COEFF = 0.01


class CompressedSensingResult:
    """Container for compressed sensing analysis results."""

    def __init__(
        self,
        signal: list[float],
        sparse_coeffs: list[float],
        recovered: list[float],
        recon_signal: list[float],
        mse: float,
        snr: float,
        support: list[dict],
        anomalies: list[dict],
        actual_sparsity: int,
        n: int,
        m: int,
        sig: str,
        reason: str,
    ) -> None:
        self.signal = signal
        self.sparse_coeffs = sparse_coeffs
        self.recovered = recovered
        self.recon_signal = recon_signal
        self.mse = mse
        self.snr = snr
        self.support = support
        self.anomalies = anomalies
        self.actual_sparsity = actual_sparsity
        self.n = n
        self.m = m
        self.sig = sig
        self.reason = reason


def measurement_matrix(m: int, n: int, seed: int | None = None) -> list[list[float]]:
    """Random Gaussian measurement matrix (seeded)."""
    rng = random.Random(seed)
    return [[(rng.random() - 0.5) * math.sqrt(2 / m) for _ in range(n)] for _ in range(m)]


def _mat_vec(a: list[list[float]], x: list[float]) -> list[float]:
    """Matrix-vector product."""
    return [sum(a[i][j] * x[j] for j in range(len(x))) for i in range(len(a))]


def _mat_t_vec(a: list[list[float]], x: list[float]) -> list[float]:
    """Transpose matrix-vector product."""
    n = len(a[0])
    result = [0.0] * n
    for i in range(len(a)):
        for j in range(n):
            result[j] += a[i][j] * x[i]
    return result


def _least_squares(a: list[list[float]], b: list[float]) -> list[float]:
    """Least squares via normal equations + Gaussian elimination."""
    m = len(a)
    n = len(a[0])
    ata = [[0.0] * n for _ in range(n)]
    atb = [0.0] * n
    for i in range(n):
        for j in range(n):
            ata[i][j] = sum(a[k][i] * a[k][j] for k in range(m))
        atb[i] = sum(a[k][i] * b[k] for k in range(m))

    aug = [ata[i] + [atb[i]] for i in range(n)]
    for col in range(n):
        max_row = col
        for r in range(col + 1, n):
            if abs(aug[r][col]) > abs(aug[max_row][col]):
                max_row = r
        aug[col], aug[max_row] = aug[max_row], aug[col]
        if abs(aug[col][col]) < 1e-10:
            continue
        for r in range(col + 1, n):
            factor = aug[r][col] / aug[col][col]
            for c in range(col, n + 1):
                aug[r][c] -= factor * aug[col][c]

    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = aug[i][n]
        for j in range(i + 1, n):
            x[i] -= aug[i][j] * x[j]
        x[i] /= aug[i][i] if abs(aug[i][i]) > 1e-10 else 1.0
    return x


def omp(phi: list[list[float]], y: list[float], sparsity: int) -> dict:
    """Orthogonal Matching Pursuit greedy recovery."""
    m = len(phi)
    n = len(phi[0])
    support: list[int] = []
    residual = y[:]
    x = [0.0] * n

    for _ in range(sparsity):
        max_corr = 0.0
        max_idx = 0
        for j in range(n):
            if j in support:
                continue
            corr = sum(phi[i][j] * residual[i] for i in range(m))
            if abs(corr) > abs(max_corr):
                max_corr = corr
                max_idx = j
        support.append(max_idx)

        phi_s = [[row[j] for j in support] for row in phi]
        x_s = _least_squares(phi_s, y)
        recon = _mat_vec(phi_s, x_s)
        for i in range(m):
            residual[i] = y[i] - recon[i]

        for i, idx in enumerate(support):
            x[idx] = x_s[i]

    return {"x": x, "support": support, "residual": residual}


def ista(phi: list[list[float]], y: list[float], lambda_: float, max_iter: int = 100) -> list[float]:
    """Iterative Shrinkage-Thresholding Algorithm for L1 minimization."""
    m = len(phi)
    n = len(phi[0])
    max_eig = 0.0
    for j in range(n):
        col_norm = sum(phi[i][j] * phi[i][j] for i in range(m))
        if col_norm > max_eig:
            max_eig = col_norm
    step = 1 / (max_eig + 1e-10)

    x = [0.0] * n
    for _ in range(max_iter):
        phix = _mat_vec(phi, x)
        grad = _mat_t_vec(phi, [phix[i] - y[i] for i in range(m)])
        z = [x[j] - step * grad[j] for j in range(n)]
        x = [math.copysign(1.0, v) * max(0.0, abs(v) - lambda_ * step) if v != 0 else 0.0 for v in z]

    return x


def dft_basis(n: int) -> list[list[float]]:
    """DFT basis (sparsifying transform)."""
    return [
        [math.cos(2 * math.pi * i * j / n) / math.sqrt(n) for j in range(n)]
        for i in range(n)
    ]


def cs_signal(anomalies_count: int, snr: float) -> tuple[str, str]:
    """Signal from anomaly count and recovery SNR."""
    if anomalies_count > 3:
        return "ANOMALY_DETECTED", f"{anomalies_count} anomalous frequency components detected (|coeff| > 0.3)"
    if snr > 15:
        return "SPARSE_RECOVERED", f"High-quality recovery (SNR = {snr:.1f} dB)"
    if snr > 5:
        return "MODERATE_RECOVERY", f"Moderate recovery (SNR = {snr:.1f} dB)"
    return "POOR_RECOVERY", f"Poor recovery (SNR = {snr:.1f} dB) — signal not sparse enough"


def compressed_sensing_analysis(
    prices: list[float],
    sparsity: int = DEFAULT_SPARSITY,
    sample_ratio: float = DEFAULT_SAMPLE_RATIO,
    lambda_: float = DEFAULT_LAMBDA,
    lookback: int = DEFAULT_LOOKBACK,
    method: str = DEFAULT_METHOD,
    seed: int | None = None,
) -> CompressedSensingResult | None:
    """Full compressed sensing analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]
    n = len(returns)

    mean = sum(returns) / n
    std = math.sqrt(sum((r - mean) ** 2 for r in returns) / n)
    signal = [(r - mean) / std if std > 0 else 0.0 for r in returns]

    psi = dft_basis(n)
    sparse_coeffs = _mat_t_vec(psi, signal)

    actual_sparsity = sum(1 for c in sparse_coeffs if abs(c) > 0.1)

    m = int(n * sample_ratio)
    phi = measurement_matrix(m, n, seed)
    y = _mat_vec(phi, sparse_coeffs)

    if method == "omp":
        recovered = omp(phi, y, sparsity)["x"]
    else:
        recovered = ista(phi, y, lambda_, 200)

    recon_signal = _mat_vec(psi, recovered)

    error = [signal[i] - recon_signal[i] for i in range(n)]
    mse = sum(e * e for e in error) / n
    signal_energy = sum(v * v for v in signal) / n
    snr = 10 * math.log10(signal_energy / mse) if mse > 0 else math.inf

    support = sorted(
        [{"idx": i, "val": v} for i, v in enumerate(recovered) if abs(v) > SUPPORT_COEFF],
        key=lambda s: abs(s["val"]),
        reverse=True,
    )
    anomalies = [s for s in support if abs(s["val"]) > ANOMALY_COEFF]

    sig, reason = cs_signal(len(anomalies), snr)

    return CompressedSensingResult(
        signal=signal,
        sparse_coeffs=sparse_coeffs,
        recovered=recovered,
        recon_signal=recon_signal,
        mse=mse,
        snr=snr,
        support=support,
        anomalies=anomalies,
        actual_sparsity=actual_sparsity,
        n=n,
        m=m,
        sig=sig,
        reason=reason,
    )
