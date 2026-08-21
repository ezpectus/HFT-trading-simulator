"""Markov-Switching GARCH (MS-GARCH) — regime-switching volatility model.

Combines a hidden Markov chain with GARCH volatility: each regime has its
own GARCH parameters, capturing that volatility dynamics differ between
market states (calm vs crisis).

    Regime s_t in {0, ..., K-1} follows a Markov chain:
        P(s_t = j | s_{t-1} = i) = p_ij

    In regime s_t = k, returns follow:
        r_t = mu_k + eps_t,  eps_t ~ N(0, h_t)
        h_t = omega_k + alpha_k * eps^2_{t-1} + beta_k * h_{t-1}

Estimation uses Kim's filtering approach:
    1. Run a GARCH filter for each regime
    2. Combine with the Hamilton filter for regime probabilities
    3. Smooth via Kim's approximation

Ported from UI-only MarkovSwitchingGARCH.jsx into trading logic.
Reference: future_development.md §0.1 — high priority model.
"""
from __future__ import annotations

import math

MIN_VARIANCE = 1e-10
MIN_PROB = 1e-10
ANNUALIZATION = 252
DEFAULT_N_REGIMES = 2
MIN_RETURNS = 10


class MSRegime:
    """Per-regime GARCH parameters."""

    def __init__(
        self,
        mu: float,
        omega: float,
        alpha: float,
        beta: float,
        h0: float,
        label: str,
    ) -> None:
        self.mu = mu
        self.omega = omega
        self.alpha = alpha
        self.beta = beta
        self.h0 = h0
        self.label = label


class MSResult:
    """Container for Markov-Switching GARCH estimation results.

    Volatilities are annualized decimals (e.g. 0.25 = 25%), mirroring the UI.
    """

    def __init__(
        self,
        filtered_prob: list[list[float]],
        smoothed_prob: list[list[float]],
        h: list[list[float]],
        combined_vol: list[float],
        current_regime: int,
        current_prob: float,
        total_log_lik: float,
        regime_labels: list[str],
        transition: list[list[float]],
        regimes: list[MSRegime],
        expected_duration: float,
        regime_vols: list[float],
        current_vol: float,
        transitions: list[dict],
        n: int,
    ) -> None:
        self.filtered_prob = filtered_prob
        self.smoothed_prob = smoothed_prob
        self.h = h
        self.combined_vol = combined_vol
        self.current_regime = current_regime
        self.current_prob = current_prob
        self.total_log_lik = total_log_lik
        self.regime_labels = regime_labels
        self.transition = transition
        self.regimes = regimes
        self.expected_duration = expected_duration
        self.regime_vols = regime_vols
        self.current_vol = current_vol
        self.transitions = transitions
        self.n = n


def garch_filter(
    returns: list[float],
    omega: float,
    alpha: float,
    beta: float,
    h0: float,
) -> list[float]:
    """Per-regime GARCH variance path: h_t = omega + alpha*r^2_{t-1} + beta*h_{t-1}."""
    n = len(returns)
    h = [0.0] * n
    h[0] = h0 if h0 and h0 > 0 else returns[0] * returns[0]
    for t in range(1, n):
        h[t] = omega + alpha * returns[t - 1] * returns[t - 1] + beta * h[t - 1]
        if h[t] < MIN_VARIANCE:
            h[t] = MIN_VARIANCE
    return h


def gaussian_log_pdf(x: float, mean: float, var_: float) -> float:
    """Gaussian log density: -0.5*ln(2*pi*var) - (x-mean)^2 / (2*var)."""
    if var_ <= 0:
        return -math.inf
    return -0.5 * math.log(2 * math.pi * var_) - (x - mean) * (x - mean) / (2 * var_)


def _predict_probabilities(
    transition: list[list[float]],
    filtered_prob: list[float],
) -> list[float]:
    """Predicted regime probabilities: P(s_t=j|F_{t-1}) = sum_i p_ij * P(s_{t-1}=i)."""
    n_regimes = len(filtered_prob)
    pred = [0.0] * n_regimes
    for j in range(n_regimes):
        for i in range(n_regimes):
            pred[j] += transition[i][j] * filtered_prob[i]
    return pred


def _smooth_probabilities(
    filtered_prob: list[list[float]],
    transition: list[list[float]],
    n_regimes: int,
) -> list[list[float]]:
    """Kim's approximation: backward smoothing of regime probabilities."""
    n = len(filtered_prob)
    smoothed = [[0.0] * n_regimes for _ in range(n)]
    smoothed[n - 1] = filtered_prob[n - 1][:]

    for t in range(n - 2, -1, -1):
        for k in range(n_regimes):
            total = 0.0
            for j in range(n_regimes):
                if filtered_prob[t + 1][j] > 0:
                    total += transition[k][j] * smoothed[t + 1][j] / filtered_prob[t + 1][j]
            smoothed[t][k] = filtered_prob[t][k] * total
        total = sum(smoothed[t])
        if total > 0:
            for k in range(n_regimes):
                smoothed[t][k] /= total

    return smoothed


def ms_garch_filter(
    returns: list[float],
    transition: list[list[float]],
    regimes: list[MSRegime],
) -> MSResult:
    """Run Kim's filter for Markov-Switching GARCH on a return series."""
    n = len(returns)
    n_regimes = len(regimes)

    h = [garch_filter(returns, r.omega, r.alpha, r.beta, r.h0) for r in regimes]

    filtered_prob = [[0.0] * n_regimes for _ in range(n)]
    log_lik = [0.0] * n
    filtered_prob[0] = [1.0 / n_regimes] * n_regimes

    for t in range(1, n):
        pred_prob = _predict_probabilities(transition, filtered_prob[t - 1])
        regime_ll = [
            math.exp(gaussian_log_pdf(returns[t], regimes[k].mu, h[k][t]))
            for k in range(n_regimes)
        ]
        total_ll = sum(pred_prob[k] * regime_ll[k] for k in range(n_regimes))
        log_lik[t] = math.log(max(MIN_PROB, total_ll))
        for k in range(n_regimes):
            if total_ll > 0:
                filtered_prob[t][k] = pred_prob[k] * regime_ll[k] / total_ll
            else:
                filtered_prob[t][k] = 1.0 / n_regimes

    smoothed_prob = _smooth_probabilities(filtered_prob, transition, n_regimes)

    combined_vol = [
        sum(smoothed_prob[t][k] * math.sqrt(h[k][t]) for k in range(n_regimes))
        for t in range(n)
    ]

    current_regime = max(range(n_regimes), key=lambda k: smoothed_prob[n - 1][k])
    current_prob = smoothed_prob[n - 1][current_regime]
    total_log_lik = sum(log_lik)

    annual = math.sqrt(ANNUALIZATION)
    regime_vols = [math.sqrt(h[k][n - 1]) * annual for k in range(n_regimes)]
    current_vol = combined_vol[n - 1] * annual

    stay_prob = transition[current_regime][current_regime]
    expected_duration = 1.0 / (1.0 - stay_prob) if stay_prob < 1 else math.inf

    return MSResult(
        filtered_prob=filtered_prob,
        smoothed_prob=smoothed_prob,
        h=h,
        combined_vol=combined_vol,
        current_regime=current_regime,
        current_prob=current_prob,
        total_log_lik=total_log_lik,
        regime_labels=[r.label for r in regimes],
        transition=transition,
        regimes=regimes,
        expected_duration=expected_duration,
        regime_vols=regime_vols,
        current_vol=current_vol,
        transitions=detect_regime_transitions(smoothed_prob),
        n=n,
    )


def _param_sets(mean_r: float, var_r: float) -> list[tuple[list[list[float]], list[MSRegime]]]:
    """Candidate 2-regime parameter sets (mirrors UI grid search)."""
    return [
        (
            [[0.95, 0.05], [0.05, 0.95]],
            [
                MSRegime(mean_r * 0.5, var_r * 0.02, 0.05, 0.9, var_r, "Calm"),
                MSRegime(mean_r, var_r * 0.1, 0.15, 0.8, var_r * 2, "Volatile"),
            ],
        ),
        (
            [[0.97, 0.03], [0.10, 0.90]],
            [
                MSRegime(mean_r * 0.3, var_r * 0.01, 0.03, 0.93, var_r, "Calm"),
                MSRegime(mean_r, var_r * 0.15, 0.20, 0.75, var_r * 3, "Crisis"),
            ],
        ),
        (
            [[0.90, 0.10], [0.15, 0.85]],
            [
                MSRegime(mean_r * 0.5, var_r * 0.03, 0.08, 0.88, var_r, "Calm"),
                MSRegime(-abs(mean_r), var_r * 0.2, 0.25, 0.7, var_r * 4, "Crisis"),
            ],
        ),
    ]


def estimate_params(
    returns: list[float],
    n_regimes: int = DEFAULT_N_REGIMES,
) -> tuple[list[list[float]], list[MSRegime]] | None:
    """Grid search over 2-regime parameter sets, returning the best (transition, regimes)."""
    if not returns or len(returns) < MIN_RETURNS or n_regimes != DEFAULT_N_REGIMES:
        return None

    mean_r = sum(returns) / len(returns)
    var_r = sum((r - mean_r) * (r - mean_r) for r in returns) / len(returns)
    if var_r <= 0:
        var_r = MIN_VARIANCE

    best = None
    best_ll = -math.inf
    for transition, regimes in _param_sets(mean_r, var_r):
        result = ms_garch_filter(returns, transition, regimes)
        if result.total_log_lik > best_ll:
            best_ll = result.total_log_lik
            best = (transition, regimes)

    return best


def fit_ms_garch(
    returns: list[float],
    n_regimes: int = DEFAULT_N_REGIMES,
) -> MSResult | None:
    """Estimate the best 2-regime MS-GARCH and run Kim's filter. None if insufficient data."""
    if not returns or len(returns) < MIN_RETURNS:
        return None
    best = estimate_params(returns, n_regimes)
    if best is None:
        return None
    transition, regimes = best
    return ms_garch_filter(returns, transition, regimes)


def simple_returns(prices: list[float]) -> list[float]:
    """Simple returns: r_t = (P_t - P_{t-1}) / P_{t-1}. Non-positive prices skipped."""
    result: list[float] = []
    for i in range(1, len(prices)):
        if prices[i - 1] > 0:
            result.append((prices[i] - prices[i - 1]) / prices[i - 1])
    return result


def ms_garch_volatility(
    prices: list[float],
    n_regimes: int = DEFAULT_N_REGIMES,
) -> MSResult | None:
    """Fit MS-GARCH directly on a price series (simple returns computed internally)."""
    if not prices or len(prices) < MIN_RETURNS + 1:
        return None
    returns = simple_returns(prices)
    return fit_ms_garch(returns, n_regimes)


def expected_regime_duration(transition: list[list[float]], regime: int) -> float:
    """Expected duration of a regime: 1 / (1 - p_ii)."""
    stay_prob = transition[regime][regime]
    return 1.0 / (1.0 - stay_prob) if stay_prob < 1 else math.inf


def detect_regime_transitions(smoothed_prob: list[list[float]]) -> list[dict]:
    """Detect regime switches from smoothed probabilities (argmax per step)."""
    transitions: list[dict] = []
    if not smoothed_prob:
        return transitions
    prev_regime = max(range(len(smoothed_prob[0])), key=lambda k: smoothed_prob[0][k])
    for t in range(1, len(smoothed_prob)):
        regime = max(range(len(smoothed_prob[t])), key=lambda k: smoothed_prob[t][k])
        if regime != prev_regime:
            transitions.append({"time": t, "from": prev_regime, "to": regime})
            prev_regime = regime
    return transitions


def regime_signal(current_regime: int, current_prob: float, labels: list[str]) -> tuple[str, str]:
    """Trading signal from the current regime: regime 0 (calm) -> BUY, else SELL."""
    if current_regime == 0:
        return "BUY", f"Calm regime (P={current_prob * 100:.1f}%), low volatility"
    label = labels[current_regime] if current_regime < len(labels) else "Volatile"
    return "SELL", f"{label} regime (P={current_prob * 100:.1f}%), high volatility"
