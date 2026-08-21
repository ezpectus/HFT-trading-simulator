"""Radon-Nikodym Derivative (likelihood ratio for regime detection).

Computes the Radon-Nikodym derivative between two probability
measures to detect regime changes via likelihood ratio analysis.
"""
from __future__ import annotations

import math

MIN_PRICES = 80
DEFAULT_LOOKBACK = 200
DEFAULT_WINDOW_SIZE = 40
GRID_POINTS = 81


class RnResult:
    """Container for Radon-Nikodym analysis results."""

    def __init__(
        self,
        comparisons: list[dict],
        current: dict,
        rn_trajectory: list[dict],
        grid: list[dict],
        mu_p: float,
        sig_p: float,
        signal: str,
        reason: str,
        kl_pq: float,
        kl_qp: float,
    ) -> None:
        self.comparisons = comparisons
        self.current = current
        self.rn_trajectory = rn_trajectory
        self.grid = grid
        self.mu_p = mu_p
        self.sig_p = sig_p
        self.signal = signal
        self.reason = reason
        self.kl_pq = kl_pq
        self.kl_qp = kl_qp


def compute_returns(prices: list[float]) -> list[float]:
    """Simple returns."""
    return [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]


def gaussian_log_lik(data: list[float], mu: float, sigma: float) -> float:
    """Gaussian log-likelihood."""
    n = len(data)
    ll = -n * 0.5 * math.log(2 * math.pi * sigma * sigma)
    for x in data:
        ll += -0.5 * ((x - mu) ** 2) / (sigma * sigma)
    return ll


def log_radon_nikodym(x: float, mu_p: float, sig_p: float, mu_q: float, sig_q: float) -> float:
    """Log Radon-Nikodym derivative for Gaussian measures."""
    term1 = math.log(sig_p / sig_q)
    term2 = 0.5 * ((x - mu_q) ** 2 / (sig_q * sig_q) - (x - mu_p) ** 2 / (sig_p * sig_p))
    return term1 + term2


def kl_divergence_gaussian(mu_p: float, sig_p: float, mu_q: float, sig_q: float) -> float:
    """KL divergence between two Gaussians."""
    return math.log(sig_q / sig_p) + (sig_p * sig_p + (mu_p - mu_q) ** 2) / (2 * sig_q * sig_q) - 0.5


def rn_analysis(
    prices: list[float],
    lookback: int = DEFAULT_LOOKBACK,
    window_size: int = DEFAULT_WINDOW_SIZE,
) -> RnResult | None:
    """Full Radon-Nikodym analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)

    n = len(returns)
    if n < window_size * 3:
        return None

    # Estimate baseline distribution (first window)
    baseline = returns[:window_size]
    mu_p = sum(baseline) / window_size
    sig_p = math.sqrt(sum((r - mu_p) ** 2 for r in baseline) / window_size)

    # Sliding window: compare each window to baseline
    comparisons = []
    step = max(3, window_size // 5)
    i = 0
    while i + window_size <= n:
        window = returns[i : i + window_size]
        mu_q = sum(window) / window_size
        sig_q = math.sqrt(sum((r - mu_q) ** 2 for r in window) / window_size)

        # Log Radon-Nikodym derivative (sum over window)
        log_rn = sum(log_radon_nikodym(x, mu_p, sig_p, mu_q, sig_q) for x in window)

        # KL divergence
        kl_pq = kl_divergence_gaussian(mu_p, sig_p, mu_q, sig_q)
        kl_qp = kl_divergence_gaussian(mu_q, sig_q, mu_p, sig_p)

        # Likelihood ratio test statistic: -2·log(L) ~ chi²(2) under H0
        lr_stat = -2 * (gaussian_log_lik(window, mu_p, sig_p) - gaussian_log_lik(window, mu_q, sig_q))
        p_value = math.exp(-lr_stat / 2)  # approximation for chi²(2)

        # Per-point RN derivative
        rn_per_point = [math.exp(log_radon_nikodym(x, mu_p, sig_p, mu_q, sig_q)) for x in window]

        comparisons.append(
            {
                "idx": i,
                "log_rn": log_rn,
                "mu_q": mu_q,
                "sig_q": sig_q,
                "kl_pq": kl_pq,
                "kl_qp": kl_qp,
                "kl_sym": (kl_pq + kl_qp) / 2,
                "lr_stat": lr_stat,
                "p_value": p_value,
                "mean_rn": sum(rn_per_point) / len(rn_per_point),
                "significant": p_value < 0.05,
            }
        )
        i += step

    # Current window
    current = comparisons[-1]
    current_window = returns[n - window_size :]
    rn_trajectory = [
        {
            "idx": n - window_size,
            "rn": math.exp(log_radon_nikodym(x, mu_p, sig_p, current["mu_q"], current["sig_q"])),
            "x": x,
        }
        for x in current_window
    ]

    # RN derivative density on grid
    x_min = mu_p - 4 * sig_p
    x_max = mu_p + 4 * sig_p
    grid = []
    for i in range(GRID_POINTS):
        x = x_min + (i / (GRID_POINTS - 1)) * (x_max - x_min)
        grid.append(
            {
                "x": x,
                "rn": math.exp(log_radon_nikodym(x, mu_p, sig_p, current["mu_q"], current["sig_q"])),
                "log_rn": log_radon_nikodym(x, mu_p, sig_p, current["mu_q"], current["sig_q"]),
            }
        )

    # Signal
    if current["p_value"] < 0.01:
        signal = "REGIME_CHANGE_STRONG"
        reason = (
            f"Strong regime change (LR={current['lr_stat']:.2f}, p={current['p_value']:.2e}), "
            f"KL={current['kl_sym']:.6f}"
        )
    elif current["p_value"] < 0.05:
        signal = "REGIME_CHANGE"
        reason = (
            f"Regime change detected (LR={current['lr_stat']:.2f}, p={current['p_value']:.4f}), "
            f"KL={current['kl_sym']:.6f}"
        )
    else:
        signal = "SAME_REGIME"
        reason = (
            f"Same regime (LR={current['lr_stat']:.2f}, p={current['p_value']:.4f}), "
            f"KL={current['kl_sym']:.6f}"
        )

    return RnResult(
        comparisons=comparisons,
        current=current,
        rn_trajectory=rn_trajectory,
        grid=grid,
        mu_p=mu_p,
        sig_p=sig_p,
        signal=signal,
        reason=reason,
        kl_pq=current["kl_pq"],
        kl_qp=current["kl_qp"],
    )
