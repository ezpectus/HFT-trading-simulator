"""Shared utilities for research modules."""
from __future__ import annotations

import math


def compute_returns(prices: list[float]) -> list[float]:
    """Simple returns: r_t = (P_t - P_{t-1}) / P_{t-1}."""
    if len(prices) < 2:
        return []
    return [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]


def quantize(values: list[float], n_bins: int = 5) -> list[int]:
    """Quantize continuous values into bin indices."""
    if not values:
        return []
    min_v = min(values)
    max_v = max(values)
    bin_w = (max_v - min_v) / n_bins if max_v > min_v else 1.0
    return [min(n_bins - 1, max(0, math.floor((v - min_v) / bin_w))) for v in values]
