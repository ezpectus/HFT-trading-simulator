# Conditional VaR (CVaR) Calculation
#
# Implements Conditional VaR (Expected Shortfall) calculation with
# tail risk analysis and extreme value theory support.

import numpy as np
from typing import Optional, Dict, List
from dataclasses import dataclass
from scipy import stats

from .var import VaRCalculator, VaRResult


@dataclass
class CVaRResult:
    """Result of CVaR calculation."""
    cvar_value: float
    var_value: float
    confidence_level: float
    time_horizon: float
    method: str


class CVaRCalculator:
    """Conditional VaR (Expected Shortfall) calculator."""
    
    def __init__(self, confidence_level: float = 0.95, time_horizon: float = 1.0):
        """
        Initialize CVaR calculator.
        
        Args:
            confidence_level: Confidence level (default 95%)
            time_horizon: Time horizon in days (default 1 day)
        """
        self.confidence_level = confidence_level
        self.time_horizon = time_horizon
        self.var_calculator = VaRCalculator(confidence_level, time_horizon)
    
    def calculate_cvar(self, returns: np.ndarray,
                      confidence_level: Optional[float] = None,
                      time_horizon: Optional[float] = None,
                      method: str = 'historical') -> CVaRResult:
        """
        Calculate Conditional VaR (Expected Shortfall).
        
        Args:
            returns: Historical returns
            confidence_level: Confidence level (uses default if None)
            time_horizon: Time horizon in days (uses default if None)
            method: VaR calculation method ('historical', 'parametric', 'monte_carlo')
        
        Returns:
            CVaRResult with CVaR value
        """
        cl = confidence_level or self.confidence_level
        th = time_horizon or self.time_horizon
        
        # Calculate VaR first
        if method == 'historical':
            var_result = self.var_calculator.calculate_historical_var(returns, cl, th)
        elif method == 'parametric':
            var_result = self.var_calculator.calculate_parametric_var(returns, cl, th)
        elif method == 'monte_carlo':
            var_result = self.var_calculator.calculate_monte_carlo_var(returns, confidence_level=cl, time_horizon=th)
        else:
            raise ValueError(f"Unknown method: {method}")
        
        # Calculate CVaR (average of returns exceeding VaR)
        if method == 'historical':
            # Historical CVaR: average of returns below VaR
            var_threshold = var_result.var_value / np.sqrt(th)  # Unscale for comparison
            tail_returns = returns[returns < var_threshold]
            cvar = np.mean(tail_returns) if len(tail_returns) > 0 else var_result.var_value
            cvar_scaled = cvar * np.sqrt(th)
        
        elif method == 'parametric':
            # Parametric CVaR using normal distribution
            mean = np.mean(returns)
            std = np.std(returns)
            z_score = stats.norm.ppf(1 - cl)
            # CVaR for normal distribution
            cvar = mean - std * (stats.norm.pdf(z_score) / (1 - cl))
            cvar_scaled = cvar * np.sqrt(th)
        
        elif method == 'monte_carlo':
            # Monte Carlo CVaR
            n_simulations = 10000
            mean = np.mean(returns)
            std = np.std(returns)
            simulated_returns = np.random.normal(mean, std, n_simulations)
            var_threshold = var_result.var_value / np.sqrt(th)
            tail_returns = simulated_returns[simulated_returns < var_threshold]
            cvar = np.mean(tail_returns) if len(tail_returns) > 0 else var_result.var_value
            cvar_scaled = cvar * np.sqrt(th)
        
        return CVaRResult(
            cvar_value=cvar_scaled,
            var_value=var_result.var_value,
            confidence_level=cl,
            time_horizon=th,
            method=method
        )
    
    def calculate_expected_shortfall(self, returns: np.ndarray,
                                    confidence_level: Optional[float] = None,
                                    time_horizon: Optional[float] = None) -> CVaRResult:
        """
        Calculate Expected Shortfall (alias for CVaR).
        
        Args:
            returns: Historical returns
            confidence_level: Confidence level (uses default if None)
            time_horizon: Time horizon in days (uses default if None)
        
        Returns:
            CVaRResult with Expected Shortfall value
        """
        return self.calculate_cvar(returns, confidence_level, time_horizon, method='historical')
    
    def calculate_tail_risk_measures(self, returns: np.ndarray,
                                     confidence_level: Optional[float] = None) -> Dict:
        """
        Calculate tail risk measures.
        
        Args:
            returns: Historical returns
            confidence_level: Confidence level (uses default if None)
        
        Returns:
            Dictionary with tail risk measures
        """
        cl = confidence_level or self.confidence_level
        
        # Calculate CVaR
        cvar_result = self.calculate_cvar(returns, cl)
        
        # Calculate skewness (measure of tail asymmetry)
        skewness = stats.skew(returns)
        
        # Calculate kurtosis (measure of tail fatness)
        kurtosis = stats.kurtosis(returns)
        
        # Calculate tail index (extreme value theory)
        tail_index = self._calculate_tail_index(returns)
        
        # Calculate maximum drawdown
        cumulative_returns = np.cumprod(1 + returns)
        running_max = np.maximum.accumulate(cumulative_returns)
        drawdown = (cumulative_returns - running_max) / running_max
        max_drawdown = np.min(drawdown)
        
        return {
            'cvar': cvar_result.cvar_value,
            'var': cvar_result.var_value,
            'skewness': skewness,
            'kurtosis': kurtosis,
            'tail_index': tail_index,
            'max_drawdown': max_drawdown,
            'tail_ratio': abs(cvar_result.cvar_value / cvar_result.var_value) if cvar_result.var_value != 0 else 0
        }
    
    def _calculate_tail_index(self, returns: np.ndarray, threshold: float = 0.95) -> float:
        """
        Calculate tail index using Hill estimator.
        
        Args:
            returns: Historical returns
            threshold: Threshold for tail (default 95th percentile)
        
        Returns:
            Tail index estimate
        """
        # Sort returns
        sorted_returns = np.sort(returns)

        # Get tail (left tail for losses) — use absolute values for Hill estimator
        tail_threshold = np.percentile(sorted_returns, (1 - threshold) * 100)
        tail_losses = np.abs(sorted_returns[sorted_returns < tail_threshold])

        if len(tail_losses) < 10:
            return float('inf')  # Not enough data

        # Hill estimator: excesses over the threshold
        # Sort descending so threshold is at the end
        tail_losses_sorted = np.sort(tail_losses)[::-1]  # descending
        threshold_val = max(tail_losses_sorted[-1], 1e-12)
        excesses = tail_losses_sorted[:-1] / threshold_val
        log_excesses = np.log(excesses)

        n = len(log_excesses)
        if n == 0 or np.sum(log_excesses) == 0:
            return float('inf')
        tail_index = n / np.sum(log_excesses)
        
        return tail_index
    
    def analyze_stress_scenarios(self, returns: np.ndarray,
                                 scenarios: Dict[str, float]) -> Dict:
        """
        Analyze CVaR under stress scenarios.
        
        Args:
            returns: Historical returns
            scenarios: Dictionary of scenario name to shock multiplier
        
        Returns:
            Dictionary with scenario CVaR results
        """
        results = {}
        
        for scenario_name, shock_multiplier in scenarios.items():
            # Apply shock to returns
            shocked_returns = returns * shock_multiplier
            
            # Calculate CVaR
            cvar_result = self.calculate_cvar(shocked_returns)
            
            results[scenario_name] = {
                'cvar': cvar_result.cvar_value,
                'var': cvar_result.var_value,
                'shock_multiplier': shock_multiplier
            }
        
        return results
