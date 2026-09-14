"""Hawkes Process model classes and log-likelihood function.

Contains the data containers (HawkesParams) and the
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
    for i, event in enumerate(events):
        dt = event - events[i - 1] if i > 0 else 0.0
        r = math.exp(-beta * dt) * r + 1
        log_lik += math.log(max(MIN_LOG_LIK, mu + alpha * r))

    integral = mu * t
    for event in events:
        integral += (alpha / beta) * (1 - math.exp(-beta * (t - event)))

    return log_lik - integral
