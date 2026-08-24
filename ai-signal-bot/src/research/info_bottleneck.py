"""Information Bottleneck (rate-distortion optimization).

Finds optimal compression of return signals by trading off information
preservation against complexity.
"""
from __future__ import annotations

import math
import random

from src.research._common import compute_returns, quantize

MIN_PRICES = 50
DEFAULT_N_CLUSTERS = 4
DEFAULT_BETA = 5.0
DEFAULT_N_BINS = 10
DEFAULT_LOOKBACK = 100
DEFAULT_LAG = 1
DEFAULT_SEED = 42
BETA_VALUES = [0.1, 0.5, 1, 2, 5, 10, 20, 50]


class IbResult:
    """Container for Information Bottleneck analysis results."""

    def __init__(
        self,
        i_xt: float,
        i_ty: float,
        assignments: list[int],
        clusters: list[dict],
        history: list[dict],
        ptx: list[list[float]],
        n_clusters: int,
        beta: float,
        rd_curve: list[dict],
        current_return: float,
        current_cluster: int,
        cluster_info: dict,
        signal: str,
        reason: str,
        returns: list[float],
        xq: list[int],
        yq: list[int],
    ) -> None:
        self.i_xt = i_xt
        self.i_ty = i_ty
        self.assignments = assignments
        self.clusters = clusters
        self.history = history
        self.ptx = ptx
        self.n_clusters = n_clusters
        self.beta = beta
        self.rd_curve = rd_curve
        self.current_return = current_return
        self.current_cluster = current_cluster
        self.cluster_info = cluster_info
        self.signal = signal
        self.reason = reason
        self.returns = returns
        self.xq = xq
        self.yq = yq


def kl_divergence(p: list[float], q: list[float]) -> float:
    """KL divergence D(p || q) in bits."""
    kl = 0.0
    for i in range(len(p)):
        if p[i] > 0 and q[i] > 0:
            kl += p[i] * math.log2(p[i] / q[i])
    return kl


def information_bottleneck(
    x: list[int],
    y: list[int],
    n_clusters: int,
    beta: float,
    max_iter: int = 100,
    rng: random.Random | None = None,
) -> dict:
    """Information Bottleneck via Blahut-Arimoto iteration."""
    n = len(x)
    n_x_states = max(x) + 1
    n_y_states = max(y) + 1

    # Compute p(x), p(y|x)
    px = [0.0] * n_x_states
    pyx = [[0.0] * n_y_states for _ in range(n_x_states)]
    x_counts = [0] * n_x_states

    for i in range(n):
        px[x[i]] += 1
        pyx[x[i]][y[i]] += 1
        x_counts[x[i]] += 1
    for xv in range(n_x_states):
        px[xv] /= n
        for yv in range(n_y_states):
            pyx[xv][yv] = pyx[xv][yv] / x_counts[xv] if x_counts[xv] > 0 else 0.0

    # Compute p(y)
    py = [0.0] * n_y_states
    for xv in range(n_x_states):
        for yv in range(n_y_states):
            py[yv] += px[xv] * pyx[xv][yv]

    # Initialize p(t|x) uniformly with noise
    if rng is None:
        rng = random.Random()
    ptx = []
    for _ in range(n_x_states):
        row = [rng.random() + 0.1 for _ in range(n_clusters)]
        total = sum(row)
        ptx.append([v / total for v in row])

    i_xt = 0.0
    i_ty = 0.0
    history = []

    for _ in range(max_iter):
        # Update p(t) = Σ_x p(x)·p(t|x)
        pt = [0.0] * n_clusters
        for t in range(n_clusters):
            for xv in range(n_x_states):
                pt[t] += px[xv] * ptx[xv][t]

        # Update p(y|t) = Σ_x p(y|x)·p(x,t)/p(t)
        pyt = [[0.0] * n_y_states for _ in range(n_clusters)]
        for t in range(n_clusters):
            if pt[t] <= 0:
                continue
            for xv in range(n_x_states):
                pxt = ptx[xv][t] * px[xv] / pt[t]
                for yv in range(n_y_states):
                    pyt[t][yv] += pyx[xv][yv] * pxt
            total = sum(pyt[t])
            if total > 0:
                for yv in range(n_y_states):
                    pyt[t][yv] /= total

        # Update p(t|x) = p(t)·exp(-β·D_KL[p(y|x)||p(y|t)]) / Z(x,β)
        for xv in range(n_x_states):
            new_row = [0.0] * n_clusters
            z = 0.0
            for t in range(n_clusters):
                kl = kl_divergence(pyx[xv], pyt[t])
                new_row[t] = pt[t] * math.exp(-beta * kl)
                z += new_row[t]
            if z > 0:
                for t in range(n_clusters):
                    ptx[xv][t] = new_row[t] / z

        # Compute I(X;T) and I(T;Y)
        i_xt = 0.0
        for xv in range(n_x_states):
            for t in range(n_clusters):
                pxt = px[xv] * ptx[xv][t]
                if pxt > 0 and pt[t] > 0:
                    i_xt += pxt * math.log2(ptx[xv][t] / pt[t])

        i_ty = 0.0
        for t in range(n_clusters):
            for yv in range(n_y_states):
                pty = pt[t] * pyt[t][yv]
                if pty > 0 and py[yv] > 0:
                    i_ty += pty * math.log2(pyt[t][yv] / py[yv])

        history.append({"iter": len(history), "i_xt": max(0.0, i_xt), "i_ty": max(0.0, i_ty)})

    # Assign clusters
    assignments = []
    for xv in x:
        max_p = 0.0
        idx = 0
        for t in range(n_clusters):
            if ptx[xv][t] > max_p:
                max_p = ptx[xv][t]
                idx = t
        assignments.append(idx)

    # Cluster statistics
    clusters = []
    for t in range(n_clusters):
        members = [xv for i, xv in enumerate(x) if assignments[i] == t]
        if not members:
            clusters.append({"t": t, "size": 0, "mean_x": 0.0, "mean_y": 0.0})
            continue
        mean_x = sum(members) / len(members)
        y_members = [yv for i, yv in enumerate(y) if assignments[i] == t]
        mean_y = sum(y_members) / len(y_members)
        clusters.append({"t": t, "size": len(members), "mean_x": mean_x, "mean_y": mean_y})

    return {
        "i_xt": max(0.0, i_xt),
        "i_ty": max(0.0, i_ty),
        "assignments": assignments,
        "clusters": clusters,
        "history": history,
        "ptx": ptx,
        "n_clusters": n_clusters,
        "beta": beta,
    }


def ib_signal(mean_y: float, n_bins: int) -> tuple[str, str]:
    """Signal from the current cluster's mean future return bin."""
    if mean_y > n_bins / 2:
        return "BUY", f"mean future return = {mean_y / n_bins:.2f} (positive)"
    if mean_y < n_bins / 2:
        return "SELL", f"mean future return = {mean_y / n_bins:.2f} (negative)"
    return "NEUTRAL", "neutral future return"


def ib_analysis(
    prices: list[float],
    n_clusters: int = DEFAULT_N_CLUSTERS,
    beta: float = DEFAULT_BETA,
    n_bins: int = DEFAULT_N_BINS,
    lookback: int = DEFAULT_LOOKBACK,
    lag: int = DEFAULT_LAG,
    seed: int = DEFAULT_SEED,
) -> IbResult | None:
    """Full Information Bottleneck analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + lag + 1:
        return None

    prices = prices[-(lookback + lag):]
    returns = compute_returns(prices)

    # X = current return, Y = future return (lag steps ahead)
    x = returns[: len(returns) - lag]
    y = returns[lag:]

    # Quantize
    xq = quantize(x, n_bins)
    yq = quantize(y, n_bins)

    rng = random.Random(seed)

    # Rate-distortion curve for multiple beta values
    rd_curve = []
    for b in BETA_VALUES:
        result = information_bottleneck(xq, yq, n_clusters, b, 50, rng)
        rd_curve.append({"beta": b, "i_xt": result["i_xt"], "i_ty": result["i_ty"]})

    # Main result with selected beta
    result = information_bottleneck(xq, yq, n_clusters, beta, 100, rng)

    # Signal: which cluster does the current return belong to?
    current_return = returns[-1]
    current_x = quantize([current_return], n_bins)[0]
    current_cluster = 0
    max_p = 0.0
    for t in range(n_clusters):
        if result["ptx"][current_x][t] > max_p:
            max_p = result["ptx"][current_x][t]
            current_cluster = t

    cluster_info = result["clusters"][current_cluster]
    signal = "NEUTRAL"
    reason = ""
    if cluster_info["size"] > 0:
        signal, reason = ib_signal(cluster_info["mean_y"], n_bins)

    return IbResult(
        i_xt=result["i_xt"],
        i_ty=result["i_ty"],
        assignments=result["assignments"],
        clusters=result["clusters"],
        history=result["history"],
        ptx=result["ptx"],
        n_clusters=n_clusters,
        beta=beta,
        rd_curve=rd_curve,
        current_return=current_return,
        current_cluster=current_cluster,
        cluster_info=cluster_info,
        signal=signal,
        reason=reason,
        returns=returns,
        xq=xq,
        yq=yq,
    )
