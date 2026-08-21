"""Bayesian Price Predictor with conjugate priors.

Estimates the probability of price direction and magnitude using four
Bayesian models: Beta-Binomial, Normal-Inverse-Gamma, BOCPD, and
Bayesian Ridge regression.
"""
from __future__ import annotations

import math

MIN_PRICES = 30
DEFAULT_PRIOR_STRENGTH = 10
DEFAULT_LOOKBACK = 20
DEFAULT_HAZARD_RATE = 100
DEFAULT_N_ITER = 50


class BayesianPriceResult:
    """Container for Bayesian price prediction results."""

    def __init__(
        self,
        p_up: float,
        p_down: float,
        alpha: float,
        beta: float,
        ci_low: float,
        ci_high: float,
        post_mean: float,
        post_std: float,
        changepoints: list[int],
        run_lengths: list[int],
        weights: list[float],
        noise_sigma: float,
        next_pred: float,
        next_ci: float,
        r_squared: float,
        signal: str,
        signal_reason: str,
        current_price: float,
        predicted_price: float,
        predicted_low: float,
        predicted_high: float,
    ) -> None:
        self.p_up = p_up
        self.p_down = p_down
        self.alpha = alpha
        self.beta = beta
        self.ci_low = ci_low
        self.ci_high = ci_high
        self.post_mean = post_mean
        self.post_std = post_std
        self.changepoints = changepoints
        self.run_lengths = run_lengths
        self.weights = weights
        self.noise_sigma = noise_sigma
        self.next_pred = next_pred
        self.next_ci = next_ci
        self.r_squared = r_squared
        self.signal = signal
        self.signal_reason = signal_reason
        self.current_price = current_price
        self.predicted_price = predicted_price
        self.predicted_low = predicted_low
        self.predicted_high = predicted_high


def log_gamma(z: float) -> float:
    """Lanczos log-gamma approximation."""
    c = [76.1800917294715, -86.5053203294168, 24.0140982408309,
         -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
    y = z
    tmp = z + 5.5 - (z + 0.5) * math.log(z + 5.5)
    ser = 1.000000000190015
    for j in range(6):
        y += 1
        ser += c[j] / y
    return -tmp + math.log(2.506628274631 * ser / z)


def beta_pdf(x: float, alpha: float, beta: float) -> float:
    """Beta distribution PDF."""
    if x <= 0 or x >= 1:
        return 0.0
    log_b = log_gamma(alpha) + log_gamma(beta) - log_gamma(alpha + beta)
    return math.exp((alpha - 1) * math.log(x) + (beta - 1) * math.log(1 - x) - log_b)


def beta_cdf_inv(p: float, alpha: float, beta: float) -> float:
    """Inverse Beta CDF via bisection with Riemann-sum CDF approximation."""
    if p <= 0:
        return 0.0
    if p >= 1:
        return 1.0
    lo = 0.0
    hi = 1.0
    steps = 200
    for _ in range(50):
        mid = (lo + hi) / 2
        cdf = sum(beta_pdf((i / steps) * mid, alpha, beta) * (mid / steps) for i in range(1, steps + 1))
        if cdf < p:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def normal_pdf(x: float, mu: float, sigma: float) -> float:
    """Normal distribution PDF."""
    if sigma <= 0:
        return 0.0
    return math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * math.sqrt(2 * math.pi))


def bocpd(returns: list[float], hazard: float = 0.01) -> dict:
    """Simplified Bayesian Online Changepoint Detection."""
    n = len(returns)
    if n < 5:
        return {"changepoints": [], "run_lengths": [], "probabilities": []}

    run_lengths = [0] * n
    probabilities = [0.0] * n
    best_run = 0
    changepoints: list[int] = []

    for t in range(1, n):
        window = returns[max(0, t - best_run - 1) : t]
        mean = sum(window) / max(1, len(window))
        variance = (
            sum((r - mean) ** 2 for r in window) / len(window)
            if len(window) > 1
            else 0.0001
        )
        sigma = math.sqrt(variance + 1e-8)
        pred_prob = normal_pdf(returns[t], mean, sigma)
        cp_prob = hazard

        if pred_prob < 0.01 or cp_prob > pred_prob * 0.5:
            if best_run > 5:
                changepoints.append(t)
            best_run = 0
        else:
            best_run += 1

        run_lengths[t] = best_run
        probabilities[t] = pred_prob

    return {"changepoints": changepoints, "run_lengths": run_lengths, "probabilities": probabilities}


def _gaussian_elimination(a: list[list[float]], rhs: list[float]) -> list[float]:
    """Solve a linear system via Gaussian elimination with partial pivoting."""
    d = len(rhs)
    for col in range(d):
        max_row = col
        for r in range(col + 1, d):
            if abs(a[r][col]) > abs(a[max_row][col]):
                max_row = r
        a[col], a[max_row] = a[max_row], a[col]
        rhs[col], rhs[max_row] = rhs[max_row], rhs[col]
        if abs(a[col][col]) < 1e-12:
            continue
        for r in range(col + 1, d):
            factor = a[r][col] / a[col][col]
            for c in range(col, d):
                a[r][c] -= factor * a[col][c]
            rhs[r] -= factor * rhs[col]

    weights = [0.0] * d
    for r in range(d - 1, -1, -1):
        total = rhs[r]
        for c in range(r + 1, d):
            total -= a[r][c] * weights[c]
        weights[r] = total / a[r][r] if abs(a[r][r]) > 1e-12 else 0.0
    return weights


def bayesian_ridge(
    x: list[list[float]],
    y: list[float],
    n_iter: int = DEFAULT_N_ITER,
) -> dict:
    """Bayesian Ridge regression with EM update of precisions."""
    n = len(x)
    d = len(x[0]) if x else 0
    if n < 5 or d == 0:
        return {"weights": [0.0] * d, "sigma": 1.0, "predictions": [], "alpha": 1.0, "beta": 1.0}

    alpha = 1.0
    beta = 1.0
    weights = [0.0] * d
    predictions = [0.0] * n

    for _ in range(n_iter):
        xtx = [[0.0] * d for _ in range(d)]
        xty = [0.0] * d
        for i in range(n):
            for a in range(d):
                xty[a] += x[i][a] * y[i]
                for b in range(d):
                    xtx[a][b] += x[i][a] * x[i][b]

        a_mat = [[beta * v + (alpha if a == b else 0.0) for b, v in enumerate(row)] for a, row in enumerate(xtx)]
        rhs = [beta * v for v in xty]
        weights = _gaussian_elimination(a_mat, rhs)

        residual_ss = 0.0
        for i in range(n):
            pred = sum(x[i][j] * weights[j] for j in range(d))
            predictions[i] = pred
            residual_ss += (y[i] - pred) ** 2
        weight_ss = sum(w * w for w in weights)

        new_alpha = d / (weight_ss + 1e-8)
        new_beta = n / (residual_ss + 1e-8)
        alpha = 0.5 * (alpha + new_alpha)
        beta = 0.5 * (beta + new_beta)

    return {"weights": weights, "sigma": 1 / math.sqrt(beta), "predictions": predictions, "alpha": alpha, "beta": beta}


def bayesian_signal(p_up: float, p_down: float, next_pred: float) -> tuple[str, str]:
    """Trading signal from posterior probability and predicted return."""
    if p_up > 0.6 and next_pred > 0:
        return "BUY", f"P(up)={p_up * 100:.0f}%, predicted return=+{next_pred * 100:.3f}%"
    if p_down > 0.6 and next_pred < 0:
        return "SELL", f"P(down)={p_down * 100:.0f}%, predicted return={next_pred * 100:.3f}%"
    return "NEUTRAL", f"Uncertain: P(up)={p_up * 100:.0f}%, pred={next_pred * 100:.3f}%"


def _ridge_features(returns: list[float], lookback: int) -> tuple[list[list[float]], list[float]]:
    """Build [1, lag1, lag2, rsi_proxy, volatility] features and targets."""
    x: list[list[float]] = []
    y: list[float] = []
    for i in range(lookback, len(returns) - 1):
        lag1 = returns[i - 1]
        lag2 = returns[i - 2]
        window = returns[i - lookback : i]
        wmean = sum(window) / len(window)
        wvar = sum((r - wmean) ** 2 for r in window) / len(window)
        wstd = math.sqrt(wvar)

        gains = 0.0
        losses = 0.0
        for j in range(i - min(14, lookback), i):
            if returns[j] > 0:
                gains += returns[j]
            else:
                losses -= returns[j]
        rsi = 50 + 50 * (gains - losses) / (gains + losses) if gains + losses > 0 else 50.0

        x.append([1.0, lag1, lag2, (rsi - 50) / 50, wstd * 100])
        y.append(returns[i + 1])
    return x, y


def _next_features(returns: list[float], lookback: int) -> list[float]:
    """Features for the next-step prediction."""
    last_idx = len(returns) - 1
    last_lag1 = returns[last_idx - 1]
    last_lag2 = returns[last_idx - 2]
    last_window = returns[max(0, last_idx - lookback) : last_idx]
    last_mean = sum(last_window) / len(last_window)
    last_var = sum((r - last_mean) ** 2 for r in last_window) / len(last_window)
    last_std = math.sqrt(last_var)

    last_gains = 0.0
    last_losses = 0.0
    for j in range(max(0, last_idx - 14), last_idx):
        if returns[j] > 0:
            last_gains += returns[j]
        else:
            last_losses -= returns[j]
    last_rsi = 50 + 50 * (last_gains - last_losses) / (last_gains + last_losses) if last_gains + last_losses > 0 else 50.0

    return [1.0, last_lag1, last_lag2, (last_rsi - 50) / 50, last_std * 100]


def bayesian_price_analysis(
    prices: list[float],
    prior_strength: float = DEFAULT_PRIOR_STRENGTH,
    lookback: int = DEFAULT_LOOKBACK,
    hazard_rate: float = DEFAULT_HAZARD_RATE,
) -> BayesianPriceResult | None:
    """Full Bayesian price prediction analysis. None if fewer than 30 prices."""
    if not prices or len(prices) < MIN_PRICES:
        return None

    n = len(prices)
    returns = [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, n)]

    ups = sum(1 for r in returns if r > 0)
    downs = sum(1 for r in returns if r < 0)
    alpha = prior_strength / 2 + ups
    beta = prior_strength / 2 + downs
    p_up = alpha / (alpha + beta)
    p_down = beta / (alpha + beta)
    ci_low = beta_cdf_inv(0.025, alpha, beta)
    ci_high = beta_cdf_inv(0.975, alpha, beta)

    mean_return = sum(returns) / len(returns)
    var_return = sum((r - mean_return) ** 2 for r in returns) / len(returns)
    mu0 = 0.0
    kappa0 = prior_strength
    a0 = prior_strength / 2
    b0 = prior_strength * var_return / 2

    kappa_n = kappa0 + n - 1
    mu_n = (kappa0 * mu0 + (n - 1) * mean_return) / kappa_n
    a_n = a0 + (n - 1) / 2
    b_n = b0 + 0.5 * (n - 1) * var_return + 0.5 * kappa0 * (n - 1) * (mean_return - mu0) ** 2 / kappa_n
    post_mean = mu_n
    post_std = math.sqrt(b_n / (a_n - 1)) if a_n > 1 else 0.0

    bocpd_result = bocpd(returns, 1 / hazard_rate)
    changepoints = bocpd_result["changepoints"]

    x, y = _ridge_features(returns, lookback)
    ridge = bayesian_ridge(x, y)
    weights = ridge["weights"]
    noise_sigma = ridge["sigma"]
    predictions = ridge["predictions"]

    next_features = _next_features(returns, lookback)
    next_pred = sum(w * f for w, f in zip(weights, next_features))
    next_ci = 1.96 * noise_sigma

    y_mean = sum(y) / len(y) if y else 0.0
    ss_tot = sum((v - y_mean) ** 2 for v in y)
    ss_res = sum((y[i] - (predictions[i] if i < len(predictions) else 0.0)) ** 2 for i in range(len(y)))
    r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0

    signal, signal_reason = bayesian_signal(p_up, p_down, next_pred)
    current_price = prices[-1]

    return BayesianPriceResult(
        p_up=p_up,
        p_down=p_down,
        alpha=alpha,
        beta=beta,
        ci_low=ci_low,
        ci_high=ci_high,
        post_mean=post_mean,
        post_std=post_std,
        changepoints=changepoints,
        run_lengths=bocpd_result["run_lengths"],
        weights=weights,
        noise_sigma=noise_sigma,
        next_pred=next_pred,
        next_ci=next_ci,
        r_squared=r_squared,
        signal=signal,
        signal_reason=signal_reason,
        current_price=current_price,
        predicted_price=current_price * (1 + next_pred),
        predicted_low=current_price * (1 + next_pred - next_ci),
        predicted_high=current_price * (1 + next_pred + next_ci),
    )
