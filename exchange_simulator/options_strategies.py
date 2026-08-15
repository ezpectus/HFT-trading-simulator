# Options Strategies Module
#
# Implements common options strategies including straddle, strangle, iron condor, and butterfly.
# Calculates payoff, max profit, max loss, and break-even points for each strategy.

from typing import List, Tuple, Optional
from dataclasses import dataclass
from enum import Enum

from exchange_simulator.options_pricing import OptionType, BlackScholes


class StrategyType(Enum):
    STRADDLE = "straddle"
    STRANGLE = "strangle"
    IRON_CONDOR = "iron_condor"
    BUTTERFLY = "butterfly"


@dataclass
class OptionLeg:
    """Represents a single option leg in a strategy."""
    option_type: OptionType
    strike: float
    position: int  # +1 for long, -1 for short
    premium: float  # Premium paid/received


@dataclass
class StrategyResult:
    """Result of a strategy calculation."""
    max_profit: float
    max_loss: float
    break_evens: List[float]
    payoff_at_expiry: List[Tuple[float, float]]  # (stock_price, payoff)


class OptionsStrategies:
    """Options strategies calculator."""
    
    def __init__(self, risk_free_rate: float = 0.05):
        """
        Initialize options strategies calculator.
        
        Args:
            risk_free_rate: Annual risk-free interest rate (default 5%)
        """
        self.bs = BlackScholes(risk_free_rate)
    
    def calculate_straddle(self, S: float, K: float, T: float, sigma: float, 
                          long: bool = True) -> StrategyResult:
        """
        Calculate straddle strategy (long call + long put or short call + short put).
        
        Args:
            S: Current stock price
            K: Strike price (same for both options)
            T: Time to expiration (in years)
            sigma: Volatility (annualized)
            long: True for long straddle, False for short straddle
        
        Returns:
            StrategyResult with payoff, max profit/loss, and break-evens
        """
        call_price = self.bs.calculate_call_price(S, K, T, sigma)
        put_price = self.bs.calculate_put_price(S, K, T, sigma)
        
        position = 1 if long else -1
        total_premium = position * (call_price + put_price)
        
        # Calculate payoff at various stock prices
        payoff_at_expiry = []
        for price in range(int(K * 0.5), int(K * 1.5) + 1, 1):
            call_payoff = position * max(0, price - K)
            put_payoff = position * max(0, K - price)
            total_payoff = call_payoff + put_payoff - total_premium
            payoff_at_expiry.append((float(price), total_payoff))
        
        # Calculate break-evens
        if long:
            # Long straddle: break-evens at K +/- total_premium
            break_evens = [K - total_premium, K + total_premium]
            max_loss = -total_premium
            max_profit = float('inf')  # Unlimited upside
        else:
            # Short straddle: break-evens at K +/- total_premium
            break_evens = [K - total_premium, K + total_premium]
            max_profit = total_premium
            max_loss = float('inf')  # Unlimited downside
        
        return StrategyResult(
            max_profit=max_profit,
            max_loss=max_loss,
            break_evens=break_evens,
            payoff_at_expiry=payoff_at_expiry
        )
    
    def calculate_strangle(self, S: float, K_call: float, K_put: float, T: float, 
                          sigma: float, long: bool = True) -> StrategyResult:
        """
        Calculate strangle strategy (long OTM call + long OTM put or short OTM call + short OTM put).
        
        Args:
            S: Current stock price
            K_call: Call strike price (higher strike)
            K_put: Put strike price (lower strike)
            T: Time to expiration (in years)
            sigma: Volatility (annualized)
            long: True for long strangle, False for short strangle
        
        Returns:
            StrategyResult with payoff, max profit/loss, and break-evens
        """
        call_price = self.bs.calculate_call_price(S, K_call, T, sigma)
        put_price = self.bs.calculate_put_price(S, K_put, T, sigma)
        
        position = 1 if long else -1
        total_premium = position * (call_price + put_price)
        
        # Calculate payoff at various stock prices
        payoff_at_expiry = []
        min_price = int(min(K_put, K_call) * 0.5)
        max_price = int(max(K_put, K_call) * 1.5)
        for price in range(min_price, max_price + 1, 1):
            call_payoff = position * max(0, price - K_call)
            put_payoff = position * max(0, K_put - price)
            total_payoff = call_payoff + put_payoff - total_premium
            payoff_at_expiry.append((float(price), total_payoff))
        
        # Calculate break-evens
        if long:
            # Long strangle: break-evens at K_call + premium and K_put - premium
            break_evens = [K_put - total_premium, K_call + total_premium]
            max_loss = -total_premium
            max_profit = float('inf')
        else:
            # Short strangle: break-evens at K_call + premium and K_put - premium
            break_evens = [K_put - total_premium, K_call + total_premium]
            max_profit = total_premium
            max_loss = float('inf')
        
        return StrategyResult(
            max_profit=max_profit,
            max_loss=max_loss,
            break_evens=break_evens,
            payoff_at_expiry=payoff_at_expiry
        )
    
    def calculate_iron_condor(self, S: float, K_call_high: float, K_call_low: float,
                             K_put_high: float, K_put_low: float, T: float,
                             sigma: float) -> StrategyResult:
        """
        Calculate iron condor strategy (bull put spread + bear call spread).
        
        Args:
            S: Current stock price
            K_call_high: Higher call strike (short)
            K_call_low: Lower call strike (long)
            K_put_high: Higher put strike (long)
            K_put_low: Lower put strike (short)
            T: Time to expiration (in years)
            sigma: Volatility (annualized)
        
        Returns:
            StrategyResult with payoff, max profit/loss, and break-evens
        """
        # Calculate premiums
        call_high_price = self.bs.calculate_call_price(S, K_call_high, T, sigma)
        call_low_price = self.bs.calculate_call_price(S, K_call_low, T, sigma)
        put_high_price = self.bs.calculate_put_price(S, K_put_high, T, sigma)
        put_low_price = self.bs.calculate_put_price(S, K_put_low, T, sigma)
        
        # Iron condor: short put spread + short call spread
        # Short put spread: short K_put_low, long K_put_high
        # Short call spread: short K_call_high, long K_call_low
        net_premium = (put_low_price - put_high_price) + (call_high_price - call_low_price)
        
        # Calculate payoff at various stock prices
        payoff_at_expiry = []
        min_price = int(min(K_put_low, K_put_high) * 0.5)
        max_price = int(max(K_call_high, K_call_low) * 1.5)
        for price in range(min_price, max_price + 1, 1):
            # Put spread payoff
            put_spread_payoff = max(0, K_put_low - price) - max(0, K_put_high - price)
            # Call spread payoff
            call_spread_payoff = max(0, price - K_call_high) - max(0, price - K_call_low)
            total_payoff = put_spread_payoff + call_spread_payoff + net_premium
            payoff_at_expiry.append((float(price), total_payoff))
        
        # Iron condor max profit is net premium received
        max_profit = net_premium
        
        # Max loss is the difference between strikes minus premium
        put_spread_width = K_put_high - K_put_low
        call_spread_width = K_call_high - K_call_low
        max_loss = -max(put_spread_width, call_spread_width) + net_premium
        
        # Break-evens
        break_evens = [
            K_put_low - net_premium,
            K_call_high + net_premium
        ]
        
        return StrategyResult(
            max_profit=max_profit,
            max_loss=max_loss,
            break_evens=break_evens,
            payoff_at_expiry=payoff_at_expiry
        )
    
    def calculate_butterfly(self, S: float, K_low: float, K_middle: float, K_high: float,
                           T: float, sigma: float, long: bool = True) -> StrategyResult:
        """
        Calculate butterfly spread strategy.
        
        Args:
            S: Current stock price
            K_low: Lower strike
            K_middle: Middle strike (body)
            K_high: Higher strike
            T: Time to expiration (in years)
            sigma: Volatility (annualized)
            long: True for long butterfly, False for short butterfly
        
        Returns:
            StrategyResult with payoff, max profit/loss, and break-evens
        """
        # Calculate premiums
        call_low_price = self.bs.calculate_call_price(S, K_low, T, sigma)
        call_middle_price = self.bs.calculate_call_price(S, K_middle, T, sigma)
        call_high_price = self.bs.calculate_call_price(S, K_high, T, sigma)
        
        if long:
            # Long butterfly: long 1 K_low, short 2 K_middle, long 1 K_high
            net_premium = call_low_price - 2 * call_middle_price + call_high_price
            position = 1
        else:
            # Short butterfly: short 1 K_low, long 2 K_middle, short 1 K_high
            net_premium = -call_low_price + 2 * call_middle_price - call_high_price
            position = -1
        
        # Calculate payoff at various stock prices
        payoff_at_expiry = []
        min_price = int(K_low * 0.5)
        max_price = int(K_high * 1.5)
        for price in range(min_price, max_price + 1, 1):
            if long:
                payoff = (
                    max(0, price - K_low) 
                    - 2 * max(0, price - K_middle) 
                    + max(0, price - K_high)
                ) - net_premium
            else:
                payoff = (
                    -max(0, price - K_low) 
                    + 2 * max(0, price - K_middle) 
                    - max(0, price - K_high)
                ) - net_premium
            payoff_at_expiry.append((float(price), payoff))
        
        if long:
            # Long butterfly: max profit at K_middle
            max_profit = K_middle - K_low - net_premium
            max_loss = -net_premium
        else:
            # Short butterfly: max profit is premium received
            max_profit = -net_premium
            max_loss = -(K_middle - K_low) - net_premium
        
        # Break-evens
        if long:
            break_evens = [
                K_low + net_premium,
                K_high - net_premium
            ]
        else:
            break_evens = [
                K_low - net_premium,
                K_high + net_premium
            ]
        
        return StrategyResult(
            max_profit=max_profit,
            max_loss=max_loss,
            break_evens=break_evens,
            payoff_at_expiry=payoff_at_expiry
        )
    
    def calculate_strategy_payoff(self, legs: List[OptionLeg], stock_price: float) -> float:
        """
        Calculate payoff for a custom strategy at a given stock price.
        
        Args:
            legs: List of option legs
            stock_price: Stock price at expiration
        
        Returns:
            Total payoff
        """
        total_payoff = 0
        for leg in legs:
            if leg.option_type == OptionType.CALL:
                option_payoff = max(0, stock_price - leg.strike)
            else:
                option_payoff = max(0, leg.strike - stock_price)
            
            total_payoff += leg.position * option_payoff - leg.position * leg.premium
        
        return total_payoff
