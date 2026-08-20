# Value at Risk (VaR) Calculation
#
# Implements VaR calculation using historical, parametric, and Monte Carlo methods
# with support for multiple confidence levels and time horizons.

from dataclasses import dataclass

import numpy as np
from scipy import stats


@dataclass
class VaRResult:
    """Result of VaR calculation."""
    var_value: float
    confidence_level: float
    time_horizon: float
    method: str


class VaRCalculator:
    """Value at Risk calculator using multiple methods."""

    def __init__(self, confidence_level: float = 0.95, time_horizon: float = 1.0):
        """
        Initialize VaR calculator.

        Args:
            confidence_level: Confidence level (default 95%)
            time_horizon: Time horizon in days (default 1 day)
        """
        self.confidence_level = confidence_level
        self.time_horizon = time_horizon

    def calculate_historical_var(self, returns: np.ndarray,
                                 confidence_level: float | None = None,
                                 time_horizon: float | None = None) -> VaRResult:
        """
        Calculate VaR using historical simulation method.

        Args:
            returns: Historical returns
            confidence_level: Confidence level (uses default if None)
            time_horizon: Time horizon in days (uses default if None)

        Returns:
            VaRResult with VaR value
        """
        cl = confidence_level or self.confidence_level
        th = time_horizon or self.time_horizon

        # Calculate VaR at confidence level
        var = np.percentile(returns, (1 - cl) * 100)

        # Scale for time horizon (square root of time rule)
        var_scaled = var * np.sqrt(th)

        return VaRResult(
            var_value=var_scaled,
            confidence_level=cl,
            time_horizon=th,
            method='historical'
        )

    def calculate_parametric_var(self, returns: np.ndarray,
                                  confidence_level: float | None = None,
                                  time_horizon: float | None = None) -> VaRResult:
        """
        Calculate VaR using parametric (variance-covariance) method.

        Args:
            returns: Historical returns
            confidence_level: Confidence level (uses default if None)
            time_horizon: Time horizon in days (uses default if None)

        Returns:
            VaRResult with VaR value
        """
        cl = confidence_level or self.confidence_level
        th = time_horizon or self.time_horizon

        # Calculate mean and standard deviation
        mean = np.mean(returns)
        std = np.std(returns)

        # Calculate VaR using normal distribution
        z_score = stats.norm.ppf(1 - cl)

        # Scale for time horizon: mean scales linearly, std scales by sqrt(t)
        var_scaled = mean * th + z_score * std * np.sqrt(th)

        return VaRResult(
            var_value=var_scaled,
            confidence_level=cl,
            time_horizon=th,
            method='parametric'
        )

    def calculate_monte_carlo_var(self, returns: np.ndarray,
                                    n_simulations: int = 10000,
                                    confidence_level: float | None = None,
                                    time_horizon: float | None = None) -> VaRResult:
        """
        Calculate VaR using Monte Carlo simulation.

        Args:
            returns: Historical returns
            n_simulations: Number of Monte Carlo simulations
            confidence_level: Confidence level (uses default if None)
            time_horizon: Time horizon in days (uses default if None)

        Returns:
            VaRResult with VaR value
        """
        cl = confidence_level or self.confidence_level
        th = time_horizon or self.time_horizon

        # Estimate parameters from historical returns
        mean = np.mean(returns)
        std = np.std(returns)

        # Generate Monte Carlo simulations
        simulated_returns = np.random.normal(mean, std, n_simulations)

        # Calculate VaR from simulations
        var = np.percentile(simulated_returns, (1 - cl) * 100)

        # Scale for time horizon
        var_scaled = var * np.sqrt(th)

        return VaRResult(
            var_value=var_scaled,
            confidence_level=cl,
            time_horizon=th,
            method='monte_carlo'
        )

    def calculate_var_at_multiple_levels(self, returns: np.ndarray,
                                        confidence_levels: list[float] | None = None,
                                        method: str = 'historical') -> dict[float, VaRResult]:
        """
        Calculate VaR at multiple confidence levels.

        Args:
            returns: Historical returns
            confidence_levels: List of confidence levels
            method: Calculation method ('historical', 'parametric', 'monte_carlo')

        Returns:
            Dictionary mapping confidence levels to VaR results
        """
        if confidence_levels is None:
            confidence_levels = [0.95, 0.99, 0.999]

        results = {}

        for cl in confidence_levels:
            if method == 'historical':
                results[cl] = self.calculate_historical_var(returns, cl)
            elif method == 'parametric':
                results[cl] = self.calculate_parametric_var(returns, cl)
            elif method == 'monte_carlo':
                results[cl] = self.calculate_monte_carlo_var(returns, confidence_level=cl)

        return results

    def backtest_var(self, returns: np.ndarray, var_result: VaRResult,
                     window_size: int = 252) -> dict:
        """Backtest VaR model using historical data."""
        violations = 0
        total_observations = 0

        for i in range(window_size, len(returns)):
            window_returns = returns[i - window_size:i]
            var = self._compute_window_var(window_returns, var_result)
            if var is not None and returns[i] < var:
                violations += 1
            if var is not None:
                total_observations += 1

        expected_violations = (1 - var_result.confidence_level) * total_observations
        kupiec_stat = self._kupiec_test(violations, total_observations, var_result.confidence_level)

        return {
            'violations': violations,
            'total_observations': total_observations,
            'violation_rate': violations / total_observations if total_observations > 0 else 0,
            'expected_violations': expected_violations,
            'kupiec_stat': kupiec_stat,
            'passed': kupiec_stat < 3.84
        }

    def _compute_window_var(self, window_returns: np.ndarray, var_result: VaRResult) -> float | None:
        """Compute VaR for a rolling window. Returns None for unsupported methods."""
        if var_result.method == 'historical':
            return np.percentile(window_returns, (1 - var_result.confidence_level) * 100)
        elif var_result.method == 'parametric':
            mean = np.mean(window_returns)
            std = np.std(window_returns)
            z_score = stats.norm.ppf(1 - var_result.confidence_level)
            return mean + z_score * std
        return None

    def _kupiec_test(self, violations: int, total_observations: int,
                     confidence_level: float) -> float:
        """
        Perform Kupiec test for VaR model validation.

        Args:
            violations: Number of VaR violations
            total_observations: Total observations
            confidence_level: VaR confidence level

        Returns:
            Kupiec test statistic
        """
        p = 1 - confidence_level
        n = total_observations

        if violations == 0:
            # lim x->0+ of x*log(x/(n*p)) = 0, so LR = -2*n*log(1-p)
            # 0 violations when expected > 0 means model is too conservative
            if n == 0 or p == 0:
                return 0.0
            return -2 * n * np.log(1 - p)

        if violations == total_observations:
            # lim (n-x)->0+ of (n-x)*log((n-x)/(n*(1-p))) = 0, so LR = -2*n*log(p)
            if p == 0:
                return float('inf')
            return -2 * n * np.log(p)

        x = violations

        # Likelihood ratio test
        lr = 2 * (x * np.log(x / (n * p)) + (n - x) * np.log((n - x) / (n * (1 - p))))

        return lr
