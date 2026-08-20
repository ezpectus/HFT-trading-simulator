# Risk Parity Optimization
#
# Implements risk parity portfolio construction with equal risk contribution
# and support for risk budgeting and leverage limits.

import numpy as np
from dataclasses import dataclass

from .markowitz import PortfolioResult


@dataclass
class RiskContribution:
    """Risk contribution of an asset."""
    asset_index: int
    marginal_risk: float
    contribution: float
    percentage: float


class RiskParityOptimizer:
    """Risk parity portfolio optimizer."""
    
    def __init__(self, risk_free_rate: float = 0.02):
        """
        Initialize risk parity optimizer.
        
        Args:
            risk_free_rate: Annual risk-free rate (default 2%)
        """
        self.risk_free_rate = risk_free_rate
    
    def calculate_marginal_risk(self, weights: np.ndarray, cov_matrix: np.ndarray) -> np.ndarray:
        """
        Calculate marginal risk contribution for each asset.
        
        Args:
            weights: Portfolio weights (n_assets)
            cov_matrix: Covariance matrix (n_assets x n_assets)
        
        Returns:
            Marginal risk vector (n_assets)
        """
        portfolio_variance = np.dot(weights.T, np.dot(cov_matrix, weights))
        portfolio_volatility = np.sqrt(max(portfolio_variance, 0))
        
        if portfolio_volatility == 0:
            return np.zeros_like(weights)
        
        marginal_risk = np.dot(cov_matrix, weights) / portfolio_volatility
        
        return marginal_risk
    
    def calculate_risk_contributions(self, weights: np.ndarray, cov_matrix: np.ndarray) -> List[RiskContribution]:
        """
        Calculate risk contribution for each asset.
        
        Args:
            weights: Portfolio weights (n_assets)
            cov_matrix: Covariance matrix (n_assets x n_assets)
        
        Returns:
            List of RiskContribution objects
        """
        marginal_risk = self.calculate_marginal_risk(weights, cov_matrix)
        
        # Risk contribution = w_i * marginal_risk_i
        contributions = weights * marginal_risk
        
        # Calculate total risk
        total_risk = np.sum(contributions)
        
        # Create risk contribution objects
        risk_contributions = []
        for i in range(len(weights)):
            risk_contributions.append(RiskContribution(
                asset_index=i,
                marginal_risk=marginal_risk[i],
                contribution=contributions[i],
                percentage=contributions[i] / total_risk if total_risk > 0 else 0
            ))
        
        return risk_contributions
    
    def optimize_risk_parity(self, cov_matrix: np.ndarray,
                             weight_bounds: tuple[float, float] = (0, 1),
                             risk_budget: np.ndarray | None = None,
                             max_iterations: int = 1000,
                             tolerance: float = 1e-6) -> PortfolioResult:
        """Optimize portfolio for equal risk contribution (risk parity)."""
        n_assets = cov_matrix.shape[0]
        weights = np.ones(n_assets) / n_assets
        if risk_budget is None:
            risk_budget = np.ones(n_assets) / n_assets

        weights = self._iterate_risk_parity(weights, cov_matrix, weight_bounds, max_iterations, tolerance)

        portfolio_volatility = np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights)))
        portfolio_return = 0
        sharpe_ratio = (portfolio_return - self.risk_free_rate) / portfolio_volatility if portfolio_volatility > 0 else 0

        return PortfolioResult(
            weights=weights, expected_return=portfolio_return,
            volatility=portfolio_volatility, sharpe_ratio=sharpe_ratio
        )

    def _iterate_risk_parity(
        self, weights: np.ndarray, cov_matrix: np.ndarray,
        weight_bounds: tuple[float, float],
        max_iterations: int, tolerance: float,
    ) -> np.ndarray:
        """Run iterative risk parity optimization."""
        n_assets = cov_matrix.shape[0]
        for _ in range(max_iterations):
            marginal_risk = self.calculate_marginal_risk(weights, cov_matrix)
            safe_mr = np.where(np.abs(marginal_risk) < 1e-12, 1e-12, marginal_risk)
            new_weights = weights / safe_mr
            weight_sum = np.sum(new_weights)
            new_weights = new_weights / weight_sum if weight_sum > 0 else np.ones(n_assets) / n_assets
            new_weights = np.clip(new_weights, weight_bounds[0], weight_bounds[1])
            clip_sum = np.sum(new_weights)
            new_weights = new_weights / clip_sum if clip_sum > 0 else np.ones(n_assets) / n_assets
            if np.linalg.norm(new_weights - weights) < tolerance:
                break
            weights = new_weights
        return weights
    
    def calculate_leverage(self, weights: np.ndarray, cov_matrix: np.ndarray,
                          target_volatility: float) -> float:
        """
        Calculate required leverage to achieve target volatility.
        
        Args:
            weights: Portfolio weights (n_assets)
            cov_matrix: Covariance matrix (n_assets x n_assets)
            target_volatility: Target portfolio volatility
        
        Returns:
            Leverage factor
        """
        current_volatility = np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights)))
        
        if current_volatility == 0:
            return 1.0
        
        leverage = target_volatility / current_volatility
        return leverage
    
    def optimize_with_leverage(self, cov_matrix: np.ndarray,
                               target_volatility: float,
                               weight_bounds: tuple[float, float] = (0, 1),
                               max_leverage: float = 2.0) -> PortfolioResult:
        """
        Optimize risk parity portfolio with leverage to achieve target volatility.
        
        Args:
            cov_matrix: Covariance matrix (n_assets x n_assets)
            target_volatility: Target portfolio volatility
            weight_bounds: Min and max weight bounds
            max_leverage: Maximum allowed leverage
        
        Returns:
            PortfolioResult with leveraged risk parity weights
        """
        # Optimize risk parity
        result = self.optimize_risk_parity(cov_matrix, weight_bounds)
        
        # Calculate required leverage
        leverage = self.calculate_leverage(result.weights, cov_matrix, target_volatility)
        
        # Cap leverage
        leverage = min(leverage, max_leverage)
        
        # Apply leverage
        leveraged_weights = result.weights * leverage
        
        # Recalculate metrics with leverage
        portfolio_volatility = np.sqrt(np.dot(leveraged_weights.T, np.dot(cov_matrix, leveraged_weights)))
        portfolio_return = 0
        sharpe_ratio = (portfolio_return - self.risk_free_rate) / portfolio_volatility if portfolio_volatility > 0 else 0
        
        return PortfolioResult(
            weights=leveraged_weights,
            expected_return=portfolio_return,
            volatility=portfolio_volatility,
            sharpe_ratio=sharpe_ratio
        )
    
    def verify_risk_parity(self, weights: np.ndarray, cov_matrix: np.ndarray,
                          tolerance: float = 0.05) -> bool:
        """
        Verify if portfolio satisfies risk parity condition.
        
        Args:
            weights: Portfolio weights (n_assets)
            cov_matrix: Covariance matrix (n_assets x n_assets)
            tolerance: Tolerance for risk equality
        
        Returns:
            True if risk parity condition is satisfied
        """
        risk_contributions = self.calculate_risk_contributions(weights, cov_matrix)
        
        # Check if all risk contributions are within tolerance
        percentages = [rc.percentage for rc in risk_contributions]
        target_percentage = 1.0 / len(weights)
        
        for pct in percentages:
            if abs(pct - target_percentage) > tolerance:
                return False
        
        return True
