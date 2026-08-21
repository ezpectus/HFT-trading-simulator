"""Girsanov Theorem (measure change for drift estimation).

Applies the Girsanov theorem to change the drift of an Ito process via an
equivalent measure change, enabling likelihood-based regime detection.
"""
from __future__ import annotations

import math

MIN_PRICES = 60
DEFAULT_LOOKBACK = 120
DEFAULT_WINDOW_SIZE = 30
DEFAULT_SIGMA = 0.02


class GirsanovResult:
    """Container for Girsanov analysis results."""

    def __init__(
        self,
        drifts: list[dict],
        llr_tests: list[dict],
        cum_trajectory: list[dict],
        current_drift: float,
        drift_change: float,
        current_llr: float,
        current_p_value: float,
        signal: str,
        reason: str,
        regime: str,
        mean_r: float,
        sigma_est: float,
        n: int,
    ) -> None:
        self.drifts = drifts
        self.llr_tests = llr_tests
        self.cum_trajectory = cum_trajectory
        self.current_drift = current_drift
        self.drift_change = drift_change
        self.current_llr = current_llr
        self.current_p_value = current_p_value
        self.signal = signal
        self.reason = reason
        self.regime = regime
        self.mean_r = mean_r
        self.sigma_est = sigma_est
        self.n = n


def compute_returns(prices: list[float]) -> list[float]:
    """Simple returns."""
    return [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]


def girsanov_signal(p_value: float) -> tuple[str, str]:
    """Signal from drift-change p-value."""
    if p_value < 0.01:
        return "DRIFT_CHANGE_STRONG", f"Strong drift change detected (p={p_value:.2e})"
    if p_value < 0.05:
        return "DRIFT_CHANGE", f"Drift change detected (p={p_value:.4f})"
    return "STABLE_DRIFT", f"No significant drift change (p={p_value:.4f})"


def girsanov_analysis(
    prices: list[float],
    lookback: int = DEFAULT_LOOKBACK,
    window_size: int = DEFAULT_WINDOW_SIZE,
    sigma: float | None = None,
) -> GirsanovResult | None:
    """Full Girsanov analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)
    n = len(returns)
    if n < window_size * 2:
        return None

    mean_r = sum(returns) / n
    var_r = sum((r - mean_r) ** 2 for r in returns) / n
    sigma_est = math.sqrt(var_r)
    sig = sigma if sigma else sigma_est

    drifts: list[dict] = []
    for i in range(n - window_size + 1):
        window = returns[i : i + window_size]
        mu = sum(window) / window_size
        drifts.append({"idx": i, "mu": mu, "mu_annual": mu * 252})

    llr_tests: list[dict] = []
    for i in range(1, len(drifts)):
        mu1 = drifts[i - 1]["mu"]
        mu2 = drifts[i]["mu"]
        theta = (mu1 - mu2) / sig
        llr = 0.5 * theta * theta * window_size
        p_value = math.exp(-llr / 2)
        llr_tests.append(
            {
                "idx": drifts[i]["idx"],
                "llr": llr,
                "p_value": p_value,
                "theta": theta,
                "drift_change": mu2 - mu1,
                "significant": p_value < 0.05,
            }
        )

    cum_llr = 0.0
    cum_trajectory: list[dict] = []
    for i in range(n):
        theta = (returns[i] - mean_r) / sig
        cum_llr += -theta * returns[i] / sig - 0.5 * theta * theta * sig * sig
        cum_trajectory.append({"idx": i, "cum_llr": cum_llr})

    current_drift = drifts[-1]["mu"]
    prev_drift = drifts[-2]["mu"] if len(drifts) > 1 else current_drift
    drift_change = current_drift - prev_drift
    current_llr = llr_tests[-1]["llr"] if llr_tests else 0.0
    current_p_value = llr_tests[-1]["p_value"] if llr_tests else 1.0

    signal, reason = girsanov_signal(current_p_value)
    reason += f" (LLR={current_llr:.4f}, Δμ={drift_change:.6f})"

    if current_drift > 0.001:
        regime = "BULLISH"
    elif current_drift < -0.001:
        regime = "BEARISH"
    else:
        regime = "NEUTRAL"

    return GirsanovResult(
        drifts=drifts,
        llr_tests=llr_tests,
        cum_trajectory=cum_trajectory,
        current_drift=current_drift,
        drift_change=drift_change,
        current_llr=current_llr,
        current_p_value=current_p_value,
        signal=signal,
        reason=reason,
        regime=regime,
        mean_r=mean_r,
        sigma_est=sig,
        n=n,
    )
