"""Hamiltonian Monte Carlo (HMC) for Bayesian GARCH parameter estimation.

Momentum-based MCMC sampler using Hamiltonian dynamics to explore the
posterior distribution of GARCH(1,1) parameters [omega, alpha, beta].
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
    """Analytical gradient of the GARCH(1,1) log posterior.

    Consistent with log_posterior: same variance recursion
    h_t = omega + alpha*r_t^2 + beta*h_{t-1} seeded by the unconditional
    variance h_{-1} = omega/(1-alpha-beta), plus the exponential prior
    gradients (-10, -5, -5). eps is unused; kept for API compatibility.
    """
    omega, alpha, beta = q
    if omega <= 0 or alpha <= 0 or beta <= 0 or alpha + beta >= 1:
        return [0.0, 0.0, 0.0]

    n = len(returns)
    grad = [-10.0, -5.0, -5.0]  # d(log_prior)/d(omega, alpha, beta)
    if n == 0:
        return grad

    r2 = [r * r for r in returns]
    denom = 1.0 - alpha - beta + 1e-10

    # Seed: h_{-1} = omega/denom -> dh/dw = 1/denom, dh/da = dh/db = omega/denom^2
    h_prev = omega / denom
    dw, da, db = 1.0 / denom, omega / (denom * denom), omega / (denom * denom)

    for t in range(n):
        h = omega + alpha * r2[t] + beta * h_prev
        if h <= 0:
            return [0.0, 0.0, 0.0]
        dw = 1.0 + beta * dw
        da = r2[t] + beta * da
        db = h_prev + beta * db
        h_prev = h
        c = (r2[t] - h) / (2 * h * h)
        grad[0] += c * dw
        grad[1] += c * da
        grad[2] += c * db

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
        p = [pj - 0.5 * step_size * g for pj, g in zip(p, grad, strict=False)]
        q = [qj + step_size * pj / mj for qj, pj, mj in zip(q, p, mass, strict=False)]
        grad = grad_fn(q)
        p = [pj - 0.5 * step_size * g for pj, g in zip(p, grad, strict=False)]

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
        p = [rng.gauss(0, 1) * math.sqrt(m) for _, m in zip(q, mass, strict=False)]

        current_log_post = log_post_fn(q)
        current_k = 0.5 * sum(pi * pi / mi for pi, mi in zip(p, mass, strict=False))
        current_h = -current_log_post + current_k

        new_q, new_p = leapfrog(q, p, grad_fn, step_size, n_leapfrog, mass)

        new_log_post = log_post_fn(new_q)
        new_k = 0.5 * sum(pi * pi / mi for pi, mi in zip(new_p, mass, strict=False))
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

        def pct(q: float, _vals=vals) -> float:
            return _vals[min(len(_vals) - 1, int(len(_vals) * q))]

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
