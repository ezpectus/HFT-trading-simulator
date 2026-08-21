"""Free Energy Principle (active inference for trading).

Implements the Free Energy Principle (Friston) for trading decisions:
agents minimize variational free energy between internal model and observations.
"""
from __future__ import annotations

import math

MIN_PRICES = 20
DEFAULT_LOOKBACK = 50
DEFAULT_PRECISION = 0.01
DEFAULT_LR = 0.1
DEFAULT_HORIZON = 3
N_OBSERVATIONS = 10
MAX_ITER = 100
CONVERGENCE_CLAMP = 1.9


class FeResult:
    """Container for Free Energy Principle analysis results."""

    def __init__(
        self,
        observations: list[float],
        mu: list[float],
        history: list[dict],
        current_f: float,
        policies: list[dict],
        best_policy: dict,
        signal: str,
        reason: str,
        fe_history: list[float],
        belief_history: list[float],
        prediction_errors: list[float],
        returns: list[float],
        prices: list[float],
    ) -> None:
        self.observations = observations
        self.mu = mu
        self.history = history
        self.current_f = current_f
        self.policies = policies
        self.best_policy = best_policy
        self.signal = signal
        self.reason = reason
        self.fe_history = fe_history
        self.belief_history = belief_history
        self.prediction_errors = prediction_errors
        self.returns = returns
        self.prices = prices


def compute_returns(prices: list[float]) -> list[float]:
    """Simple returns."""
    return [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]


def log_gaussian(x: float, mu: float, sigma2: float) -> float:
    """Gaussian log density."""
    if sigma2 <= 0:
        return -float("inf")
    return -0.5 * math.log(2 * math.pi * sigma2) - (x - mu) ** 2 / (2 * sigma2)


def compute_free_energy(observations: list[float], beliefs: list[float], precisions: list[float]) -> float:
    """Variational free energy for Gaussian model."""
    f = 0.0
    for i in range(len(observations)):
        pe = (observations[i] - beliefs[i]) ** 2 / (2 * precisions[i])
        complexity = 0.5 * math.log(2 * math.pi * precisions[i])
        f += pe + complexity
    return f


def update_beliefs(
    observations: list[float],
    beliefs: list[float],
    precisions: list[float],
    lr: float = 0.1,
    max_iter: int = MAX_ITER,
) -> dict:
    """Update beliefs via gradient descent on free energy.

    ∂F/∂μ_i = -(o_i - μ_i)/σ_i²; step clamped to min(lr, 1.9·σ_i²) so the
    iteration μ += step·(o-μ)/σ² converges (multiplier ≤ 1.9 < 2).
    """
    mu = beliefs[:]
    history = []

    for _ in range(max_iter):
        f = 0.0
        grad = [0.0] * len(mu)

        for i in range(len(observations)):
            grad[i] = -(observations[i] - mu[i]) / precisions[i]
            f += (observations[i] - mu[i]) ** 2 / (2 * precisions[i]) + 0.5 * math.log(2 * math.pi * precisions[i])

        for i in range(len(mu)):
            step = min(lr, CONVERGENCE_CLAMP * precisions[i])
            mu[i] -= step * grad[i]

        history.append({"iter": len(history), "F": f, "mu": mu[:]})

    return {"mu": mu, "history": history}


def expected_free_energy(
    predicted_states: list[float],
    predicted_obs: list[float],
    preferences: list[float],
    precisions: list[float],
) -> float:
    """Expected free energy: risk (KL) + ambiguity (entropy)."""
    risk = 0.0
    for i in range(len(predicted_obs)):
        risk += (predicted_obs[i] - preferences[i]) ** 2 / (2 * precisions[i])

    ambiguity = 0.0
    for i in range(len(precisions)):
        ambiguity += 0.5 * math.log(2 * math.pi * math.e * precisions[i])

    return risk + ambiguity


def generate_policies(n_states: int, n_actions: int, horizon: int) -> list[list[int]]:
    """Generate all action sequences up to min(horizon, 3) steps."""
    policies = []
    depth = min(horizon, 3)

    def generate(current: list[int], remaining: int) -> None:
        if remaining == 0:
            policies.append(current[:])
            return
        for a in range(n_actions):
            current.append(a)
            generate(current, remaining - 1)
            current.pop()

    generate([], depth)
    return policies


def fe_analysis(
    prices: list[float],
    lookback: int = DEFAULT_LOOKBACK,
    precision: float = DEFAULT_PRECISION,
    lr: float = DEFAULT_LR,
    horizon: int = DEFAULT_HORIZON,
) -> FeResult | None:
    """Full Free Energy Principle analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)

    # Observations: recent returns (last 10)
    observations = returns[-N_OBSERVATIONS:]

    # Initial beliefs: prior = 0 (no change)
    initial_beliefs = [0.0] * N_OBSERVATIONS
    precisions = [precision] * N_OBSERVATIONS

    # Minimize free energy (perception)
    result = update_beliefs(observations, initial_beliefs, precisions, lr, MAX_ITER)
    mu = result["mu"]
    history = result["history"]

    # Current free energy
    current_f = history[-1]["F"]

    # Policy selection (active inference): 0=hold, 1=buy, 2=sell
    actions = ["HOLD", "BUY", "SELL"]
    policies = []
    for a in range(3):
        action_effect = 0.001 if a == 1 else (-0.001 if a == 2 else 0.0)
        predicted_return = mu[-1] + action_effect
        predicted_obs = [predicted_return]
        preferences = [0.0]
        policy_precisions = [precision]

        g = expected_free_energy([predicted_return], predicted_obs, preferences, policy_precisions)
        policies.append({"action": actions[a], "action_idx": a, "G": g, "predicted_return": predicted_return})

    # Select policy with lowest expected free energy
    policies.sort(key=lambda p: p["G"])
    best_policy = policies[0]

    signal = best_policy["action"]
    reason = (
        f"Min expected free energy G={best_policy['G']:.6f} "
        f"(predicted return: {best_policy['predicted_return'] * 100:.4f}%)"
    )

    fe_history = [h["F"] for h in history]
    belief_history = [h["mu"][-1] for h in history[-N_OBSERVATIONS:]]
    prediction_errors = [observations[i] - mu[i] for i in range(len(observations))]

    return FeResult(
        observations=observations,
        mu=mu,
        history=history,
        current_f=current_f,
        policies=policies,
        best_policy=best_policy,
        signal=signal,
        reason=reason,
        fe_history=fe_history,
        belief_history=belief_history,
        prediction_errors=prediction_errors,
        returns=returns,
        prices=prices,
    )
