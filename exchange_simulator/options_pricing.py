# Options Pricing Module
#
# Implements Black-Scholes and Binomial Tree pricing models for options.
# Includes Greeks calculation and implied volatility estimation.

import math
from typing import Optional, Tuple
from dataclasses import dataclass
from enum import Enum


class OptionType(Enum):
    CALL = "call"
    PUT = "put"


@dataclass
class Greeks:
    """Greeks for an option position."""
    delta: float
    gamma: float
    theta: float
    vega: float
    rho: float


class BlackScholes:
    """Black-Scholes options pricing model."""
    
    def __init__(self, risk_free_rate: float = 0.05):
        """
        Initialize Black-Scholes model.
        
        Args:
            risk_free_rate: Annual risk-free interest rate (default 5%)
        """
        self.r = risk_free_rate
    
    def _d1(self, S: float, K: float, T: float, sigma: float) -> float:
        """Calculate d1 parameter."""
        if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
            return 0.0
        return (math.log(S / K) + (self.r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    
    def _d2(self, d1: float, T: float, sigma: float) -> float:
        """Calculate d2 parameter."""
        return d1 - sigma * math.sqrt(T)
    
    def _cdf(self, x: float) -> float:
        """Cumulative distribution function for standard normal distribution."""
        return 0.5 * (1 + math.erf(x / math.sqrt(2)))
    
    def _pdf(self, x: float) -> float:
        """Probability density function for standard normal distribution."""
        return math.exp(-0.5 * x ** 2) / math.sqrt(2 * math.pi)
    
    def calculate_call_price(self, S: float, K: float, T: float, sigma: float) -> float:
        """
        Calculate European call option price using Black-Scholes.
        
        Args:
            S: Current stock price
            K: Strike price
            T: Time to expiration (in years)
            sigma: Volatility (annualized)
        
        Returns:
            Call option price
        """
        d1 = self._d1(S, K, T, sigma)
        d2 = self._d2(d1, T, sigma)
        
        call_price = S * self._cdf(d1) - K * math.exp(-self.r * T) * self._cdf(d2)
        return max(0, call_price)
    
    def calculate_put_price(self, S: float, K: float, T: float, sigma: float) -> float:
        """
        Calculate European put option price using Black-Scholes.
        
        Args:
            S: Current stock price
            K: Strike price
            T: Time to expiration (in years)
            sigma: Volatility (annualized)
        
        Returns:
            Put option price
        """
        d1 = self._d1(S, K, T, sigma)
        d2 = self._d2(d1, T, sigma)
        
        put_price = K * math.exp(-self.r * T) * self._cdf(-d2) - S * self._cdf(-d1)
        return max(0, put_price)
    
    def calculate_delta(self, S: float, K: float, T: float, sigma: float, option_type: OptionType) -> float:
        """
        Calculate delta (sensitivity to underlying price).
        
        Args:
            S: Current stock price
            K: Strike price
            T: Time to expiration (in years)
            sigma: Volatility (annualized)
            option_type: CALL or PUT
        
        Returns:
            Delta value
        """
        d1 = self._d1(S, K, T, sigma)
        
        if option_type == OptionType.CALL:
            return self._cdf(d1)
        else:
            return self._cdf(d1) - 1
    
    def calculate_gamma(self, S: float, K: float, T: float, sigma: float) -> float:
        """
        Calculate gamma (second derivative with respect to underlying price).
        
        Args:
            S: Current stock price
            K: Strike price
            T: Time to expiration (in years)
            sigma: Volatility (annualized)
        
        Returns:
            Gamma value
        """
        d1 = self._d1(S, K, T, sigma)
        return self._pdf(d1) / (S * sigma * math.sqrt(T))
    
    def calculate_theta(self, S: float, K: float, T: float, sigma: float, option_type: OptionType) -> float:
        """
        Calculate theta (sensitivity to time decay).
        
        Args:
            S: Current stock price
            K: Strike price
            T: Time to expiration (in years)
            sigma: Volatility (annualized)
            option_type: CALL or PUT
        
        Returns:
            Theta value (per year)
        """
        d1 = self._d1(S, K, T, sigma)
        d2 = self._d2(d1, T, sigma)
        
        if option_type == OptionType.CALL:
            theta = (
                -(S * self._pdf(d1) * sigma) / (2 * math.sqrt(T))
                - self.r * K * math.exp(-self.r * T) * self._cdf(d2)
            )
        else:
            theta = (
                -(S * self._pdf(d1) * sigma) / (2 * math.sqrt(T))
                + self.r * K * math.exp(-self.r * T) * self._cdf(-d2)
            )
        
        return theta
    
    def calculate_vega(self, S: float, K: float, T: float, sigma: float) -> float:
        """
        Calculate vega (sensitivity to volatility).
        
        Args:
            S: Current stock price
            K: Strike price
            T: Time to expiration (in years)
            sigma: Volatility (annualized)
        
        Returns:
            Vega value (per 1% change in volatility)
        """
        d1 = self._d1(S, K, T, sigma)
        return S * self._pdf(d1) * math.sqrt(T) / 100
    
    def calculate_rho(self, S: float, K: float, T: float, sigma: float, option_type: OptionType) -> float:
        """
        Calculate rho (sensitivity to interest rate).
        
        Args:
            S: Current stock price
            K: Strike price
            T: Time to expiration (in years)
            sigma: Volatility (annualized)
            option_type: CALL or PUT
        
        Returns:
            Rho value (per 1% change in interest rate)
        """
        d2 = self._d2(self._d1(S, K, T, sigma), T, sigma)
        
        if option_type == OptionType.CALL:
            rho = K * T * math.exp(-self.r * T) * self._cdf(d2) / 100
        else:
            rho = -K * T * math.exp(-self.r * T) * self._cdf(-d2) / 100
        
        return rho
    
    def calculate_greeks(self, S: float, K: float, T: float, sigma: float, option_type: OptionType) -> Greeks:
        """
        Calculate all Greeks for an option.
        
        Args:
            S: Current stock price
            K: Strike price
            T: Time to expiration (in years)
            sigma: Volatility (annualized)
            option_type: CALL or PUT
        
        Returns:
            Greeks object containing all Greeks
        """
        delta = self.calculate_delta(S, K, T, sigma, option_type)
        gamma = self.calculate_gamma(S, K, T, sigma)
        theta = self.calculate_theta(S, K, T, sigma, option_type)
        vega = self.calculate_vega(S, K, T, sigma)
        rho = self.calculate_rho(S, K, T, sigma, option_type)
        
        return Greeks(delta=delta, gamma=gamma, theta=theta, vega=vega, rho=rho)
    
    def calculate_implied_volatility(self, S: float, K: float, T: float, market_price: float, 
                                      option_type: OptionType, max_iterations: int = 100,
                                      tolerance: float = 1e-6) -> Optional[float]:
        """
        Calculate implied volatility using Newton-Raphson method.
        
        Args:
            S: Current stock price
            K: Strike price
            T: Time to expiration (in years)
            market_price: Market price of the option
            option_type: CALL or PUT
            max_iterations: Maximum iterations for Newton-Raphson
            tolerance: Convergence tolerance
        
        Returns:
            Implied volatility or None if convergence fails
        """
        sigma = 0.5  # Initial guess
        
        for _ in range(max_iterations):
            if option_type == OptionType.CALL:
                price = self.calculate_call_price(S, K, T, sigma)
            else:
                price = self.calculate_put_price(S, K, T, sigma)
            
            vega = self.calculate_vega(S, K, T, sigma) * 100  # Convert back from per 1%
            
            if abs(vega) < tolerance:
                break
            
            diff = price - market_price
            sigma_new = sigma - diff / vega
            
            if abs(sigma_new - sigma) < tolerance:
                return sigma_new
            
            sigma = max(0.01, sigma_new)  # Ensure positive volatility
        
        return None


class BinomialTree:
    """Binomial Tree pricing model for American and European options."""
    
    def __init__(self, risk_free_rate: float = 0.05, steps: int = 100):
        """
        Initialize Binomial Tree model.
        
        Args:
            risk_free_rate: Annual risk-free interest rate (default 5%)
            steps: Number of time steps in the tree (default 100)
        """
        self.r = risk_free_rate
        self.steps = steps
    
    def _calculate_parameters(self, S: float, K: float, T: float, sigma: float) -> Tuple[float, float, float]:
        """Calculate binomial tree parameters."""
        if T <= 0 or sigma <= 0 or self.steps <= 0:
            return 1.0, 1.0, 0.5
        dt = T / self.steps
        u = math.exp(sigma * math.sqrt(dt))
        d = 1 / u
        p = (math.exp(self.r * dt) - d) / (u - d)
        return u, d, p
    
    def calculate_european_call(self, S: float, K: float, T: float, sigma: float) -> float:
        """
        Calculate European call option price using Binomial Tree.
        
        Args:
            S: Current stock price
            K: Strike price
            T: Time to expiration (in years)
            sigma: Volatility (annualized)
        
        Returns:
            Call option price
        """
        u, d, p = self._calculate_parameters(S, K, T, sigma)
        
        # Initialize option values at maturity
        option_values = []
        for i in range(self.steps + 1):
            stock_price = S * (u ** (self.steps - i)) * (d ** i)
            option_values.append(max(0, stock_price - K))
        
        # Backward induction
        for j in range(self.steps - 1, -1, -1):
            for i in range(j + 1):
                option_values[i] = (
                    p * option_values[i] + (1 - p) * option_values[i + 1]
                ) * math.exp(-self.r * T / self.steps)
        
        return option_values[0]
    
    def calculate_european_put(self, S: float, K: float, T: float, sigma: float) -> float:
        """
        Calculate European put option price using Binomial Tree.
        
        Args:
            S: Current stock price
            K: Strike price
            T: Time to expiration (in years)
            sigma: Volatility (annualized)
        
        Returns:
            Put option price
        """
        u, d, p = self._calculate_parameters(S, K, T, sigma)
        
        # Initialize option values at maturity
        option_values = []
        for i in range(self.steps + 1):
            stock_price = S * (u ** (self.steps - i)) * (d ** i)
            option_values.append(max(0, K - stock_price))
        
        # Backward induction
        for j in range(self.steps - 1, -1, -1):
            for i in range(j + 1):
                option_values[i] = (
                    p * option_values[i] + (1 - p) * option_values[i + 1]
                ) * math.exp(-self.r * T / self.steps)
        
        return option_values[0]
    
    def calculate_american_call(self, S: float, K: float, T: float, sigma: float) -> float:
        """
        Calculate American call option price using Binomial Tree with early exercise.
        
        Args:
            S: Current stock price
            K: Strike price
            T: Time to expiration (in years)
            sigma: Volatility (annualized)
        
        Returns:
            Call option price
        """
        u, d, p = self._calculate_parameters(S, K, T, sigma)
        
        # Initialize option values at maturity
        option_values = []
        for i in range(self.steps + 1):
            stock_price = S * (u ** (self.steps - i)) * (d ** i)
            option_values.append(max(0, stock_price - K))
        
        # Backward induction with early exercise
        for j in range(self.steps - 1, -1, -1):
            for i in range(j + 1):
                stock_price = S * (u ** (j - i)) * (d ** i)
                intrinsic_value = max(0, stock_price - K)
                continuation_value = (
                    p * option_values[i] + (1 - p) * option_values[i + 1]
                ) * math.exp(-self.r * T / self.steps)
                option_values[i] = max(intrinsic_value, continuation_value)
        
        return option_values[0]
    
    def calculate_american_put(self, S: float, K: float, T: float, sigma: float) -> float:
        """
        Calculate American put option price using Binomial Tree with early exercise.
        
        Args:
            S: Current stock price
            K: Strike price
            T: Time to expiration (in years)
            sigma: Volatility (annualized)
        
        Returns:
            Put option price
        """
        u, d, p = self._calculate_parameters(S, K, T, sigma)
        
        # Initialize option values at maturity
        option_values = []
        for i in range(self.steps + 1):
            stock_price = S * (u ** (self.steps - i)) * (d ** i)
            option_values.append(max(0, K - stock_price))
        
        # Backward induction with early exercise
        for j in range(self.steps - 1, -1, -1):
            for i in range(j + 1):
                stock_price = S * (u ** (j - i)) * (d ** i)
                intrinsic_value = max(0, K - stock_price)
                continuation_value = (
                    p * option_values[i] + (1 - p) * option_values[i + 1]
                ) * math.exp(-self.r * T / self.steps)
                option_values[i] = max(intrinsic_value, continuation_value)
        
        return option_values[0]
