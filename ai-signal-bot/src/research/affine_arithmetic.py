"""Affine Arithmetic for interval uncertainty propagation.

Propagates uncertainty through financial calculations while tracking
correlations between quantities (unlike interval arithmetic, avoiding the
dependency problem).
"""
from __future__ import annotations

import math


DEFAULT_UNCERTAINTY_PCT = 0.5
DEFAULT_LOOKBACK = 50
DEFAULT_STRIKE_PCT = 1.0
DEFAULT_T_DAYS = 30
DEFAULT_RISK_FREE_RATE = 0.05


class Affine:
    """Affine form: center + sum(coeffs[i] * eps_i)."""

    _next_id = 0

    def __init__(self, center: float, coeffs: dict[int, float] | None = None) -> None:
        self.center = center
        self.coeffs = dict(coeffs) if coeffs else {}

    @classmethod
    def from_interval(cls, lo: float, hi: float) -> "Affine":
        """Create an affine form from an interval."""
        center = (lo + hi) / 2
        radius = (hi - lo) / 2
        if radius > 0:
            cls._next_id += 1
            return cls(center, {cls._next_id: radius})
        return cls(center)

    def add(self, other) -> "Affine":
        """Addition."""
        if isinstance(other, (int, float)):
            return Affine(self.center + other, self.coeffs)
        new_coeffs = dict(self.coeffs)
        for sym_id, c in other.coeffs.items():
            new_coeffs[sym_id] = new_coeffs.get(sym_id, 0.0) + c
        return Affine(self.center + other.center, new_coeffs)

    def sub(self, other) -> "Affine":
        """Subtraction."""
        if isinstance(other, (int, float)):
            return Affine(self.center - other, self.coeffs)
        new_coeffs = dict(self.coeffs)
        for sym_id, c in other.coeffs.items():
            new_coeffs[sym_id] = new_coeffs.get(sym_id, 0.0) - c
        return Affine(self.center - other.center, new_coeffs)

    def mul(self, other) -> "Affine":
        """Multiplication with nonlinear term approximation."""
        if isinstance(other, (int, float)):
            new_coeffs = {sym_id: c * other for sym_id, c in self.coeffs.items()}
            return Affine(self.center * other, new_coeffs)

        new_coeffs: dict[int, float] = {}
        for sym_id, c in self.coeffs.items():
            new_coeffs[sym_id] = c * other.center
        for sym_id, c in other.coeffs.items():
            new_coeffs[sym_id] = new_coeffs.get(sym_id, 0.0) + c * self.center

        quad_error = 0.0
        for c1 in self.coeffs.values():
            for c2 in other.coeffs.values():
                quad_error += abs(c1 * c2)
        if quad_error > 0:
            Affine._next_id += 1
            new_coeffs[Affine._next_id] = quad_error

        return Affine(self.center * other.center, new_coeffs)

    def scale(self, s: float) -> "Affine":
        """Scalar multiplication."""
        return self.mul(s)

    def exp(self) -> "Affine":
        """Chebyshev min-max linear approximation of exp."""
        lo = self.lower()
        hi = self.upper()
        exp_lo = math.exp(lo)
        exp_hi = math.exp(hi)

        alpha = (exp_hi - exp_lo) / (hi - lo + 1e-10)
        beta = (exp_lo + exp_hi) / 2 - alpha * (lo + hi) / 2
        max_err = (exp_hi - exp_lo) / 2 - alpha * (hi - lo) / 4

        new_coeffs = {sym_id: alpha * c for sym_id, c in self.coeffs.items()}
        if max_err > 0:
            Affine._next_id += 1
            new_coeffs[Affine._next_id] = max_err

        return Affine(beta + alpha * self.center, new_coeffs)

    def lower(self) -> float:
        """Lower bound of the interval."""
        return self.center - self.radius()

    def upper(self) -> float:
        """Upper bound of the interval."""
        return self.center + self.radius()

    def radius(self) -> float:
        """Total uncertainty radius."""
        return sum(abs(c) for c in self.coeffs.values())


class AffineResult:
    """Container for affine arithmetic analysis results."""

    def __init__(
        self,
        s0: float,
        k: float,
        t: float,
        sigma: float,
        sigma_lo: float,
        sigma_hi: float,
        sigma_uncertainty: float,
        price_lo: float,
        price_hi: float,
        price_center: float,
        d1_center: float,
        portfolio: Affine,
        position_value: Affine,
        with_return: Affine,
        signal: str,
        reason: str,
        option_spread: float,
        mean_recent: float,
        std_recent: float,
        ret_uncertainty: float,
    ) -> None:
        self.s0 = s0
        self.k = k
        self.t = t
        self.sigma = sigma
        self.sigma_lo = sigma_lo
        self.sigma_hi = sigma_hi
        self.sigma_uncertainty = sigma_uncertainty
        self.price_lo = price_lo
        self.price_hi = price_hi
        self.price_center = price_center
        self.d1_center = d1_center
        self.portfolio = portfolio
        self.position_value = position_value
        self.with_return = with_return
        self.signal = signal
        self.reason = reason
        self.option_spread = option_spread
        self.mean_recent = mean_recent
        self.std_recent = std_recent
        self.ret_uncertainty = ret_uncertainty


def _erf(x: float) -> float:
    """Abramowitz-Stegun erf approximation."""
    t = 1 / (1 + 0.3275911 * abs(x))
    y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * math.exp(-x * x)
    return y if x >= 0 else -y


def robust_portfolio_value(
    weights: list[float],
    returns: list[float],
    uncertainties: list[float],
) -> Affine:
    """Robust portfolio value with uncertain returns."""
    portfolio = Affine(0.0)
    for i in range(len(weights)):
        r = Affine.from_interval(returns[i] - uncertainties[i], returns[i] + uncertainties[i])
        portfolio = portfolio.add(r.mul(weights[i]))
    return portfolio


def robust_option_price(
    s: float,
    k: float,
    t: float,
    r: float,
    sigma_lo: float,
    sigma_hi: float,
) -> dict:
    """Robust Black-Scholes call price with uncertain volatility."""
    sigma_val = (sigma_lo + sigma_hi) / 2
    d1_center = (math.log(s / k) + (r + sigma_val * sigma_val / 2) * t) / (sigma_val * math.sqrt(t))

    def norm_cdf(x: float) -> float:
        return 0.5 * (1 + _erf(x / math.sqrt(2)))

    def price_at(sigma: float) -> float:
        d1 = (math.log(s / k) + (r + sigma * sigma / 2) * t) / (sigma * math.sqrt(t))
        return s * norm_cdf(d1) - k * math.exp(-r * t) * norm_cdf(d1 - sigma * math.sqrt(t))

    price_low = price_at(sigma_lo)
    price_high = price_at(sigma_hi)
    d1_low = (math.log(s / k) + (r + sigma_lo * sigma_lo / 2) * t) / (sigma_lo * math.sqrt(t))
    d1_high = (math.log(s / k) + (r + sigma_hi * sigma_hi / 2) * t) / (sigma_hi * math.sqrt(t))

    return {
        "price_lo": min(price_low, price_high),
        "price_hi": max(price_low, price_high),
        "price_center": (price_low + price_high) / 2,
        "d1_center": d1_center,
        "d1_low": d1_low,
        "d1_high": d1_high,
    }


def affine_signal(option_spread: float) -> tuple[str, str]:
    """Signal from option price spread."""
    if option_spread > 0.3:
        return "HIGH_UNCERTAINTY", f"Option price spread = {option_spread * 100:.1f}% (high uncertainty)"
    if option_spread > 0.1:
        return "MODERATE_UNCERTAINTY", f"Option price spread = {option_spread * 100:.1f}%"
    return "LOW_UNCERTAINTY", f"Option price spread = {option_spread * 100:.1f}% (well-defined)"


def affine_analysis(
    prices: list[float],
    uncertainty_pct: float = DEFAULT_UNCERTAINTY_PCT,
    lookback: int = DEFAULT_LOOKBACK,
    strike_pct: float = DEFAULT_STRIKE_PCT,
    t_days: int = DEFAULT_T_DAYS,
    risk_free_rate: float = DEFAULT_RISK_FREE_RATE,
) -> AffineResult | None:
    """Full affine arithmetic analysis. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]

    s0 = prices[-1]
    k = s0 * strike_pct
    t = t_days / 365

    mean_r = sum(returns) / len(returns)
    std_r = math.sqrt(sum((r - mean_r) ** 2 for r in returns) / len(returns))
    sigma = std_r * math.sqrt(252)

    sigma_uncertainty = sigma * uncertainty_pct / 100
    sigma_lo = max(0.01, sigma - sigma_uncertainty)
    sigma_hi = sigma + sigma_uncertainty

    option = robust_option_price(s0, k, t, risk_free_rate, sigma_lo, sigma_hi)

    recent_rets = returns[-20:]
    mean_recent = sum(recent_rets) / len(recent_rets)
    std_recent = math.sqrt(sum((r - mean_recent) ** 2 for r in recent_rets) / len(recent_rets))
    ret_uncertainty = std_recent * uncertainty_pct / 100

    portfolio = robust_portfolio_value(
        [0.5, 0.5],
        [mean_recent, mean_recent * 0.8],
        [ret_uncertainty, ret_uncertainty * 1.2],
    )

    Affine._next_id = 0
    price = Affine.from_interval(s0 * 0.99, s0 * 1.01)
    quantity = Affine.from_interval(0.95, 1.05)
    position_value = price.mul(quantity)
    with_return = position_value.mul(
        Affine.from_interval(1 + mean_recent - ret_uncertainty, 1 + mean_recent + ret_uncertainty)
    )

    option_spread = (option["price_hi"] - option["price_lo"]) / option["price_center"]
    signal, reason = affine_signal(option_spread)

    return AffineResult(
        s0=s0,
        k=k,
        t=t,
        sigma=sigma,
        sigma_lo=sigma_lo,
        sigma_hi=sigma_hi,
        sigma_uncertainty=sigma_uncertainty,
        price_lo=option["price_lo"],
        price_hi=option["price_hi"],
        price_center=option["price_center"],
        d1_center=option["d1_center"],
        portfolio=portfolio,
        position_value=position_value,
        with_return=with_return,
        signal=signal,
        reason=reason,
        option_spread=option_spread,
        mean_recent=mean_recent,
        std_recent=std_recent,
        ret_uncertainty=ret_uncertainty,
    )
