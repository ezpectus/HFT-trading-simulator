"""Copula dependency model for non-linear dependence between assets.

Unlike Pearson correlation (linear only), copulas capture the full joint
distribution structure, including tail dependence — whether assets crash
or rally together. Implements empirical, Gaussian, Clayton, Gumbel, and
Student-t copulas.
"""
from __future__ import annotations

import math

MIN_PROB = 1e-10
TAIL_PROB = 0.05
MIN_RETURNS = 30
DEFAULT_DF = 5


class CopulaFit:
    """Fitted copula parameters and tail dependence coefficients."""

    def __init__(
        self,
        name: str,
        theta: float | None = None,
        rho: float | None = None,
        df: float | None = None,
        lower: float = 0.0,
        upper: float = 0.0,
    ) -> None:
        self.name = name
        self.theta = theta
        self.rho = rho
        self.df = df
        self.lower = lower
        self.upper = upper


class CopulaResult:
    """Container for copula dependency analysis results."""

    def __init__(
        self,
        a: str,
        b: str,
        tau: float,
        spearman: float,
        pearson: float,
        fits: dict[str, CopulaFit],
        log_lik: dict[str, float],
        joint_probs: dict[str, float],
        conditional_lower: dict[str, float],
        signal: str,
        reason: str,
        u_a: list[float],
        u_b: list[float],
        n: int,
    ) -> None:
        self.a = a
        self.b = b
        self.tau = tau
        self.spearman = spearman
        self.pearson = pearson
        self.fits = fits
        self.log_lik = log_lik
        self.joint_probs = joint_probs
        self.conditional_lower = conditional_lower
        self.signal = signal
        self.reason = reason
        self.u_a = u_a
        self.u_b = u_b
        self.n = n


def empirical_cdf(values: list[float]) -> list[float]:
    """Rank-based empirical CDF: count(x <= v) / (n + 1)."""
    n = len(values)
    return [sum(1 for x in values if x <= v) / (n + 1) for v in values]


def erf(x: float) -> float:
    """Abramowitz-Stegun error function approximation."""
    sign = 1 if x >= 0 else -1
    x = abs(x)
    a1, a2, a3, a4, a5 = 0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429
    p = 0.3275911
    t = 1 / (1 + p * x)
    y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * math.exp(-x * x)
    return sign * y


def norm_cdf(x: float) -> float:
    """Standard normal CDF via the error function."""
    return 0.5 * (1 + erf(x / math.sqrt(2)))


def norm_inv(p: float) -> float:
    """Inverse normal CDF (Beasley-Springer-Moro approximation)."""
    if p <= 0:
        return -10.0
    if p >= 1:
        return 10.0
    a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
         1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0]
    b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
         6.680131188771972e1, -1.328068155288572e1]
    c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161247e0,
         -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0]
    d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
         3.754408661907416e0]
    plow, phigh = 0.02425, 1 - 0.02425
    if p < plow:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
            (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1
        )
    if p <= phigh:
        q = p - 0.5
        r = q * q
        return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (
            ((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1
        )
    q = math.sqrt(-2 * math.log(1 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
        (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1
    )


def kendall_tau(x: list[float], y: list[float]) -> float:
    """Kendall's tau: (concordant - discordant) / total pairs."""
    n = len(x)
    concordant = 0
    discordant = 0
    for i in range(n):
        for j in range(i + 1, n):
            dx = x[i] - x[j]
            dy = y[i] - y[j]
            if dx * dy > 0:
                concordant += 1
            elif dx * dy < 0:
                discordant += 1
    total = n * (n - 1) / 2
    return (concordant - discordant) / total if total > 0 else 0.0


def _ranks(values: list[float]) -> list[int]:
    """Rank values (1-based) with ties broken by position."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0] * len(values)
    for rank, idx in enumerate(order, start=1):
        ranks[idx] = rank
    return ranks


def spearman_rho(x: list[float], y: list[float]) -> float:
    """Spearman's rank correlation coefficient."""
    n = len(x)
    rx = _ranks(x)
    ry = _ranks(y)
    mean_r = (n + 1) / 2
    num = 0.0
    den_x = 0.0
    den_y = 0.0
    for i in range(n):
        num += (rx[i] - mean_r) * (ry[i] - mean_r)
        den_x += (rx[i] - mean_r) ** 2
        den_y += (ry[i] - mean_r) ** 2
    return num / math.sqrt(den_x * den_y) if den_x > 0 and den_y > 0 else 0.0


def pearson_corr(x: list[float], y: list[float]) -> float:
    """Pearson linear correlation coefficient."""
    n = len(x)
    mean_x = sum(x) / n
    mean_y = sum(y) / n
    cov = 0.0
    var_x = 0.0
    var_y = 0.0
    for i in range(n):
        dx = x[i] - mean_x
        dy = y[i] - mean_y
        cov += dx * dy
        var_x += dx * dx
        var_y += dy * dy
    return cov / math.sqrt(var_x * var_y) if var_x > 0 and var_y > 0 else 0.0


def clayton_cdf(u: float, v: float, theta: float) -> float:
    """Clayton copula CDF: (u^-theta + v^-theta - 1)^(-1/theta)."""
    if theta <= 0:
        return u * v
    return max(0.0, (u ** -theta + v ** -theta - 1) ** (-1 / theta))


def gumbel_cdf(u: float, v: float, theta: float) -> float:
    """Gumbel copula CDF: exp(-[(-ln u)^theta + (-ln v)^theta]^(1/theta))."""
    if theta <= 1:
        return u * v
    lu = -math.log(u)
    lv = -math.log(v)
    return math.exp(-(lu ** theta + lv ** theta) ** (1 / theta))


def bivariate_normal_cdf(h: float, k: float, r: float) -> float:
    """Drezner-Priestley bivariate normal CDF (5-point Gauss quadrature)."""
    if abs(r) > 0.9999:
        r = 0.9999 if r > 0 else -0.9999
    x = [0.04691008, 0.23076534, 0.5, 0.76923466, 0.95308992]
    w = [0.018854042, 0.038088059, 0.0452707394, 0.038088059, 0.018854042]
    h2 = h / math.sqrt(2)
    k2 = k / math.sqrt(2)
    r2 = (1 + r) / 2
    total = 0.0
    for i in range(5):
        for j in range(5):
            total += (
                w[i]
                * w[j]
                * math.exp(h2 * math.sqrt(2) * x[i] + k2 * math.sqrt(2) * x[j] + r2 * 2 * x[i] * x[j])
            )
    return norm_cdf(h) * norm_cdf(k) + math.sqrt(1 - r * r) / (2 * math.pi) * total


def gaussian_copula_cdf(u: float, v: float, rho: float) -> float:
    """Gaussian copula CDF: Phi_rho(Phi^-1(u), Phi^-1(v))."""
    return bivariate_normal_cdf(norm_inv(u), norm_inv(v), rho)


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


def _beta_cf(x: float, a: float, b: float, depth: int) -> float:
    """Continued fraction for the regularized incomplete beta (mirrors UI)."""
    if depth > 100:
        return 0.0
    m = depth + 1
    numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m))
    return 1 + numerator / (1 + _beta_cf(x, a, b, depth + 1))


def reg_incomplete_beta(x: float, a: float, b: float) -> float:
    """Regularized incomplete beta function I_x(a, b)."""
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    lbeta = log_gamma(a) + log_gamma(b) - log_gamma(a + b)
    front = math.exp(math.log(x) * a + math.log(1 - x) * b - lbeta) / a
    if x < (a + 1) / (a + b + 2):
        return front * _beta_cf(x, a, b, 0) / a
    return 1 - front * _beta_cf(1 - x, b, a, 0) / b


def t_cdf(t: float, df: float) -> float:
    """Student-t CDF via the incomplete beta function."""
    x = df / (df + t * t)
    ib = 0.5 * reg_incomplete_beta(x, df / 2, 0.5)
    return 1 - ib if t >= 0 else ib


def fit_copula(tau: float) -> dict[str, CopulaFit]:
    """Fit copula parameters from Kendall's tau (method of moments)."""
    clayton_theta = 100 if tau >= 1 else (-100 if tau <= -1 else 2 * tau / (1 - tau))
    gumbel_theta = 100 if tau >= 1 else 1 / (1 - tau)
    gauss_rho = math.sin(math.pi * tau / 2)
    t_rho = gauss_rho
    t_df = DEFAULT_DF

    clayton_lower = 2 ** (-1 / clayton_theta) if clayton_theta > 0 else 0.0
    gumbel_upper = 2 - 2 ** (1 / gumbel_theta) if gumbel_theta > 1 else 0.0
    t_lower = (
        2 * t_cdf(-math.sqrt((t_df + 1) * (1 - t_rho) / (1 + t_rho)), t_df + 1)
        if t_df > 0
        else 0.0
    )

    return {
        "clayton": CopulaFit("clayton", theta=max(0.01, clayton_theta), lower=clayton_lower, upper=0.0),
        "gumbel": CopulaFit("gumbel", theta=max(1.01, gumbel_theta), lower=0.0, upper=gumbel_upper),
        "gaussian": CopulaFit("gaussian", rho=gauss_rho, lower=0.0, upper=0.0),
        "studentT": CopulaFit("studentT", rho=t_rho, df=t_df, lower=t_lower, upper=t_lower),
    }


def copula_log_likelihood(
    u_a: list[float],
    u_b: list[float],
    fits: dict[str, CopulaFit],
) -> dict[str, float]:
    """Goodness of fit: log-likelihood per copula (CDF-based, mirrors UI)."""
    clayton_ll = 0.0
    theta = fits["clayton"].theta
    for i in range(len(u_a)):
        u, v = u_a[i], u_b[i]
        density = (
            theta
            * (1 + theta)
            * (u ** -theta + v ** -theta - 1) ** (-2 / theta - 1)
            * (u * v) ** (-theta - 1)
        )
        clayton_ll += math.log(max(MIN_PROB, density))

    gumbel_ll = sum(
        math.log(max(MIN_PROB, gumbel_cdf(u_a[i], u_b[i], fits["gumbel"].theta)))
        for i in range(len(u_a))
    )
    gaussian_ll = sum(
        math.log(max(MIN_PROB, gaussian_copula_cdf(u_a[i], u_b[i], fits["gaussian"].rho)))
        for i in range(len(u_a))
    )
    return {"clayton": clayton_ll, "gumbel": gumbel_ll, "gaussian": gaussian_ll}


def copula_signal(
    conditional_lower: dict[str, float],
    copula_type: str,
    a: str,
    b: str,
) -> tuple[str, str]:
    """Tail-risk signal: RISK if joint crash probability is high, HEDGE if low."""
    prob = conditional_lower.get(copula_type, TAIL_PROB)
    if prob > 0.15:
        return "RISK", f"High lower tail dependence: P({b} crashes | {a} crashes) = {prob * 100:.1f}%"
    if prob < 0.03:
        return "HEDGE", f"Low tail dependence: {a} and {b} decouple in crashes"
    return "NEUTRAL", f"Moderate dependence: tail P={prob * 100:.1f}%"


def copula_analysis(
    returns_a: list[float],
    returns_b: list[float],
    a: str = "A",
    b: str = "B",
) -> CopulaResult | None:
    """Full copula dependency analysis of two return series. None if insufficient data."""
    if not returns_a or len(returns_a) < MIN_RETURNS or len(returns_b) != len(returns_a):
        return None

    u_a = empirical_cdf(returns_a)
    u_b = empirical_cdf(returns_b)
    tau = kendall_tau(returns_a, returns_b)
    spearman = spearman_rho(returns_a, returns_b)
    pearson = pearson_corr(returns_a, returns_b)
    fits = fit_copula(tau)
    log_lik = copula_log_likelihood(u_a, u_b, fits)

    last_u = u_a[-1]
    last_v = u_b[-1]
    joint_probs = {
        "clayton": clayton_cdf(last_u, last_v, fits["clayton"].theta),
        "gumbel": gumbel_cdf(last_u, last_v, fits["gumbel"].theta),
        "gaussian": gaussian_copula_cdf(last_u, last_v, fits["gaussian"].rho),
    }
    conditional_lower = {
        "clayton": clayton_cdf(TAIL_PROB, TAIL_PROB, fits["clayton"].theta) / TAIL_PROB,
        "gumbel": gumbel_cdf(TAIL_PROB, TAIL_PROB, fits["gumbel"].theta) / TAIL_PROB,
        "gaussian": gaussian_copula_cdf(TAIL_PROB, TAIL_PROB, fits["gaussian"].rho) / TAIL_PROB,
        "independent": TAIL_PROB,
    }

    signal, reason = copula_signal(conditional_lower, "clayton", a, b)
    return CopulaResult(
        a=a,
        b=b,
        tau=tau,
        spearman=spearman,
        pearson=pearson,
        fits=fits,
        log_lik=log_lik,
        joint_probs=joint_probs,
        conditional_lower=conditional_lower,
        signal=signal,
        reason=reason,
        u_a=u_a,
        u_b=u_b,
        n=len(returns_a),
    )


def copula_from_prices(
    prices_a: list[float],
    prices_b: list[float],
    a: str = "A",
    b: str = "B",
) -> CopulaResult | None:
    """Copula analysis directly on price series (simple returns computed internally)."""
    if not prices_a or len(prices_a) < MIN_RETURNS + 1 or len(prices_b) != len(prices_a):
        return None
    returns_a = [(prices_a[i] - prices_a[i - 1]) / prices_a[i - 1] for i in range(1, len(prices_a))]
    returns_b = [(prices_b[i] - prices_b[i - 1]) / prices_b[i - 1] for i in range(1, len(prices_b))]
    return copula_analysis(returns_a, returns_b, a=a, b=b)
