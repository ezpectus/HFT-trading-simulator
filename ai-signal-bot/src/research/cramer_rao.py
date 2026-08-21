"""Cramer-Rao Lower Bound (CRLB) for parameter estimation limits.

Computes the theoretical minimum variance of any unbiased estimator via the
Fisher information matrix.

    CRLB: Var(theta_hat) >= 1 / I(theta)
    Fisher Information: I(theta) = E[(d/dtheta log L(x|theta))^2]
                              = -E[d^2/dtheta^2 log L(x|theta)]

    Gaussian: I(mu) = n/sigma^2  ->  CRLB(mu) = sigma^2/n
              I(sigma^2) = n/(2*sigma^4)  ->  CRLB(sigma^2) = 2*sigma^4/n

    GARCH(1,1): Fisher information matrix via numerical Hessian of the
    negative log-likelihood; CRLB = inverse of the Fisher matrix.

    Efficiency: eff(theta_hat) = CRLB / Var(theta_hat)  (1 = efficient)

Ported from UI-only CramerRaoBound.jsx into trading logic.
Reference: future_development.md §0.2 — medium priority model.
"""
from __future__ import annotations

import math

MIN_PRICES = 30
DEFAULT_LOOKBACK = 100
GARCH_EPS = 1e-6
GARCH_PARAM_NAMES = ["omega", "alpha", "beta"]


class CramerRaoResult:
    """Container for Cramer-Rao bound analysis results."""

    def __init__(
        self,
        mean: float,
        var_r: float,
        std_r: float,
        n: int,
        fisher_mu: float,
        crlb_mu: float,
        fisher_var: float,
        crlb_var: float,
        fisher_matrix: list[list[float]],
        crlb_garch: list[list[float]],
        sample_sizes: list[dict],
        efficiency_mu: float,
        efficiency_var: float,
        signal: str,
        reason: str,
        ci_mu: float,
        ci_var: float,
    ) -> None:
        self.mean = mean
        self.var_r = var_r
        self.std_r = std_r
        self.n = n
        self.fisher_mu = fisher_mu
        self.crlb_mu = crlb_mu
        self.fisher_var = fisher_var
        self.crlb_var = crlb_var
        self.fisher_matrix = fisher_matrix
        self.crlb_garch = crlb_garch
        self.sample_sizes = sample_sizes
        self.efficiency_mu = efficiency_mu
        self.efficiency_var = efficiency_var
        self.signal = signal
        self.reason = reason
        self.ci_mu = ci_mu
        self.ci_var = ci_var


def compute_returns(prices: list[float]) -> list[float]:
    """Simple returns: r_t = (P_t - P_{t-1}) / P_{t-1}."""
    return [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]


def fisher_gaussian_mean(n: int, sigma2: float) -> float:
    """Fisher information for Gaussian mean: I(mu) = n / sigma^2."""
    return n / sigma2


def fisher_gaussian_var(n: int, sigma2: float) -> float:
    """Fisher information for Gaussian variance: I(sigma^2) = n / (2*sigma^4)."""
    return n / (2 * sigma2 * sigma2)


def garch_log_lik(returns: list[float], omega: float, alpha: float, beta: float) -> float:
    """GARCH(1,1) log-likelihood. -1e10 for invalid params."""
    if omega <= 0 or alpha < 0 or beta < 0 or alpha + beta >= 1:
        return -1e10
    sigma2 = omega / (1 - alpha - beta + 1e-10)
    log_lik = 0.0
    for ret in returns:
        sigma2 = omega + alpha * ret * ret + beta * sigma2
        if sigma2 <= 0:
            return -1e10
        log_lik += -0.5 * math.log(2 * math.pi * sigma2) - ret * ret / (2 * sigma2)
    return log_lik


def _invert3x3(m: list[list[float]]) -> list[list[float]]:
    """Invert a 3x3 matrix. Infinity entries if singular."""
    det = (
        m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
        - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
        + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    )
    if abs(det) < 1e-15:
        return [[math.inf] * 3 for _ in range(3)]

    inv = [[0.0] * 3 for _ in range(3)]
    inv[0][0] = (m[1][1] * m[2][2] - m[1][2] * m[2][1]) / det
    inv[0][1] = (m[0][2] * m[2][1] - m[0][1] * m[2][2]) / det
    inv[0][2] = (m[0][1] * m[1][2] - m[0][2] * m[1][1]) / det
    inv[1][0] = (m[1][2] * m[2][0] - m[1][0] * m[2][2]) / det
    inv[1][1] = (m[0][0] * m[2][2] - m[0][2] * m[2][0]) / det
    inv[1][2] = (m[0][2] * m[1][0] - m[0][0] * m[1][2]) / det
    inv[2][0] = (m[1][0] * m[2][1] - m[1][1] * m[2][0]) / det
    inv[2][1] = (m[0][1] * m[2][0] - m[0][0] * m[2][1]) / det
    inv[2][2] = (m[0][0] * m[1][1] - m[0][1] * m[1][0]) / det
    return inv


def fisher_garch(
    returns: list[float],
    omega: float,
    alpha: float,
    beta: float,
) -> dict:
    """Fisher information matrix for GARCH(1,1) via numerical Hessian."""
    params = [omega, alpha, beta]
    eps = GARCH_EPS

    fisher = [[0.0] * 3 for _ in range(3)]

    for p in range(3):
        params_plus = params[:]
        params_minus = params[:]
        params_plus[p] += eps
        params_minus[p] -= eps
        ll_plus = garch_log_lik(returns, params_plus[0], params_plus[1], params_plus[2])
        ll_minus = garch_log_lik(returns, params_minus[0], params_minus[1], params_minus[2])
        ll_0 = garch_log_lik(returns, params[0], params[1], params[2])
        fisher[p][p] = -(ll_plus - 2 * ll_0 + ll_minus) / (eps * eps)

    for p in range(3):
        for q in range(p + 1, 3):
            pp = params[:]
            pm = params[:]
            mp = params[:]
            mm = params[:]
            pp[p] += eps
            pp[q] += eps
            pm[p] += eps
            pm[q] -= eps
            mp[p] -= eps
            mp[q] += eps
            mm[p] -= eps
            mm[q] -= eps
            cross = (
                garch_log_lik(returns, pp[0], pp[1], pp[2])
                - garch_log_lik(returns, pm[0], pm[1], pm[2])
                - garch_log_lik(returns, mp[0], mp[1], mp[2])
                + garch_log_lik(returns, mm[0], mm[1], mm[2])
            ) / (4 * eps * eps)
            fisher[p][q] = -cross
            fisher[q][p] = -cross

    crlb = _invert3x3(fisher)
    return {"fisher_matrix": fisher, "crlb": crlb, "param_names": GARCH_PARAM_NAMES}


def crb_signal(fisher_mu: float) -> tuple[str, str]:
    """Signal from total Fisher information."""
    if fisher_mu < 100:
        return "LOW_INFORMATION", f"Fisher info I(μ) = {fisher_mu:.2f} (low — parameter estimates uncertain)"
    if fisher_mu > 1000:
        return "HIGH_INFORMATION", f"Fisher info I(μ) = {fisher_mu:.2f} (high — reliable estimates)"
    return "SUFFICIENT_DATA", f"Fisher info I(μ) = {fisher_mu:.2f} (moderate)"


def cramer_rao_analysis(
    prices: list[float],
    lookback: int = DEFAULT_LOOKBACK,
) -> CramerRaoResult | None:
    """Full Cramer-Rao bound analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = compute_returns(prices)
    n = len(returns)
    mean = sum(returns) / n
    var_r = sum((r - mean) ** 2 for r in returns) / n
    std_r = math.sqrt(var_r)

    fisher_mu = fisher_gaussian_mean(n, var_r)
    crlb_mu = 1 / fisher_mu
    fisher_var = fisher_gaussian_var(n, var_r)
    crlb_var = 1 / fisher_var

    omega = var_r * 0.05
    alpha = 0.08
    beta = 0.9
    garch_result = fisher_garch(returns, omega, alpha, beta)

    sample_sizes: list[dict] = []
    step = max(5, n // 15)
    for s in range(10, n + 1, step):
        sample_sizes.append(
            {
                "n": s,
                "crlb_mu": var_r / s,
                "crlb_var": 2 * var_r * var_r / s,
                "fisher_mu": s / var_r,
            }
        )

    sample_mean_var = var_r / n
    efficiency_mu = crlb_mu / sample_mean_var
    sample_var_var = 2 * var_r * var_r / (n - 1)
    efficiency_var = crlb_var / sample_var_var

    signal, reason = crb_signal(fisher_mu)
    ci_mu = 1.96 * math.sqrt(crlb_mu)
    ci_var = 1.96 * math.sqrt(crlb_var)

    return CramerRaoResult(
        mean=mean,
        var_r=var_r,
        std_r=std_r,
        n=n,
        fisher_mu=fisher_mu,
        crlb_mu=crlb_mu,
        fisher_var=fisher_var,
        crlb_var=crlb_var,
        fisher_matrix=garch_result["fisher_matrix"],
        crlb_garch=garch_result["crlb"],
        sample_sizes=sample_sizes,
        efficiency_mu=efficiency_mu,
        efficiency_var=efficiency_var,
        signal=signal,
        reason=reason,
        ci_mu=ci_mu,
        ci_var=ci_var,
    )
