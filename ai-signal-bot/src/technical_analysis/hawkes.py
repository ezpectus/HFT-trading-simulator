"""Hawkes Process (self-exciting point process) for order-flow clustering.

Models trade clustering: intensity lambda(t) increases after each event,
capturing the empirical fact that trades cluster in bursts.

    Intensity: lambda(t) = mu + sum_{t_i < t} alpha * exp(-beta * (t - t_i))
    - mu: baseline intensity (exogenous arrivals)
    - alpha: excitation magnitude (each event adds alpha)
    - beta: decay rate of excitation

    Branching ratio: n = alpha / beta  (n < 1 for stationarity)
    Expected descendants per event: n / (1 - n)

    Log-likelihood:
    L = sum log(lambda(t_i)) - integral_0^T lambda(t) dt
      = sum log(mu + alpha * R_i) - mu*T - (alpha/beta) * sum(1 - exp(-beta*(T - t_i)))
    where R_i = sum_{j<i} exp(-beta*(t_i - t_j)) computed recursively:
    R_i = exp(-beta*(t_i - t_{i-1})) * (1 + R_{i-1})

Ported from UI-only HawkesProcess.jsx into trading logic.
Reference: future_development.md §0.1 — medium priority model.
"""
from __future__ import annotations

import math
import random

MIN_LOG_LIK = 1e-10
MIN_EVENTS = 5
MIN_PRICES = 30
DEFAULT_THRESHOLD = 0.003
DEFAULT_SIM_T = 100
DEFAULT_MAX_EVENTS = 300


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
        r = math.exp(-beta * dt) * (1 + r)
        log_lik += math.log(max(MIN_LOG_LIK, mu + alpha * r))

    integral = mu * t
    for event in events:
        integral += (alpha / beta) * (1 - math.exp(-beta * (t - event)))

    return log_lik - integral


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


def _arange(start: float, stop: float, step: float) -> list[float]:
    """Inclusive range with float step (mirrors JS for-loop semantics)."""
    values: list[float] = []
    value = start
    while value <= stop + 1e-12:
        values.append(value)
        value += step
    return values


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
