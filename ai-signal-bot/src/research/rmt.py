"""Random Matrix Theory (RMT) for noise filtering of correlation matrices.

Applies the Marchenko-Pastur law to filter noise from empirical correlation
matrices. Eigenvalues within the MP bound are noise; those outside contain
genuine information.
"""
from __future__ import annotations

import math


MIN_SYMBOLS = 3


class RMTResult:
    """Container for Random Matrix Theory analysis results."""

    def __init__(
        self,
        symbols: list[str],
        n: int,
        t: int,
        q: float,
        eigenvalues: list[float],
        eigenvectors: list[list[float]],
        lambda_min: float,
        lambda_max: float,
        mp_curve: list[dict],
        cleaned_eigs: list[float],
        noise_count: int,
        signal_count: int,
        signal_eigs: list[float],
        market_mode: list[float],
        corr: list[list[float]],
        cleaned_corr: list[list[float]],
        signal: str,
        reason: str,
    ) -> None:
        self.symbols = symbols
        self.n = n
        self.t = t
        self.q = q
        self.eigenvalues = eigenvalues
        self.eigenvectors = eigenvectors
        self.lambda_min = lambda_min
        self.lambda_max = lambda_max
        self.mp_curve = mp_curve
        self.cleaned_eigs = cleaned_eigs
        self.noise_count = noise_count
        self.signal_count = signal_count
        self.signal_eigs = signal_eigs
        self.market_mode = market_mode
        self.corr = corr
        self.cleaned_corr = cleaned_corr
        self.signal = signal
        self.reason = reason


def jacobi_eig(a: list[list[float]], max_iter: int = 100, tol: float = 1e-10) -> dict:
    """Jacobi eigendecomposition for symmetric matrices."""
    n = len(a)
    v = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    d = [row[:] for row in a]

    for _ in range(max_iter):
        max_val = 0.0
        p = 0
        q = 0
        for i in range(n):
            for j in range(i + 1, n):
                if abs(d[i][j]) > max_val:
                    max_val = abs(d[i][j])
                    p = i
                    q = j
        if max_val < tol:
            break

        theta = (d[q][q] - d[p][p]) / (2 * d[p][q])
        t = math.copysign(1.0, theta) * (abs(theta) + math.sqrt(theta * theta + 1))
        c = 1 / math.sqrt(t * t + 1)
        s = t * c

        for i in range(n):
            dip = d[i][p]
            diq = d[i][q]
            d[i][p] = c * dip - s * diq
            d[i][q] = s * dip + c * diq
        for j in range(n):
            dpj = d[p][j]
            dqj = d[q][j]
            d[p][j] = c * dpj - s * dqj
            d[q][j] = s * dpj + c * dqj
        d[p][q] = 0.0
        d[q][p] = 0.0
        for i in range(n):
            vip = v[i][p]
            viq = v[i][q]
            v[i][p] = c * vip - s * viq
            v[i][q] = s * vip + c * viq

    return {"eigenvalues": [d[i][i] for i in range(n)], "eigenvectors": v}


def mp_bounds(q: float) -> dict:
    """Marchenko-Pastur eigenvalue bounds."""
    return {
        "lambda_min": (1 / math.sqrt(q) - 1) ** 2,
        "lambda_max": (1 / math.sqrt(q) + 1) ** 2,
    }


def mp_density(lambda_: float, q: float) -> float:
    """Marchenko-Pastur density."""
    bounds = mp_bounds(q)
    if lambda_ < bounds["lambda_min"] or lambda_ > bounds["lambda_max"]:
        return 0.0
    q_val = q / (2 * math.pi)
    return q_val * math.sqrt((bounds["lambda_max"] - lambda_) * (lambda_ - bounds["lambda_min"])) / lambda_


def _correlation_matrix(returns_list: list[list[float]]) -> list[list[float]]:
    """Pearson correlation matrix from multiple return series."""
    n = len(returns_list)
    t = len(returns_list[0])
    corr = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            mi = sum(returns_list[i]) / t
            mj = sum(returns_list[j]) / t
            cov = 0.0
            vi = 0.0
            vj = 0.0
            for k in range(t):
                di = returns_list[i][k] - mi
                dj = returns_list[j][k] - mj
                cov += di * dj
                vi += di * di
                vj += dj * dj
            corr[i][j] = cov / math.sqrt(vi * vj) if vi > 0 and vj > 0 else 0.0
    return corr


def clean_correlation(eigenvalues: list[float], eigenvectors: list[list[float]], q: float) -> dict:
    """Replace noise eigenvalues with average; reconstruct cleaned matrix."""
    n = len(eigenvalues)
    bounds = mp_bounds(q)
    lambda_min = bounds["lambda_min"]
    lambda_max = bounds["lambda_max"]

    cleaned = eigenvalues[:]
    noise_count = 0
    noise_sum = 0.0
    for i in range(n):
        if lambda_min <= eigenvalues[i] <= lambda_max:
            noise_count += 1
            noise_sum += eigenvalues[i]

    noise_avg = noise_sum / noise_count if noise_count > 0 else 0.0
    for i in range(n):
        if lambda_min <= eigenvalues[i] <= lambda_max:
            cleaned[i] = noise_avg

    c_clean = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            c_clean[i][j] = sum(eigenvectors[i][k] * cleaned[k] * eigenvectors[j][k] for k in range(n))

    for i in range(n):
        diag = math.sqrt(c_clean[i][i])
        if diag > 0:
            for j in range(n):
                c_clean[i][j] /= diag
                c_clean[j][i] /= diag

    return {"Cclean": c_clean, "cleaned": cleaned, "noise_count": noise_count, "signal_count": n - noise_count}


def rmt_signal(signal_eigs: list[float], lambda_max: float) -> tuple[str, str]:
    """Signal from signal eigenvalues vs MP bound."""
    if signal_eigs:
        strongest = signal_eigs[0]
        if strongest > lambda_max * 2:
            return "STRONG_SIGNAL", (
                f"{len(signal_eigs)} signal eigenvalues (max λ={strongest:.3f} > λ₊={lambda_max:.3f})"
            )
        return "WEAK_SIGNAL", (
            f"{len(signal_eigs)} signal eigenvalues (max λ={strongest:.3f}, λ₊={lambda_max:.3f})"
        )
    return "PURE_NOISE", (
        f"All eigenvalues within MP bounds — no genuine correlations"
    )


def rmt_analysis(
    returns_list: list[list[float]],
    symbols: list[str] | None = None,
) -> RMTResult | None:
    """Full RMT analysis of return series. None if fewer than 3 series."""
    if not returns_list or len(returns_list) < MIN_SYMBOLS:
        return None

    n = len(returns_list)
    t = len(returns_list[0])
    q = t / n
    if symbols is None:
        symbols = [f"asset_{i}" for i in range(n)]

    corr = _correlation_matrix(returns_list)
    eig = jacobi_eig(corr)

    sorted_idx = sorted(range(n), key=lambda i: eig["eigenvalues"][i], reverse=True)
    sorted_eig = [eig["eigenvalues"][i] for i in sorted_idx]
    sorted_vec = [[eig["eigenvectors"][row][i] for row in range(n)] for i in sorted_idx]

    bounds = mp_bounds(q)
    lambda_min = bounds["lambda_min"]
    lambda_max = bounds["lambda_max"]

    mp_curve = []
    start = max(0.01, lambda_min - 0.1)
    stop = lambda_max + 0.1
    step = 0.01
    value = start
    while value <= stop + 1e-12:
        mp_curve.append({"lambda": value, "density": mp_density(value, q)})
        value += step

    clean_result = clean_correlation(eig["eigenvalues"], eig["eigenvectors"], q)

    signal_eigs = [l for l in sorted_eig if l > lambda_max or l < lambda_min]
    market_mode = sorted_vec[0]

    signal, reason = rmt_signal(signal_eigs, lambda_max)

    return RMTResult(
        symbols=symbols,
        n=n,
        t=t,
        q=q,
        eigenvalues=sorted_eig,
        eigenvectors=sorted_vec,
        lambda_min=lambda_min,
        lambda_max=lambda_max,
        mp_curve=mp_curve,
        cleaned_eigs=clean_result["cleaned"],
        noise_count=clean_result["noise_count"],
        signal_count=clean_result["signal_count"],
        signal_eigs=signal_eigs,
        market_mode=market_mode,
        corr=corr,
        cleaned_corr=clean_result["Cclean"],
        signal=signal,
        reason=reason,
    )
