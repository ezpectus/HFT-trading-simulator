"""Gaussian Mixture Model (GMM) with EM algorithm for regime clustering.

Fits GMM to return distributions using Expectation-Maximization.
"""
from __future__ import annotations

import math
import random

DEFAULT_MAX_ITER = 100
DEFAULT_TOL = 1e-6
MIN_VARIANCE = 1e-10
LOG_EPS = 1e-10


class GMMResult:
    """Container for GMM fitting results."""

    def __init__(
        self,
        means: list[float],
        variances: list[float],
        weights: list[float],
        assignments: list[int],
        log_likelihood: float,
        log_likelihood_history: list[float],
        bic: float,
        aic: float,
        n_iter: int,
    ) -> None:
        self.means = means
        self.variances = variances
        self.weights = weights
        self.assignments = assignments
        self.log_likelihood = log_likelihood
        self.log_likelihood_history = log_likelihood_history
        self.bic = bic
        self.aic = aic
        self.n_iter = n_iter


def _gaussian_pdf(x: float, mu: float, sigma2: float) -> float:
    """1D Gaussian probability density function."""
    if sigma2 <= 0:
        return 0.0
    return math.exp(-((x - mu) ** 2) / (2 * sigma2)) / math.sqrt(2 * math.pi * sigma2)


def _kmeans_init(data: list[float], k: int, rng: random.Random) -> list[float]:
    """Simple K-Means for GMM initialization (1D)."""
    n = len(data)
    if n == 0:
        return []

    data_min = min(data)
    data_max = max(data)
    if data_max == data_min:
        return [data_min] * k

    centroids = [data_min + (data_max - data_min) * (i + 0.5) / k for i in range(k)]

    for _ in range(50):
        assignments = []
        for x in data:
            best_idx = 0
            min_dist = float("inf")
            for i in range(k):
                d = (x - centroids[i]) ** 2
                if d < min_dist:
                    min_dist = d
                    best_idx = i
            assignments.append(best_idx)

        new_centroids = centroids[:]
        for i in range(k):
            cluster = [data[j] for j in range(n) if assignments[j] == i]
            if cluster:
                new_centroids[i] = sum(cluster) / len(cluster)

        if all(abs(c - nc) < DEFAULT_TOL for c, nc in zip(centroids, new_centroids)):
            break
        centroids = new_centroids

    return centroids


def fit_gmm(
    data: list[float],
    k: int,
    max_iter: int = DEFAULT_MAX_ITER,
    tol: float = DEFAULT_TOL,
    seed: int | None = None,
) -> GMMResult:
    """Fit a 1D Gaussian Mixture Model using EM algorithm.

    Returns means, variances, weights, assignments, log-likelihood, BIC, AIC.
    """
    if not data or k <= 0:
        return GMMResult([], [], [], [], 0.0, [], 0.0, 0.0, 0)

    n = len(data)
    rng = random.Random(seed)

    # Initialize via K-Means
    centroids = _kmeans_init(data, k, rng)
    means = centroids[:]

    overall_var = sum((x - sum(data) / n) ** 2 for x in data) / n
    variances = [max(MIN_VARIANCE, overall_var / k)] * k
    weights = [1.0 / k] * k

    prev_log_lik = float("-inf")
    log_lik_history: list[float] = []

    iteration = 0
    for iteration in range(max_iter):
        # E-step
        gammas = [[0.0] * k for _ in range(n)]
        for i in range(n):
            probs = [weights[j] * _gaussian_pdf(data[i], means[j], variances[j]) for j in range(k)]
            total = sum(probs)
            if total > 0:
                gammas[i] = [p / total for p in probs]
            else:
                gammas[i] = [1.0 / k] * k

        # M-step
        n_k = [sum(gammas[i][j] for i in range(n)) for j in range(k)]

        for j in range(k):
            if n_k[j] > 0:
                means[j] = sum(gammas[i][j] * data[i] for i in range(n)) / n_k[j]
                variances[j] = max(
                    MIN_VARIANCE,
                    sum(gammas[i][j] * (data[i] - means[j]) ** 2 for i in range(n)) / n_k[j],
                )
                weights[j] = n_k[j] / n

        # Log-likelihood
        log_lik = 0.0
        for i in range(n):
            mixture_sum = sum(
                weights[j] * _gaussian_pdf(data[i], means[j], variances[j])
                for j in range(k)
            )
            log_lik += math.log(max(LOG_EPS, mixture_sum))

        log_lik_history.append(log_lik)

        if abs(log_lik - prev_log_lik) < tol:
            break
        prev_log_lik = log_lik

    final_log_lik = log_lik_history[-1] if log_lik_history else 0.0

    # Assignments
    assignments = []
    for x in data:
        best_idx = 0
        max_prob = 0.0
        for j in range(k):
            p = weights[j] * _gaussian_pdf(x, means[j], variances[j])
            if p > max_prob:
                max_prob = p
                best_idx = j
        assignments.append(best_idx)

    # Sort by mean
    order = sorted(range(k), key=lambda i: means[i])
    sorted_means = [means[i] for i in order]
    sorted_variances = [variances[i] for i in order]
    sorted_weights = [weights[i] for i in order]

    # Remap assignments
    remap = {old: new for new, old in enumerate(order)}
    sorted_assignments = [remap[a] for a in assignments]

    # BIC and AIC
    n_params = k * 3 - 1  # k means + k variances + (k-1) weights
    bic = -2 * final_log_lik + n_params * math.log(n)
    aic = -2 * final_log_lik + 2 * n_params

    return GMMResult(
        means=sorted_means,
        variances=sorted_variances,
        weights=sorted_weights,
        assignments=sorted_assignments,
        log_likelihood=final_log_lik,
        log_likelihood_history=log_lik_history,
        bic=bic,
        aic=aic,
        n_iter=iteration + 1,
    )
