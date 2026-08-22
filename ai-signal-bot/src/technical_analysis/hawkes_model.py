"""Hawkes Process model classes and log-likelihood function.

Contains the data containers (HawkesParams, HawkesResult) and the
log-likelihood function used by the fitting routines.
"""
from __future__ import annotations

import math

MIN_LOG_LIK = 1e-10


class HawkesParams:
    """Fitted Hawkes process parameters."""

    def __init__(
        self,
        mu: float,
        alpha: float,
        beta: float,
        log_lik: float,
        branching_ratio: float,
    ) -> None:
        self.mu = mu
        self.alpha = alpha
        self.beta = beta
        self.log_lik = log_lik
        self.branching_ratio = branching_ratio


class HawkesResult:
    """Container for Hawkes process analysis results."""

    def __init__(
        self,
        events: list[float],
        t: float,
        params: HawkesParams,
        intensity_path: list[dict],
        simulated: list[float],
        inter_arrivals: list[float],
        mean_ia: float,
        mean_sim_ia: float,
        max_burst: int,
        signal: str,
        reason: str,
        current_intensity: float,
        intensity_ratio: float,
        n_events: int,
        n_simulated: int,
    ) -> None:
        self.events = events
        self.t = t
        self.params = params
        self.intensity_path = intensity_path
        self.simulated = simulated
        self.inter_arrivals = inter_arrivals
        self.mean_ia = mean_ia
        self.mean_sim_ia = mean_sim_ia
        self.max_burst = max_burst
        self.signal = signal
        self.reason = reason
        self.current_intensity = current_intensity
        self.intensity_ratio = intensity_ratio
        self.n_events = n_events
        self.n_simulated = n_simulated


def hawkes_log_lik(
    events: list[float],
    mu: float,
    alpha: float,
    beta: float,
    t: float,
) -> float:
    """Log-likelihood of a Hawkes process. -inf for non-stationary/invalid params."""
    if alpha >= beta or mu <= 0 or alpha < 0 or beta <= 0:
        return -math.inf

    log_lik = 0.0
    r = 0.0
    for i in range(len(events)):
        dt = events[i] - events[i - 1] if i > 0 else 0.0
        r = math.exp(-beta * dt) * r + 1
        log_lik += math.log(max(MIN_LOG_LIK, mu + alpha * r))

    integral = mu * t
    for event in events:
        integral += (alpha / beta) * (1 - math.exp(-beta * (t - event)))

    return log_lik - integral
