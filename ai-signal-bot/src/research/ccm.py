"""Empirical Dynamic Modeling (EDM) with Convergent Cross Mapping (CCM).

Implements Takens' embedding theorem and CCM for detecting causal
relationships in dynamical systems without parametric models.
"""
from __future__ import annotations

import math

MIN_PRICES = 50
DEFAULT_MAX_TAU = 20
DEFAULT_MAX_E = 10
DEFAULT_FORECAST_STEPS = 5
MI_BINS = 10
FNN_THRESHOLD = 0.05


class EDMResult:
    """Container for EDM analysis results."""

    def __init__(
        self,
        mis: list[float],
        opt_tau: int,
        fnn_ratios: list[float],
        opt_e: int,
        forecasts: list[dict],
        forecast_rho: float,
        ccm_results: list[dict] | None,
        ccm_target: str | None,
        signal: str,
        reason: str,
    ) -> None:
        self.mis = mis
        self.opt_tau = opt_tau
        self.fnn_ratios = fnn_ratios
        self.opt_e = opt_e
        self.forecasts = forecasts
        self.forecast_rho = forecast_rho
        self.ccm_results = ccm_results
        self.ccm_target = ccm_target
        self.signal = signal
        self.reason = reason


def mutual_info(x: list[float], max_tau: int = DEFAULT_MAX_TAU) -> dict:
    """Mutual information for optimal time delay (first minimum)."""
    n = len(x)
    mis: list[float] = []
    for tau in range(1, max_tau + 1):
        x1 = x[: n - tau]
        x2 = x[tau:]
        min_v = min(x)
        max_v = max(x)
        bin_w = (max_v - min_v) / MI_BINS
        if bin_w == 0:
            mis.append(0.0)
            continue
        bins1 = [min(MI_BINS - 1, int((v - min_v) / bin_w)) for v in x1]
        bins2 = [min(MI_BINS - 1, int((v - min_v) / bin_w)) for v in x2]

        mi = 0.0
        for i in range(MI_BINS):
            for j in range(MI_BINS):
                pxy = sum(1 for k in range(len(x1)) if bins1[k] == i and bins2[k] == j) / len(x1)
                px = sum(1 for b in bins1 if b == i) / len(x1)
                py = sum(1 for b in bins2 if b == j) / len(x2)
                if pxy > 0 and px > 0 and py > 0:
                    mi += pxy * math.log(pxy / (px * py))
        mis.append(mi)

    opt_tau = 1
    for i in range(1, len(mis) - 1):
        if mis[i] < mis[i - 1] and mis[i] < mis[i + 1]:
            opt_tau = i + 1
            break
    return {"mis": mis, "opt_tau": opt_tau}


def false_nearest_neighbors(x: list[float], tau: int, max_e: int = DEFAULT_MAX_E) -> dict:
    """False nearest neighbors ratio for optimal embedding dimension."""
    n = len(x)
    fnn_ratios: list[float] = []
    for e in range(1, max_e + 1):
        n_embed = n - e * tau
        if n_embed <= 0:
            fnn_ratios.append(0.0)
            continue
        false_count = 0
        total_pairs = 0
        for i in range(n_embed):
            min_dist = math.inf
            nn_idx = -1
            for j in range(n_embed):
                if j == i:
                    continue
                dist = math.sqrt(sum((x[i + k * tau] - x[j + k * tau]) ** 2 for k in range(e)))
                if dist < min_dist:
                    min_dist = dist
                    nn_idx = j
            if nn_idx >= 0 and min_dist > 0:
                dist_e1 = abs(x[i + e * tau] - x[nn_idx + e * tau])
                ratio = dist_e1 / min_dist
                scale = math.sqrt(sum(v * v for v in x) / n)
                if ratio > 10 or (dist_e1 / scale) > 2:
                    false_count += 1
                total_pairs += 1
        fnn_ratios.append(false_count / total_pairs if total_pairs > 0 else 0.0)

    opt_e = 2
    for e in range(1, len(fnn_ratios) + 1):
        if fnn_ratios[e - 1] < FNN_THRESHOLD:
            opt_e = e
            break
    return {"fnn_ratios": fnn_ratios, "opt_e": opt_e}


def embed(x: list[float], e: int, tau: int) -> list[list[float]]:
    """Time delay embedding."""
    n = len(x)
    n_embed = n - (e - 1) * tau
    return [[x[i + k * tau] for k in range(e)] for i in range(n_embed)]


def simplex_forecast(
    x: list[float],
    e: int,
    tau: int,
    t_pred: int,
    lib_size: int,
) -> float | None:
    """Simplex projection forecast via E+1 nearest neighbors."""
    embedded = embed(x, e, tau)
    n = len(embedded)
    lib_end = min(lib_size, n - 1)
    if t_pred >= n or lib_end <= 0:
        return None
    target = embedded[t_pred]

    distances: list[dict] = []
    for i in range(lib_end):
        if i == t_pred:
            continue
        dist = math.sqrt(sum((target[k] - embedded[i][k]) ** 2 for k in range(e)))
        distances.append({"idx": i, "dist": dist})
    distances.sort(key=lambda d: d["dist"])
    neighbors = distances[: e + 1]

    if len(neighbors) < 2:
        return None

    min_dist = neighbors[0]["dist"] or 0.001
    weights = [math.exp(-nb["dist"] / min_dist) for nb in neighbors]
    total_w = sum(weights)

    pred = 0.0
    for i, nb in enumerate(neighbors):
        future_idx = nb["idx"] + 1
        if future_idx < len(x):
            pred += (weights[i] / total_w) * x[future_idx + (e - 1) * tau]
    return pred


def ccm(
    x: list[float],
    y: list[float],
    e: int,
    tau: int,
    lib_sizes: list[int],
) -> list[dict]:
    """Convergent cross mapping: does X causally influence Y?"""
    n = len(x)
    results: list[dict] = []
    embedded_y = embed(y, e, tau)
    n_embed = len(embedded_y)

    for lib_size in lib_sizes:
        actual_lib = min(lib_size, n - e * tau)
        if actual_lib < e + 2:
            continue

        estimated_x: list[float] = []
        actual_x: list[float] = []
        for t in range(n_embed):
            if t >= actual_lib:
                continue
            distances: list[dict] = []
            for i in range(actual_lib):
                if i == t:
                    continue
                dist = math.sqrt(sum((embedded_y[t][k] - embedded_y[i][k]) ** 2 for k in range(e)))
                distances.append({"idx": i, "dist": dist})
            distances.sort(key=lambda d: d["dist"])
            neighbors = distances[: e + 1]
            if len(neighbors) < 2:
                continue

            min_dist = neighbors[0]["dist"] or 0.001
            weights = [math.exp(-nb["dist"] / min_dist) for nb in neighbors]
            total_w = sum(weights)

            est_x = 0.0
            for i, nb in enumerate(neighbors):
                x_idx = nb["idx"] + (e - 1) * tau
                if x_idx < len(x):
                    est_x += (weights[i] / total_w) * x[x_idx]
            estimated_x.append(est_x)
            actual_x.append(x[t + (e - 1) * tau])

        if len(estimated_x) > 2:
            rho = _correlation(estimated_x, actual_x)
            results.append({"lib_size": actual_lib, "rho": rho})

    return results


def _correlation(a: list[float], b: list[float]) -> float:
    """Pearson correlation coefficient."""
    mean_a = sum(a) / len(a)
    mean_b = sum(b) / len(b)
    num = sum((a[i] - mean_a) * (b[i] - mean_b) for i in range(len(a)))
    den_a = math.sqrt(sum((v - mean_a) ** 2 for v in a))
    den_b = math.sqrt(sum((v - mean_b) ** 2 for v in b))
    return num / (den_a * den_b + 1e-10)


def edm_signal(predicted: float) -> tuple[str, str]:
    """Trading signal from simplex forecast."""
    if predicted > 0.002:
        return "BUY", f"Simplex forecast: +{predicted * 100:.3f}%"
    if predicted < -0.002:
        return "SELL", f"Simplex forecast: {predicted * 100:.3f}%"
    return "NEUTRAL", f"Forecast: {predicted * 100:.3f}%"


def edm_analysis(
    returns: list[float],
    max_e: int = DEFAULT_MAX_E,
    max_tau: int = DEFAULT_MAX_TAU,
    forecast_steps: int = DEFAULT_FORECAST_STEPS,
) -> EDMResult | None:
    """Full EDM analysis of a return series. None if insufficient data."""
    if not returns or len(returns) < MIN_PRICES:
        return None

    mi_result = mutual_info(returns, max_tau)
    opt_tau = mi_result["opt_tau"]
    fnn_result = false_nearest_neighbors(returns, opt_tau, max_e)
    opt_e = fnn_result["opt_e"]

    n = len(returns)
    lib_size = n - forecast_steps - opt_e * opt_tau
    forecasts: list[dict] = []
    for s in range(forecast_steps):
        t_pred = lib_size + s
        pred = simplex_forecast(returns, opt_e, opt_tau, t_pred, lib_size)
        if pred is not None:
            forecasts.append(
                {"step": s + 1, "predicted": pred, "actual": returns[t_pred + (opt_e - 1) * opt_tau]}
            )

    forecast_rho = 0.0
    if len(forecasts) > 2:
        preds = [f["predicted"] for f in forecasts]
        actuals = [f["actual"] for f in forecasts]
        forecast_rho = _correlation(preds, actuals)

    last_forecast = forecasts[-1] if forecasts else None
    if last_forecast:
        signal, reason = edm_signal(last_forecast["predicted"])
        reason += f" (E={opt_e}, τ={opt_tau})"
    else:
        signal, reason = "NEUTRAL", "No forecast available"

    return EDMResult(
        mis=mi_result["mis"],
        opt_tau=opt_tau,
        fnn_ratios=fnn_result["fnn_ratios"],
        opt_e=opt_e,
        forecasts=forecasts,
        forecast_rho=forecast_rho,
        ccm_results=None,
        ccm_target=None,
        signal=signal,
        reason=reason,
    )


def edm_ccm_analysis(
    returns_x: list[float],
    returns_y: list[float],
    max_e: int = DEFAULT_MAX_E,
    max_tau: int = DEFAULT_MAX_TAU,
    lib_sizes: list[int] | None = None,
) -> dict | None:
    """CCM causality test between two return series. None if insufficient data."""
    if not returns_x or not returns_y or len(returns_x) < MIN_PRICES or len(returns_y) < MIN_PRICES:
        return None

    n = min(len(returns_x), len(returns_y))
    x = returns_x[-n:]
    y = returns_y[-n:]

    mi_result = mutual_info(x, max_tau)
    opt_tau = mi_result["opt_tau"]
    opt_e = false_nearest_neighbors(x, opt_tau, max_e)["opt_e"]

    if lib_sizes is None:
        lib_sizes = [20, 30, 40, 50, 60, 70, 80, min(100, n - opt_e * opt_tau)]
    results = ccm(x, y, opt_e, opt_tau, lib_sizes)
    return {"results": results, "opt_e": opt_e, "opt_tau": opt_tau}
