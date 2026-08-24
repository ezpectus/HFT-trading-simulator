"""Support Vector Machine (SVM) for price direction classification.

Linear SVM via SGD with hinge loss. Binary classification (up/down)
based on multi-dimensional features extracted from return windows.
"""
from __future__ import annotations

import math
import random

DEFAULT_C = 1.0
DEFAULT_EPOCHS = 200
DEFAULT_LR = 0.01
LR_DECAY_RATE = 0.01
DEFAULT_GAMMA = 0.5
DEFAULT_MAX_PASSES = 10
DEFAULT_TOL = 1e-3


class SVMResult:
    """Container for SVM training results."""

    def __init__(
        self,
        weights: list[float],
        bias: float,
        accuracy: float,
        predictions: list[int],
    ) -> None:
        self.weights = weights
        self.bias = bias
        self.accuracy = accuracy
        self.predictions = predictions


def _dot(w: list[float], x: list[float]) -> float:
    """Dot product of two vectors."""
    return sum(wi * xi for wi, xi in zip(w, x, strict=False))


def _rbf_kernel(x1: list[float], x2: list[float], gamma: float) -> float:
    """RBF (Gaussian) kernel."""
    dist_sq = sum((a - b) ** 2 for a, b in zip(x1, x2, strict=False))
    return math.exp(-gamma * dist_sq)


def linear_svm(
    X: list[list[float]],
    y: list[int],
    C: float = DEFAULT_C,
    epochs: int = DEFAULT_EPOCHS,
    lr: float = DEFAULT_LR,
    seed: int | None = None,
) -> SVMResult:
    """Train a linear SVM using SGD with hinge loss."""
    n = len(X)
    if n == 0:
        return SVMResult([], 0.0, 0.0, [])

    d = len(X[0])
    w = [0.0] * d
    b = 0.0
    rng = random.Random(seed)

    for epoch in range(epochs):
        indices = list(range(n))
        rng.shuffle(indices)
        eta = lr / (1.0 + epoch * LR_DECAY_RATE)

        for i in indices:
            margin = y[i] * (_dot(w, X[i]) + b)
            if margin < 1:
                for j in range(d):
                    w[j] = w[j] - eta * (w[j] / (n * C) - y[i] * X[i][j])
                b = b + eta * y[i]
            else:
                for j in range(d):
                    w[j] = w[j] - eta * w[j] / (n * C)

    # Training accuracy
    predictions: list[int] = []
    correct = 0
    for i in range(n):
        pred = 1 if _dot(w, X[i]) + b > 0 else -1
        predictions.append(pred)
        if pred == y[i]:
            correct += 1

    accuracy = correct / n if n > 0 else 0.0

    return SVMResult(weights=w, bias=b, accuracy=accuracy, predictions=predictions)


def predict(model: SVMResult, x: list[float]) -> int:
    """Predict label for a single sample using a trained linear SVM."""
    return 1 if _dot(model.weights, x) + model.bias > 0 else -1


def standardize(features: list[list[float]]) -> tuple[list[list[float]], list[float], list[float]]:
    """Standardize features to zero mean and unit variance.

    Returns (standardized_data, means, stds).
    """
    n = len(features)
    if n == 0:
        return [], [], []

    d = len(features[0])
    means = [0.0] * d
    stds = [0.0] * d

    for row in features:
        for j in range(d):
            means[j] += row[j]
    means = [m / n for m in means]

    for row in features:
        for j in range(d):
            stds[j] += (row[j] - means[j]) ** 2
    stds = [math.sqrt(s / n) for s in stds]

    standardized = [
        [(v - means[j]) / stds[j] if stds[j] > 0 else 0.0 for j, v in enumerate(row)]
        for row in features
    ]

    return standardized, means, stds


def extract_svm_features(
    returns: list[float],
    window_size: int = 20,
) -> tuple[list[list[float]], list[int]]:
    """Extract features and labels from return series for SVM training.

    Features: mean, vol, skew, kurt, last return, momentum, RSI, autocorrelation.
    Labels: +1 if next return > 0, -1 otherwise.

    Returns (features, labels).
    """
    if len(returns) < window_size + 2:
        return [], []

    features: list[list[float]] = []
    labels: list[int] = []

    for i in range(window_size, len(returns) - 1):
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

        last_ret = window[-1]
        momentum = window[-1] - window[0]

        # RSI
        gains = sum(r for r in window if r > 0)
        losses = sum(-r for r in window if r < 0)
        rsi = 50 + 50 * (gains - losses) / (gains + losses) if (gains + losses) > 0 else 50

        # Autocorrelation lag-1
        ac1_num = sum((window[j] - mean) * (window[j - 1] - mean) for j in range(1, n))
        ac1_den = sum((r - mean) ** 2 for r in window)
        ac1 = ac1_num / ac1_den if ac1_den > 0 else 0.0

        features.append([
            mean * 100, vol * 100, skew, kurt,
            last_ret * 100, momentum * 100,
            (rsi - 50) / 50, ac1,
        ])
        labels.append(1 if returns[i + 1] > 0 else -1)

    return features, labels
