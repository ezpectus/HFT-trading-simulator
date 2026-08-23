# Conditional VaR (CVaR) Calculation
#
# Implements Conditional VaR (Expected Shortfall) calculation with
# tail risk analysis and extreme value theory support.

from dataclasses import dataclass

import numpy as np
from scipy import stats

from .var import VaRCalculator


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
        self.confidence_level = confidence_level
        self.time_horizon = time_horizon
        self.var_calculator = VaRCalculator(confidence_level, time_horizon)

    def calculate_cvar(self, returns: np.ndarray,
                      confidence_level: float | None = None,
                      time_horizon: float | None = None,
                      method: str = 'historical') -> CVaRResult:
        """Calculate Conditional VaR (Expected Shortfall)."""
        cl = confidence_level or self.confidence_level
        th = time_horizon or self.time_horizon

        var_result = self._calc_var(returns, cl, th, method)
        cvar_scaled = self._calc_cvar_tail(returns, var_result, cl, th, method)

        return CVaRResult(
            cvar_value=cvar_scaled, var_value=var_result.var_value,
            confidence_level=cl, time_horizon=th, method=method
        )

    def _calc_var(self, returns: np.ndarray, cl: float, th: float, method: str):
        """Calculate VaR using specified method."""
        if method == 'historical':
            return self.var_calculator.calculate_historical_var(returns, cl, th)
        elif method == 'parametric':
            return self.var_calculator.calculate_parametric_var(returns, cl, th)
        elif method == 'monte_carlo':
            return self.var_calculator.calculate_monte_carlo_var(returns, confidence_level=cl, time_horizon=th)
        else:
            raise ValueError(f"Unknown method: {method}")

    def _calc_cvar_tail(self, returns: np.ndarray, var_result, cl: float, th: float, method: str) -> float:
        """Calculate CVaR from tail returns beyond VaR threshold."""
        if method == 'historical':
            return self._cvar_historical(returns, var_result, th)
        elif method == 'parametric':
            return self._cvar_parametric(returns, cl, th)
        else:
            return self._cvar_monte_carlo(returns, var_result, th)

    @staticmethod
    def _cvar_historical(returns: np.ndarray, var_result, th: float) -> float:
        """Historical CVaR: average of returns below VaR."""
        var_threshold = var_result.var_value / np.sqrt(th)
        tail_returns = returns[returns < var_threshold]
        cvar = np.mean(tail_returns) if len(tail_returns) > 0 else var_result.var_value
        return cvar * np.sqrt(th)

    @staticmethod
    def _cvar_parametric(returns: np.ndarray, cl: float, th: float) -> float:
        """Parametric CVaR using normal distribution."""
        mean = np.mean(returns)
        std = np.std(returns)
        z_score = stats.norm.ppf(1 - cl)
        return mean * th - std * np.sqrt(th) * (stats.norm.pdf(z_score) / (1 - cl))

    @staticmethod
    def _cvar_monte_carlo(returns: np.ndarray, var_result, th: float) -> float:
        """Monte Carlo CVaR from simulated returns."""
        n_simulations = 10000
        mean = np.mean(returns)
        std = np.std(returns)
        rng = np.random.default_rng(seed=42)
        simulated = rng.normal(mean, std, n_simulations)
        var_threshold = var_result.var_value / np.sqrt(th)
        tail_returns = simulated[simulated < var_threshold]
        cvar = np.mean(tail_returns) if len(tail_returns) > 0 else var_result.var_value
        return cvar * np.sqrt(th)

    def calculate_expected_shortfall(self, returns: np.ndarray,
                                    confidence_level: float | None = None,
                                    time_horizon: float | None = None) -> CVaRResult:
        """Calculate Expected Shortfall (alias for CVaR)."""
        return self.calculate_cvar(returns, confidence_level, time_horizon, method='historical')

    def calculate_tail_risk_measures(self, returns: np.ndarray,
                                     confidence_level: float | None = None) -> dict:
        """Calculate tail risk measures."""
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
        """Calculate tail index using Hill estimator."""
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
                                 scenarios: dict[str, float]) -> dict:
        """Analyze CVaR under stress scenarios."""
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
