"""Hamiltonian Monte Carlo (HMC) for Bayesian GARCH parameter estimation.

Momentum-based MCMC sampler using Hamiltonian dynamics to explore the
posterior distribution of GARCH(1,1) parameters [omega, alpha, beta].

    Hamiltonian: H(q, p) = U(q) + K(p)
    U(q) = -log p(q|D)          (potential energy = negative log posterior)
    K(p) = 0.5 * p^T * M^-1 * p (kinetic energy, M = mass matrix)

    Leapfrog integrator (symplectic):
    p_{1/2} = p - (eps/2) * grad U(q)
    q' = q + eps * M^-1 * p_{1/2}
    p' = p_{1/2} - (eps/2) * grad U(q')

    Metropolis acceptance: alpha = min(1, exp(H(q,p) - H(q',p')))

Ported from UI-only HamiltonianMonteCarlo.jsx into trading logic.
Reference: future_development.md §0.2 — medium priority model.
"""
from __future__ import annotations

import math
import random

MIN_PRICES = 50
DEFAULT_SAMPLES = 500
DEFAULT_STEP_SIZE = 0.005
DEFAULT_N_LEAPFROG = 20
DEFAULT_LOOKBACK = 100
DEFAULT_BURN_IN = 100
PARAM_NAMES = ["omega", "alpha", "beta"]


class HMCResult:
    """Container for Hamiltonian Monte Carlo analysis results."""

    def __init__(
        self,
        post_stats: list[dict],
        accept_rate: float,
        persistence_mean: float,
        persistence_std: float,
        long_run_var: float,
        signal: str,
        reason: str,
        n_post: int,
        samples: list[list[float]],
    ) -> None:
        self.post_stats = post_stats
        self.accept_rate = accept_rate
        self.persistence_mean = persistence_mean
        self.persistence_std = persistence_std
        self.long_run_var = long_run_var
        self.signal = signal
        self.reason = reason
        self.n_post = n_post
        self.samples = samples


def _random_normal(rng: random.Random) -> float:
    """Box-Muller standard normal sample."""
    u = rng.random()
    while u == 0:
        u = rng.random()
    v = rng.random()
    while v == 0:
        v = rng.random()
    return math.sqrt(-2 * math.log(u)) * math.cos(2 * math.pi * v)


def log_posterior(q: list[float], returns: list[float]) -> float:
    """Log posterior of GARCH(1,1) params [omega, alpha, beta]."""
    omega, alpha, beta = q
    if omega <= 0 or alpha <= 0 or beta <= 0 or alpha + beta >= 1:
        return -math.inf

    log_prior = -omega * 10 - alpha * 5 - beta * 5
    sigma2 = omega / (1 - alpha - beta + 1e-10)
    log_lik = 0.0
    for ret in returns:
        sigma2 = omega + alpha * ret * ret + beta * sigma2
        if sigma2 <= 0:
            return -math.inf
        log_lik += -0.5 * math.log(2 * math.pi * sigma2) - ret * ret / (2 * sigma2)

    return log_prior + log_lik


def grad_log_posterior(q: list[float], returns: list[float], eps: float = 1e-6) -> list[float]:
    """Numerical gradient of the log posterior (central differences)."""
    grad = [0.0] * len(q)
    for i in range(len(q)):
        q_plus = q[:]
        q_minus = q[:]
        q_plus[i] += eps
        q_minus[i] -= eps
        grad[i] = (log_posterior(q_plus, returns) - log_posterior(q_minus, returns)) / (2 * eps)
    return grad


def leapfrog(
    q: list[float],
    p: list[float],
    grad_fn,
    step_size: float,
    n_steps: int,
    mass: list[float],
) -> tuple[list[float], list[float]]:
    """Leapfrog symplectic integrator."""
    q = q[:]
    p = p[:]
    grad = grad_fn(q)

    for _ in range(n_steps):
        for j in range(len(q)):
            p[j] -= 0.5 * step_size * grad[j]
        for j in range(len(q)):
            q[j] += step_size * p[j] / mass[j]
        grad = grad_fn(q)
        for j in range(len(q)):
            p[j] -= 0.5 * step_size * grad[j]

    return q, p


def hmc(
    init_q: list[float],
    log_post_fn,
    grad_fn,
    n_samples: int,
    step_size: float,
    n_leapfrog: int,
    mass: list[float],
    seed: int | None = None,
) -> dict:
    """Hamiltonian Monte Carlo sampler."""
    rng = random.Random(seed)
    q = init_q[:]
    samples: list[list[float]] = []
    accept_history: list[int] = []
    log_post_history: list[float] = []

    for _ in range(n_samples):
        p = [_random_normal(rng) * math.sqrt(mass[i]) for i in range(len(q))]

        current_log_post = log_post_fn(q)
        current_k = 0.5 * sum(p[i] * p[i] / mass[i] for i in range(len(q)))
        current_h = -current_log_post + current_k

        new_q, new_p = leapfrog(q, p, grad_fn, step_size, n_leapfrog, mass)

        new_log_post = log_post_fn(new_q)
        new_k = 0.5 * sum(new_p[i] * new_p[i] / mass[i] for i in range(len(q)))
        new_h = -new_log_post + new_k

        accept_prob = min(1.0, math.exp(current_h - new_h))
        accepted = rng.random() < accept_prob

        if accepted and math.isfinite(new_log_post):
            q = new_q

        samples.append(q[:])
        accept_history.append(1 if accepted else 0)
        log_post_history.append(new_log_post if math.isfinite(new_log_post) else current_log_post)

    return {
        "samples": samples,
        "accept_history": accept_history,
        "log_post_history": log_post_history,
    }


def _posterior_stats(samples: list[list[float]], names: list[str]) -> list[dict]:
    """Mean/std/percentiles of posterior samples per parameter."""
    stats: list[dict] = []
    for i, name in enumerate(names):
        vals = sorted(s[i] for s in samples)
        mean = sum(vals) / len(vals)
        std = math.sqrt(sum((v - mean) ** 2 for v in vals) / len(vals))

        def pct(q: float) -> float:
            return vals[min(len(vals) - 1, int(len(vals) * q))]

        stats.append(
            {
                "name": name,
                "mean": mean,
                "std": std,
                "p25": pct(0.25),
                "p50": pct(0.50),
                "p75": pct(0.75),
                "p025": pct(0.025),
                "p975": pct(0.975),
                "samples": vals,
            }
        )
    return stats


def hmc_signal(persistence_mean: float) -> tuple[str, str]:
    """Signal from GARCH persistence alpha + beta."""
    if persistence_mean > 0.98:
        return "HIGH_PERSISTENCE", f"GARCH persistence α+β = {persistence_mean:.4f} (long memory, vol clustering)"
    if persistence_mean < 0.9:
        return "LOW_PERSISTENCE", f"GARCH persistence α+β = {persistence_mean:.4f} (fast mean reversion)"
    return "NEUTRAL", f"GARCH persistence α+β = {persistence_mean:.4f} (moderate)"


def hmc_analysis(
    prices: list[float],
    n_samples: int = DEFAULT_SAMPLES,
    step_size: float = DEFAULT_STEP_SIZE,
    n_leapfrog: int = DEFAULT_N_LEAPFROG,
    lookback: int = DEFAULT_LOOKBACK,
    burn_in: int = DEFAULT_BURN_IN,
    seed: int | None = None,
) -> HMCResult | None:
    """Full HMC analysis of a price series. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback - 1 :]
    returns = [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]

    init_q = [0.02, 0.08, 0.9]
    mass = [1.0, 1.0, 1.0]

    result = hmc(
        init_q,
        lambda q: log_posterior(q, returns),
        lambda q: grad_log_posterior(q, returns),
        n_samples,
        step_size,
        n_leapfrog,
        mass,
        seed=seed,
    )

    post_samples = result["samples"][burn_in:]
    if not post_samples:
        return None

    post_stats = _posterior_stats(post_samples, PARAM_NAMES)
    accept_rate = sum(result["accept_history"][burn_in:]) / len(post_samples)

    persistence = [s[1] + s[2] for s in post_samples]
    pers_mean = sum(persistence) / len(persistence)
    pers_std = math.sqrt(sum((v - pers_mean) ** 2 for v in persistence) / len(persistence))

    long_run_var = sum(s[0] / (1 - s[1] - s[2] + 1e-10) for s in post_samples) / len(post_samples)

    signal, reason = hmc_signal(pers_mean)

    return HMCResult(
        post_stats=post_stats,
        accept_rate=accept_rate,
        persistence_mean=pers_mean,
        persistence_std=pers_std,
        long_run_var=long_run_var,
        signal=signal,
        reason=reason,
        n_post=len(post_samples),
        samples=post_samples,
    )
