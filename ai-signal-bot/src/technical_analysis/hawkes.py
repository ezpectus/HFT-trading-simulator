"""Hawkes Process (self-exciting point process) for order-flow clustering.

Models trade clustering: intensity lambda(t) increases after each event,
capturing the empirical fact that trades cluster in bursts.
"""
from __future__ import annotations

from src.technical_analysis.hawkes_funcs import (
    DEFAULT_MAX_EVENTS,
    fit_hawkes,
    hawkes_intensity,
    simulate_hawkes,
)
from src.technical_analysis.hawkes_model import (
    HawkesParams,
    HawkesResult,
    hawkes_log_lik,
)

MIN_EVENTS = 5
MIN_PRICES = 30
DEFAULT_THRESHOLD = 0.003
DEFAULT_SIM_T = 100


def extract_events(prices: list[float], threshold: float = DEFAULT_THRESHOLD) -> list[float]:
    """Extract event times: candle indices with significant price moves."""
    events: list[float] = []
    for i in range(1, len(prices)):
        if prices[i - 1] > 0:
            ret = abs((prices[i] - prices[i - 1]) / prices[i - 1])
            if ret > threshold:
                events.append(float(i))
    return events


def _max_burst(events: list[float], mean_ia: float) -> int:
    """Longest run of events with gaps below half the mean inter-arrival."""
    if mean_ia <= 0:
        return 0
    max_burst = 0
    current_burst = 0
    for i in range(1, len(events)):
        if events[i] - events[i - 1] < mean_ia * 0.5:
            current_burst += 1
            max_burst = max(max_burst, current_burst)
        else:
            current_burst = 0
    return max_burst


def hawkes_signal(branching_ratio: float) -> tuple[str, str]:
    """Trading signal from the branching ratio (self-excitation strength)."""
    if branching_ratio > 0.7:
        return "TREND", f"High branching ratio (n={branching_ratio:.3f}): trades strongly self-excite, expect clustering"
    if branching_ratio > 0.4:
        return "MOMENTUM", f"Moderate branching (n={branching_ratio:.3f}): some trade clustering expected"
    return "MEAN_REVERT", f"Low branching (n={branching_ratio:.3f}): trades independent, mean-reverting"


def hawkes_analysis(
    prices: list[float],
    threshold: float = DEFAULT_THRESHOLD,
    auto_fit: bool = True,
    mu: float = 0.1,
    alpha: float = 0.5,
    beta: float = 2.0,
    sim_t: float = DEFAULT_SIM_T,
    max_events: int = DEFAULT_MAX_EVENTS,
    seed: int | None = None,
) -> HawkesResult | None:
    """Full Hawkes analysis of a price series. None if insufficient data or events."""
    if not prices or len(prices) < MIN_PRICES:
        return None

    events = extract_events(prices, threshold)
    if len(events) < MIN_EVENTS:
        return None

    t = float(len(prices))
    if auto_fit:
        params = fit_hawkes(events, t)
    else:
        log_lik = hawkes_log_lik(events, mu, alpha, beta, t)
        params = HawkesParams(mu=mu, alpha=alpha, beta=beta, log_lik=log_lik, branching_ratio=alpha / beta)

    step_size = max(1, int(t) // 200)
    intensity_path = [
        {"t": float(ti), "intensity": hawkes_intensity(ti, events, params.mu, params.alpha, params.beta)}
        for ti in range(0, int(t), step_size)
    ]

    simulated = simulate_hawkes(params.mu, params.alpha, params.beta, sim_t, max_events, seed)

    inter_arrivals = [events[i] - events[i - 1] for i in range(1, len(events))]
    mean_ia = sum(inter_arrivals) / len(inter_arrivals) if inter_arrivals else 0.0
    sim_ia = [simulated[i] - simulated[i - 1] for i in range(1, len(simulated))]
    mean_sim_ia = sum(sim_ia) / len(sim_ia) if sim_ia else 0.0

    signal, reason = hawkes_signal(params.branching_ratio)
    current_intensity = intensity_path[-1]["intensity"] if intensity_path else 0.0
    intensity_ratio = current_intensity / params.mu if params.mu > 0 else 0.0

    return HawkesResult(
        events=events,
        t=t,
        params=params,
        intensity_path=intensity_path,
        simulated=simulated,
        inter_arrivals=inter_arrivals,
        mean_ia=mean_ia,
        mean_sim_ia=mean_sim_ia,
        max_burst=_max_burst(events, mean_ia),
        signal=signal,
        reason=reason,
        current_intensity=current_intensity,
        intensity_ratio=intensity_ratio,
        n_events=len(events),
        n_simulated=len(simulated),
    )
