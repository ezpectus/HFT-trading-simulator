"""Transfer Entropy for information-theoretic causality between time series.

Measures directed information flow: TE_{X->Y} quantifies how much X's past
reduces uncertainty about Y's future, beyond Y's own history. Unlike Granger
causality (linear), TE captures non-linear dependencies.

    TE_{X->Y} = sum p(y_{t+1}, y_t^k, x_t^l) * log2[ p(y_{t+1}|y_t^k, x_t^l) / p(y_{t+1}|y_t^k) ]
              = sum p_all * log2[ p_all * p_yonly / (p_y * p_yx) ]

    where y_t^k = [y_t, ..., y_{t-k+1}], x_t^l = [x_t, ..., x_{t-l+1}]

    Effective TE (ETE) = TE - TE_surrogate (shuffle X to destroy causality)

Ported from UI-only TransferEntropy.jsx into trading logic.
Reference: future_development.md §0.2 — medium priority model.
"""
from __future__ import annotations

import math
import random

DEFAULT_K = 1
DEFAULT_L = 1
DEFAULT_N_BINS = 5
DEFAULT_SURROGATES = 10
MIN_TUPLES = 10


class TransferEntropyResult:
    """Container for transfer entropy analysis results."""

    def __init__(
        self,
        te_xy: float,
        te_yx: float,
        net_te: float,
        surrogate_xy: float,
        surrogate_yx: float,
        ete: float,
        signal: str,
        reason: str,
        n_tuples: int,
    ) -> None:
        self.te_xy = te_xy
        self.te_yx = te_yx
        self.net_te = net_te
        self.surrogate_xy = surrogate_xy
        self.surrogate_yx = surrogate_yx
        self.ete = ete
        self.signal = signal
        self.reason = reason
        self.n_tuples = n_tuples


def quantize(values: list[float], n_bins: int = DEFAULT_N_BINS) -> list[int]:
    """Quantize continuous values into discrete bins."""
    if not values:
        return []
    min_v = min(values)
    max_v = max(values)
    bin_w = (max_v - min_v) / n_bins or 1.0
    return [
        min(n_bins - 1, max(0, int((v - min_v) / bin_w)))
        for v in values
    ]


def _joint_prob(tuples: list[list[int]]) -> dict[str, float]:
    """Joint probability of tuple keys."""
    counts: dict[str, int] = {}
    for t in tuples:
        key = ",".join(str(v) for v in t)
        counts[key] = counts.get(key, 0) + 1
    total = len(tuples)
    return {key: count / total for key, count in counts.items()}


def transfer_entropy(
    x: list[float],
    y: list[float],
    k: int = DEFAULT_K,
    l: int = DEFAULT_L,
    n_bins: int = DEFAULT_N_BINS,
) -> float:
    """Transfer entropy TE_{X->Y}. Returns 0 if insufficient tuples."""
    q_x = quantize(x, n_bins)
    q_y = quantize(y, n_bins)
    n = min(len(q_x), len(q_y))

    y_future: list[list[int]] = []
    y_history: list[list[int]] = []
    x_history: list[list[int]] = []
    yx_history: list[list[int]] = []

    for t in range(max(k, l), n - 1):
        y_future.append([q_y[t + 1]])
        y_history.append([q_y[t - i] for i in range(k)])
        x_history.append([q_x[t - i] for i in range(l)])
        yx_history.append([q_y[t - i] for i in range(k)] + [q_x[t - i] for i in range(l)])

    if len(y_future) < MIN_TUPLES:
        return 0.0

    joint_all = _joint_prob([y_future[i] + yx_history[i] for i in range(len(y_future))])
    joint_y = _joint_prob([y_future[i] + y_history[i] for i in range(len(y_future))])
    joint_yx = _joint_prob(yx_history)
    joint_yonly = _joint_prob(y_history)

    te = 0.0
    for i in range(len(y_future)):
        key_all = ",".join(str(v) for v in y_future[i] + yx_history[i])
        key_y = ",".join(str(v) for v in y_future[i] + y_history[i])
        key_yx = ",".join(str(v) for v in yx_history[i])
        key_yonly = ",".join(str(v) for v in y_history[i])

        p_all = joint_all.get(key_all, 0.0)
        p_y = joint_y.get(key_y, 0.0)
        p_yx = joint_yx.get(key_yx, 0.0)
        p_yonly = joint_yonly.get(key_yonly, 0.0)

        if p_all > 0 and p_y > 0 and p_yx > 0 and p_yonly > 0:
            te += p_all * math.log2((p_all * p_yonly) / (p_y * p_yx))

    return max(0.0, te)


def surrogate_te(
    x: list[float],
    y: list[float],
    k: int = DEFAULT_K,
    l: int = DEFAULT_L,
    n_bins: int = DEFAULT_N_BINS,
    n_surrogates: int = DEFAULT_SURROGATES,
    seed: int | None = None,
) -> float:
    """Mean TE with shuffled X (destroys causality)."""
    rng = random.Random(seed)
    total = 0.0
    for _ in range(n_surrogates):
        shuffled = x[:]
        rng.shuffle(shuffled)
        total += transfer_entropy(shuffled, y, k, l, n_bins)
    return total / n_surrogates


def te_signal(net_te: float) -> tuple[str, str]:
    """Causality signal from net transfer entropy."""
    if net_te > 0.01:
        return "INFLUENCER", f"X → Y (net TE = {net_te:.4f})"
    if net_te < -0.01:
        return "INFLUENCED", f"Y → X (net TE = {-net_te:.4f})"
    return "NEUTRAL", f"Weak causal link (net TE = {net_te:.4f})"


def transfer_entropy_analysis(
    x: list[float],
    y: list[float],
    k: int = DEFAULT_K,
    l: int = DEFAULT_L,
    n_bins: int = DEFAULT_N_BINS,
    n_surrogates: int = DEFAULT_SURROGATES,
    seed: int | None = None,
) -> TransferEntropyResult | None:
    """Bidirectional transfer entropy analysis. None if insufficient data."""
    if not x or not y or len(x) < MIN_TUPLES + 2 or len(y) < MIN_TUPLES + 2:
        return None

    n = min(len(x), len(y))
    x = x[-n:]
    y = y[-n:]

    te_xy = transfer_entropy(x, y, k, l, n_bins)
    te_yx = transfer_entropy(y, x, k, l, n_bins)
    surrogate_xy = surrogate_te(x, y, k, l, n_bins, n_surrogates, seed)
    surrogate_yx = surrogate_te(y, x, k, l, n_bins, n_surrogates, seed)

    net_te = te_xy - te_yx
    ete = (te_xy - surrogate_xy + te_yx - surrogate_yx) / 2
    signal, reason = te_signal(net_te)

    return TransferEntropyResult(
        te_xy=te_xy,
        te_yx=te_yx,
        net_te=net_te,
        surrogate_xy=surrogate_xy,
        surrogate_yx=surrogate_yx,
        ete=ete,
        signal=signal,
        reason=reason,
        n_tuples=n - max(k, l) - 1,
    )
