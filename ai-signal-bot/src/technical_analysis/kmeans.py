"""K-Means Clustering for market regime detection.

Lloyd's algorithm with K-Means++ initialization. Clusters multi-dimensional
features into distinct market regimes (e.g., calm trending, volatile ranging).
"""
from __future__ import annotations

import random
import math

DEFAULT_MAX_ITER = 100
DEFAULT_TOL = 1e-6
MIN_VARIANCE = 1e-10


class KMeansResult:
    """Container for K-Means clustering results."""

    def __init__(
        self,
        labels: list[int],
        centroids: list[list[float]],
        wcss: float,
        n_iter: int,
    ) -> None:
        self.labels = labels
        self.centroids = centroids
        self.wcss = wcss
        self.n_iter = n_iter


def _euclidean_sq(a: list[float], b: list[float]) -> float:
    """Squared Euclidean distance."""
    return sum((ai - bi) ** 2 for ai, bi in zip(a, b))


def _kmeans_plus_plus_init(
    data: list[list[float]],
    k: int,
    rng: random.Random,
) -> list[list[float]]:
    """K-Means++ smart centroid seeding."""
    n = len(data)
    if n <= k:
        return [row[:] for row in data]

    centroids = [data[rng.randint(0, n - 1)][:]]

    for _ in range(1, k):
        dists = []
        for point in data:
            min_dist = min(_euclidean_sq(point, c) for c in centroids)
            dists.append(min_dist)

        total = sum(dists)
        if total == 0:
            centroids.append(data[rng.randint(0, n - 1)][:])
            continue

        r = rng.random() * total
        cumulative = 0.0
        selected = 0
        for i, d in enumerate(dists):
            cumulative += d
            if cumulative >= r:
                selected = i
                break
        centroids.append(data[selected][:])

    return centroids


def kmeans(
    data: list[list[float]],
    k: int,
    max_iter: int = DEFAULT_MAX_ITER,
    tol: float = DEFAULT_TOL,
    seed: int | None = None,
) -> KMeansResult:
    """Run K-Means clustering using Lloyd's algorithm.

    Returns labels, centroids, within-cluster sum of squares, and iteration count.
    """
    if not data or k <= 0:
        return KMeansResult([], [], 0.0, 0)

    n = len(data)
    if n <= k:
        return KMeansResult([i % k for i in range(n)], [row[:] for row in data], 0.0, 0)

    rng = random.Random(seed)
    centroids = _kmeans_plus_plus_init(data, k, rng)
    labels = [0] * n

    for iteration in range(max_iter):
        changed = False

        # Assignment step
        for i in range(n):
            best_cluster = 0
            min_dist = float("inf")
            for c in range(k):
                d = _euclidean_sq(data[i], centroids[c])
                if d < min_dist:
                    min_dist = d
                    best_cluster = c
            if labels[i] != best_cluster:
                labels[i] = best_cluster
                changed = True

        if not changed and iteration > 0:
            break

        # Update step
        for c in range(k):
            cluster_points = [data[i] for i in range(n) if labels[i] == c]
            if not cluster_points:
                continue
            dim = len(cluster_points[0])
            centroids[c] = [
                sum(p[d] for p in cluster_points) / len(cluster_points)
                for d in range(dim)
            ]

    # WCSS
    wcss = 0.0
    for i in range(n):
        wcss += _euclidean_sq(data[i], centroids[labels[i]])

    return KMeansResult(labels=labels, centroids=centroids, wcss=wcss, n_iter=iteration + 1)


def extract_features(returns: list[float], window_size: int = 20) -> list[list[float]]:
    """Extract multi-dimensional features from return series for clustering.

    Features: mean return, volatility, skewness, kurtosis,
    mean absolute return, autocorrelation (lag-1), trend strength (R²).
    """
    if len(returns) < window_size:
        return []

    features: list[list[float]] = []
    for i in range(window_size, len(returns)):
        window = returns[i - window_size:i]
        n = len(window)

        mean = sum(window) / n
        variance = sum((r - mean) ** 2 for r in window) / n
        vol = math.sqrt(variance)

        skew = 0.0
        kurt = 0.0
        if vol > 0:
            skew = sum(((r - mean) / vol) ** 3 for r in window) / n
            kurt = sum(((r - mean) / vol) ** 4 for r in window) / n - 3

        mar = sum(abs(r) for r in window) / n

        # Autocorrelation lag-1
        ac1_num = sum((window[j] - mean) * (window[j - 1] - mean) for j in range(1, n))
        ac1_den = sum((r - mean) ** 2 for r in window)
        ac1 = ac1_num / ac1_den if ac1_den > 0 else 0.0

        # Trend strength (R²)
        x_mean = (n - 1) / 2
        sxy = sum((j - x_mean) * (window[j] - mean) for j in range(n))
        sxx = sum((j - x_mean) ** 2 for j in range(n))
        syy = variance * n
        r2 = (sxy / math.sqrt(sxx * syy)) ** 2 if sxx > 0 and syy > 0 else 0.0

        features.append([mean, vol, skew, kurt, mar, ac1, r2])

    return features
