"""Options simulator with Black-Scholes pricing and Greeks.

Provides European-style options pricing using the Black-Scholes model
with real-time Greeks calculation (delta, gamma, theta, vega, rho).

Supports:
- Call and put options
- Implied volatility calculation (Newton-Raphson)
- Option chain generation for multiple strikes/expiries
- Greeks: delta, gamma, theta, vega, rho
- Put-call parity verification

Usage:
    from exchange_simulator.options_simulator import OptionsSimulator

    sim = OptionsSimulator(risk_free_rate=0.05)
    quote = sim.price_option(S=65000, K=70000, T=0.25, sigma=0.8, option_type="call")
    print(f"Price: {quote.price}, Delta: {quote.delta}, Gamma: {quote.gamma}")
"""
import math
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class OptionQuote:
    """Option pricing result with Greeks."""
    price: float
    delta: float
    gamma: float
    theta: float  # per day
    vega: float   # per 1% vol change
    rho: float    # per 1% rate change
    implied_vol: float
    strike: float
    expiry: float  # years
    option_type: str  # "call" or "put"
    underlying: float
    in_the_money: bool


class OptionsSimulator:
    """Black-Scholes options pricing engine with Greeks.

    Args:
        risk_free_rate: Annual risk-free rate (default 0.05 = 5%)
    """

    def __init__(self, risk_free_rate: float = 0.05):
        self.r = risk_free_rate

    @staticmethod
    def _norm_cdf(x: float) -> float:
        """Standard normal CDF using error function approximation."""
        return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))

    @staticmethod
    def _norm_pdf(x: float) -> float:
        """Standard normal PDF."""
        return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)

    def _d1_d2(self, S: float, K: float, T: float, sigma: float) -> tuple[float, float]:
        """Calculate d1 and d2 for Black-Scholes."""
        if T <= 0 or sigma <= 0:
            return 0.0, 0.0
        sqrt_T = math.sqrt(T)
        d1 = (math.log(S / K) + (self.r + 0.5 * sigma * sigma) * T) / (sigma * sqrt_T)
        d2 = d1 - sigma * sqrt_T
        return d1, d2

    def price_option(
        self,
        S: float,
        K: float,
        T: float,
        sigma: float,
        option_type: str = "call",
    ) -> OptionQuote:
        """Price a European option using Black-Scholes.

        Args:
            S: Underlying price
            K: Strike price
            T: Time to expiry in years
            sigma: Annualized volatility
            option_type: "call" or "put"

        Returns:
            OptionQuote with price and all Greeks
        """
        if T <= 0:
            # At expiry — intrinsic value
            intrinsic = max(S - K, 0) if option_type == "call" else max(K - S, 0)
            return OptionQuote(
                price=intrinsic, delta=0, gamma=0, theta=0, vega=0, rho=0,
                implied_vol=sigma, strike=K, expiry=T, option_type=option_type,
                underlying=S, in_the_money=intrinsic > 0,
            )

        if sigma <= 0 or S <= 0 or K <= 0:
            return OptionQuote(
                price=0, delta=0, gamma=0, theta=0, vega=0, rho=0,
                implied_vol=sigma, strike=K, expiry=T, option_type=option_type,
                underlying=S, in_the_money=False,
            )

        d1, d2 = self._d1_d2(S, K, T, sigma)
        nd1 = self._norm_cdf(d1)
        nd2 = self._norm_cdf(d2)
        pd1 = self._norm_pdf(d1)
        discount = math.exp(-self.r * T)

        if option_type == "call":
            price = S * nd1 - K * discount * nd2
            delta = nd1
            rho = K * T * discount * nd2 / 100.0
        else:  # put
            price = K * discount * self._norm_cdf(-d2) - S * self._norm_cdf(-d1)
            delta = nd1 - 1.0
            rho = -K * T * discount * self._norm_cdf(-d2) / 100.0

        gamma = pd1 / (S * sigma * math.sqrt(T))
        vega = S * pd1 * math.sqrt(T) / 100.0  # per 1% vol
        theta = (
            -(S * pd1 * sigma) / (2.0 * math.sqrt(T))
            - self.r * K * discount * (nd2 if option_type == "call" else -self._norm_cdf(-d2))
        ) / 365.0  # per day

        itm = (S > K) if option_type == "call" else (S < K)

        return OptionQuote(
            price=price,
            delta=delta,
            gamma=gamma,
            theta=theta,
            vega=vega,
            rho=rho,
            implied_vol=sigma,
            strike=K,
            expiry=T,
            option_type=option_type,
            underlying=S,
            in_the_money=itm,
        )

    def implied_vol(
        self,
        S: float,
        K: float,
        T: float,
        market_price: float,
        option_type: str = "call",
        max_iter: int = 100,
        tol: float = 1e-6,
    ) -> float:
        """Calculate implied volatility using Newton-Raphson.

        Args:
            market_price: Observed option price in the market
            max_iter: Maximum iterations
            tol: Convergence tolerance

        Returns:
            Implied volatility, or NaN if no convergence
        """
        if T <= 0 or market_price <= 0:
            return float("nan")

        sigma = 0.5  # Initial guess
        for _ in range(max_iter):
            quote = self.price_option(S, K, T, sigma, option_type)
            diff = quote.price - market_price
            if abs(diff) < tol:
                return sigma
            if abs(quote.vega) < 1e-10:
                break
            sigma -= diff / (quote.vega * 100.0)  # vega is per 1%
            if sigma <= 0:
                sigma = 0.01

        return float("nan")

    def generate_chain(
        self,
        S: float,
        expiries: list[float],
        strikes: list[float],
        sigma: float,
        option_types: Optional[list[str]] = None,
    ) -> list[OptionQuote]:
        """Generate an option chain for multiple strikes and expiries.

        Args:
            S: Underlying price
            expiries: List of times to expiry in years
            strikes: List of strike prices
            sigma: Base volatility
            option_types: ["call", "put"] (default: both)

        Returns:
            List of OptionQuote for all combinations
        """
        if option_types is None:
            option_types = ["call", "put"]

        chain = []
        for T in expiries:
            for K in strikes:
                for ot in option_types:
                    quote = self.price_option(S, K, T, sigma, ot)
                    chain.append(quote)
        return chain

    def put_call_parity(
        self, S: float, K: float, T: float, sigma: float
    ) -> dict:
        """Verify put-call parity: C - P = S - K*exp(-rT).

        Returns:
            Dict with call, put, parity_diff, and parity_ok
        """
        call = self.price_option(S, K, T, sigma, "call")
        put = self.price_option(S, K, T, sigma, "put")
        parity_value = S - K * math.exp(-self.r * T)
        parity_diff = call.price - put.price - parity_value
        return {
            "call_price": call.price,
            "put_price": put.price,
            "parity_value": parity_value,
            "parity_diff": parity_diff,
            "parity_ok": abs(parity_diff) < 0.01,
        }
