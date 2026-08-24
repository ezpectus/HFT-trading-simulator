"""Dynamic Time Warping (DTW) for temporal sequence similarity.

Measures similarity between temporal sequences that may vary in speed.
Uses classic O(n*m) DP with optional Sakoe-Chiba band constraint.
"""
from __future__ import annotations

import math

INF = float("inf")


class DTWResult:
    """Container for DTW computation results."""

    def __init__(self, distance: float, path: list[tuple[int, int]], cost: float) -> None:
        self.distance = distance
        self.path = path
        self.cost = cost


def dtw(
    x: list[float],
    y: list[float],
    window: int | None = None,
) -> DTWResult:
    """Compute DTW distance and warping path between two sequences."""
    n = len(x)
    m = len(y)

    if n == 0 or m == 0:
        return DTWResult(INF, [], INF)

    w = max(window, abs(n - m)) if window is not None else max(n, m)

    # DP matrix (n+1 x m+1), initialized to infinity
    D = [[INF] * (m + 1) for _ in range(n + 1)]
    D[0][0] = 0.0

    for i in range(1, n + 1):
        j_start = max(1, i - w)
        j_end = min(m, i + w)
        for j in range(j_start, j_end + 1):
            cost = (x[i - 1] - y[j - 1]) ** 2
            D[i][j] = cost + min(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1])

    # Backtrack warping path
    path: list[tuple[int, int]] = []
    i, j = n, m
    while i > 0 and j > 0:
        path.append((i - 1, j - 1))
        min_val = min(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1])
        if min_val == D[i - 1][j - 1]:
            i -= 1
            j -= 1
        elif min_val == D[i - 1][j]:
            i -= 1
        else:
            j -= 1

    path.reverse()

    return DTWResult(distance=math.sqrt(D[n][m]), path=path, cost=D[n][m])


def normalize(arr: list[float]) -> list[float]:
    """Z-score normalize a sequence."""
    if not arr:
        return []
    mean = sum(arr) / len(arr)
    variance = sum((v - mean) ** 2 for v in arr) / len(arr)
    std = math.sqrt(variance)
    if std == 0:
        return [0.0] * len(arr)
    return [(v - mean) / std for v in arr]


def extract_windows(prices: list[float], window_size: int) -> list[dict[str, int | list[float]]]:
    """Extract sliding windows from a price series."""
    if len(prices) < window_size:
        return []
    windows: list[dict[str, int | list[float]]] = []
    for i in range(len(prices) - window_size + 1):
        windows.append({"start": i, "data": prices[i:i + window_size]})
    return windows


# Pattern templates for pattern matching
PATTERN_TEMPLATES: dict[str, list[float]] = {
    "double_bottom": [1.0, 0.5, 0.0, -0.3, -0.5, -0.3, 0.0, 0.5, 1.0, 0.5, 0.0, -0.3, -0.5, -0.3, 0.0, 0.5, 1.0, 1.5, 2.0],
    "head_and_shoulders": [0.5, 1.0, 1.5, 1.0, 0.5, 1.0, 1.5, 2.0, 2.5, 2.0, 1.5, 1.0, 0.5, 1.0, 1.5, 1.0, 0.5],
    "ascending_triangle": [0.0, 0.5, 0.0, 0.8, 0.2, 1.0, 0.4, 1.0, 0.6, 1.0, 0.8, 1.0, 1.0, 1.5, 2.0, 2.5],
    "descending_triangle": [2.5, 2.0, 1.5, 1.0, 1.0, 0.8, 1.0, 0.6, 1.0, 0.4, 1.0, 0.2, 0.8, 0.0, 0.5, 0.0],
    "cup_and_handle": [2.0, 1.5, 1.0, 0.5, 0.0, -0.3, -0.5, -0.3, 0.0, 0.5, 1.0, 1.5, 2.0, 1.8, 1.5, 1.8, 2.2, 2.5, 3.0],
    "v_reversal": [2.0, 1.5, 1.0, 0.5, 0.0, -0.5, -1.0, -1.5, -2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0, 2.5],
    "flag": [0.0, 1.0, 2.0, 3.0, 2.5, 2.0, 1.5, 2.0, 2.5, 2.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5],
    "channel": [0.0, 0.5, 1.0, 0.5, 0.0, -0.5, -1.0, -0.5, 0.0, 0.5, 1.0, 0.5, 0.0, -0.5, -1.0, -0.5, 0.0, 0.5, 1.0],
}


def find_best_match(
    query: list[float],
    templates: dict[str, list[float]] | None = None,
    window: int | None = None,
) -> tuple[str, float, DTWResult]:
    """Find the best matching template for a query sequence.

    Returns (template_name, distance, dtw_result).
    """
    templates = templates or PATTERN_TEMPLATES
    best_name = ""
    best_result = DTWResult(INF, [], INF)

    for name, template in templates.items():
        result = dtw(normalize(query), normalize(template), window=window)
        if result.distance < best_result.distance:
            best_name = name
            best_result = result

    return best_name, best_result.distance, best_result
