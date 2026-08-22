"""Hawkes Process fitting, intensity, and simulation functions.

Contains the core computational routines for the Hawkes process:
parameter fitting via grid-search MLE, conditional intensity evaluation,
and simulation via Ogata's thinning algorithm.
"""
from __future__ import annotations

import math
import random

from src.technical_analysis.hawkes_model import HawkesParams, hawkes_log_lik

DEFAULT_MAX_EVENTS = 300


def _arange(start: float, stop: float, step: float) -> list[float]:
    """Inclusive range with float step (mirrors JS for-loop semantics)."""
    values: list[float] = []
    value = start
    while value <= stop + 1e-12:
        values.append(value)
        value += step
    return values


def fit_hawkes(events: list[float], t: float) -> HawkesParams:
    """Grid-search MLE with fine-tuning around the best candidate."""
    best_params = {"mu": 0.1, "alpha": 0.5, "beta": 1.0}
    best_log_lik = -math.inf

    mu_range = [0.01, 0.05, 0.1, 0.2, 0.5, 1.0]
    alpha_range = [0.1, 0.3, 0.5, 0.7, 0.9, 1.2, 1.5]
    beta_range = [0.5, 1.0, 2.0, 3.0, 5.0, 8.0, 10.0]

    for mu in mu_range:
        for alpha in alpha_range:
            for beta in beta_range:
                if alpha >= beta:
                    continue
                ll = hawkes_log_lik(events, mu, alpha, beta, t)
                if ll > best_log_lik:
                    best_log_lik = ll
                    best_params = {"mu": mu, "alpha": alpha, "beta": beta}

    bm, ba, bb = best_params["mu"], best_params["alpha"], best_params["beta"]
    for dm in _arange(-0.02, 0.02, 0.01):
        for da in _arange(-0.1, 0.1, 0.05):
            for db in _arange(-0.5, 0.5, 0.25):
                mu = max(0.001, bm + dm)
                alpha = max(0.01, ba + da)
                beta = max(0.1, bb + db)
                if alpha >= beta:
                    continue
                ll = hawkes_log_lik(events, mu, alpha, beta, t)
                if ll > best_log_lik:
                    best_log_lik = ll
                    best_params = {"mu": mu, "alpha": alpha, "beta": beta}

    return HawkesParams(
        mu=best_params["mu"],
        alpha=best_params["alpha"],
        beta=best_params["beta"],
        log_lik=best_log_lik,
        branching_ratio=best_params["alpha"] / best_params["beta"],
    )


def hawkes_intensity(
    t: float,
    events: list[float],
    mu: float,
    alpha: float,
    beta: float,
) -> float:
    """Conditional intensity at time t."""
    intensity = mu
    for event in events:
        if event >= t:
            break
        intensity += alpha * math.exp(-beta * (t - event))
    return intensity


def simulate_hawkes(
    mu: float,
    alpha: float,
    beta: float,
    t: float,
    max_events: int = DEFAULT_MAX_EVENTS,
    seed: int | None = None,
) -> list[float]:
    """Simulate a Hawkes process via Ogata's thinning algorithm."""
    rng = random.Random(seed)
    events: list[float] = []
    time = 0.0
    intensity = mu

    while time < t and len(events) < max_events:
        u = rng.random()
        if u <= 0 or intensity <= 0:
            break
        time += -math.log(u) / intensity
        if time >= t:
            break
        new_intensity = hawkes_intensity(time, events, mu, alpha, beta)
        if rng.random() < new_intensity / intensity:
            events.append(time)
            intensity = new_intensity + alpha
        else:
            intensity = new_intensity

    return events
