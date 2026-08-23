"""Shared utilities for research modules."""
from __future__ import annotations


def compute_returns(prices: list[float]) -> list[float]:
    """Simple returns: r_t = (P_t - P_{t-1}) / P_{t-1}."""
    if len(prices) < 2:
        return []
    return [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]
