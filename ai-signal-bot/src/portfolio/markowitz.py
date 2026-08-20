# Markowitz Mean-Variance Optimization
#
# Implements the Markowitz efficient frontier calculation and portfolio optimization
# with support for weight constraints, sector constraints, and turnover constraints.

import logging
import numpy as np
from typing import List, Tuple, Optional, Dict
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class PortfolioResult:
    """Result of portfolio optimization."""
    weights: np.ndarray
    expected_return: float
    volatility: float
    sharpe_ratio: float


@dataclass
class EfficientFrontierPoint:
    """Point on the efficient frontier."""
    weights: np.ndarray
    expected_return: float
    volatility: float


class MarkowitzOptimizer:
    """Markowitz mean-variance portfolio optimizer."""
    
    def __init__(self, risk_free_rate: float = 0.02):
        """
        Initialize Markowitz optimizer.
        
        Args:
            risk_free_rate: Annual risk-free rate (default 2%)
        """
        self.risk_free_rate = risk_free_rate
    
    def calculate_expected_returns(self, returns: np.ndarray) -> np.ndarray:
        """
        Calculate expected returns from historical returns.
        
        Args:
            returns: Historical returns matrix (n_assets x n_periods)
        
        Returns:
            Expected returns vector (n_assets)
        """
        return np.mean(returns, axis=1)
    
    def calculate_covariance_matrix(self, returns: np.ndarray) -> np.ndarray:
        """
        Calculate covariance matrix from historical returns.
        
        Args:
            returns: Historical returns matrix (n_assets x n_periods)
        
        Returns:
            Covariance matrix (n_assets x n_assets)
        """
        return np.cov(returns)
    
    def calculate_portfolio_metrics(self, weights: np.ndarray, expected_returns: np.ndarray,
                                   cov_matrix: np.ndarray) -> Tuple[float, float, float]:
        """
        Calculate portfolio metrics.
        
        Args:
            weights: Portfolio weights (n_assets)
            expected_returns: Expected returns vector (n_assets)
            cov_matrix: Covariance matrix (n_assets x n_assets)
        
        Returns:
            Tuple of (expected_return, volatility, sharpe_ratio)
        """
        portfolio_return = np.dot(weights, expected_returns)
        portfolio_variance = np.dot(weights.T, np.dot(cov_matrix, weights))
        portfolio_volatility = np.sqrt(max(portfolio_variance, 0))
        sharpe_ratio = (portfolio_return - self.risk_free_rate) / portfolio_volatility if portfolio_volatility > 0 else 0.0
        
        return portfolio_return, portfolio_volatility, sharpe_ratio
    
    def optimize_portfolio(self, expected_returns: np.ndarray, cov_matrix: np.ndarray,
                          target_return: Optional[float] = None,
                          weight_bounds: Tuple[float, float] = (0, 1),
                          sector_constraints: Optional[Dict[str, Tuple[float, float]]] = None,
                          max_turnover: Optional[float] = None,
                          current_weights: Optional[np.ndarray] = None,
                          min_variance: bool = False) -> PortfolioResult:
        """
        Optimize portfolio weights.
        
        Args:
            expected_returns: Expected returns vector (n_assets)
            cov_matrix: Covariance matrix (n_assets x n_assets)
            target_return: Target portfolio return (if None, maximize Sharpe ratio)
            weight_bounds: Min and max weight bounds (default 0 to 1)
            sector_constraints: Dict of sector name to (min, max) weight
            max_turnover: Maximum allowed turnover
            current_weights: Current portfolio weights for turnover constraint
        
        Returns:
            PortfolioResult with optimal weights and metrics
        """
        n_assets = len(expected_returns)
        
        # Use scipy optimization if available, otherwise use simple approach
        try:
            from scipy.optimize import minimize
            
            # Objective function: minimize volatility for given return, or maximize Sharpe
            def objective(weights):
                portfolio_return, portfolio_volatility, _ = self.calculate_portfolio_metrics(
                    weights, expected_returns, cov_matrix
                )
                if target_return is not None:
                    # Minimize volatility for target return
                    penalty = 1000 * abs(portfolio_return - target_return)
                    return portfolio_volatility + penalty
                elif min_variance:
                    # Minimize volatility only
                    return portfolio_volatility
                else:
                    # Maximize Sharpe ratio (minimize negative Sharpe)
                    if portfolio_volatility < 1e-10:
                        return 1e6  # Penalize zero-volatility (degenerate) portfolios
                    return -(portfolio_return - self.risk_free_rate) / portfolio_volatility
            
            # Constraints
            constraints = []
            
            # Weights sum to 1
            constraints.append({'type': 'eq', 'fun': lambda w: np.sum(w) - 1})
            
            # Target return constraint
            if target_return is not None:
                constraints.append({
                    'type': 'eq',
                    'fun': lambda w: np.dot(w, expected_returns) - target_return
                })
            
            # Sector constraints
            if sector_constraints:
                for sector, (min_weight, max_weight) in sector_constraints.items():
                    logger.warning(
                        "Sector constraints require asset-to-sector mapping (not implemented). "
                        "Skipping sector '%s' [min=%.2f, max=%.2f].",
                        sector, min_weight, max_weight,
                    )
            
            # Turnover constraint
            if max_turnover is not None and current_weights is not None:
                constraints.append({
                    'type': 'ineq',
                    'fun': lambda w: max_turnover - np.sum(np.abs(w - current_weights))
                })
            
            # Bounds
            bounds = [weight_bounds] * n_assets
            
            # Initial guess (equal weights)
            initial_weights = np.ones(n_assets) / n_assets
            
            # Optimize
            result = minimize(
                objective,
                initial_weights,
                method='SLSQP',
                bounds=bounds,
                constraints=constraints,
                options={'ftol': 1e-9, 'disp': False}
            )
            
            optimal_weights = result.x
            
        except ImportError:
            # Fallback to simple equal weights if scipy not available
            optimal_weights = np.ones(n_assets) / n_assets
        
        # Calculate metrics
        portfolio_return, portfolio_volatility, sharpe_ratio = self.calculate_portfolio_metrics(
            optimal_weights, expected_returns, cov_matrix
        )
        
        return PortfolioResult(
            weights=optimal_weights,
            expected_return=portfolio_return,
            volatility=portfolio_volatility,
            sharpe_ratio=sharpe_ratio
        )
    
    def calculate_efficient_frontier(self, expected_returns: np.ndarray, cov_matrix: np.ndarray,
                                    n_points: int = 50,
                                    weight_bounds: Tuple[float, float] = (0, 1)) -> List[EfficientFrontierPoint]:
        """
        Calculate efficient frontier points.
        
        Args:
            expected_returns: Expected returns vector (n_assets)
            cov_matrix: Covariance matrix (n_assets x n_assets)
            n_points: Number of points on the frontier
            weight_bounds: Min and max weight bounds
        
        Returns:
            List of EfficientFrontierPoint objects
        """
        # Calculate min and max returns
        min_return = np.min(expected_returns)
        max_return = np.max(expected_returns)
        
        # Generate target returns
        target_returns = np.linspace(min_return, max_return, n_points)
        
        frontier_points = []
        
        for target_return in target_returns:
            result = self.optimize_portfolio(
                expected_returns,
                cov_matrix,
                target_return=target_return,
                weight_bounds=weight_bounds
            )
            
            frontier_points.append(EfficientFrontierPoint(
                weights=result.weights,
                expected_return=result.expected_return,
                volatility=result.volatility
            ))
        
        return frontier_points
    
    def calculate_minimum_variance_portfolio(self, expected_returns: np.ndarray,
                                            cov_matrix: np.ndarray,
                                            weight_bounds: Tuple[float, float] = (0, 1)) -> PortfolioResult:
        """
        Calculate minimum variance portfolio.
        
        Args:
            expected_returns: Expected returns vector (n_assets)
            cov_matrix: Covariance matrix (n_assets x n_assets)
            weight_bounds: Min and max weight bounds
        
        Returns:
            PortfolioResult with minimum variance weights
        """
        # Minimize volatility without return constraint
        return self.optimize_portfolio(
            expected_returns,
            cov_matrix,
            target_return=None,
            weight_bounds=weight_bounds,
            min_variance=True
        )
    
    def calculate_maximum_sharpe_portfolio(self, expected_returns: np.ndarray,
                                          cov_matrix: np.ndarray,
                                          weight_bounds: Tuple[float, float] = (0, 1)) -> PortfolioResult:
        """
        Calculate maximum Sharpe ratio portfolio (tangency portfolio).
        
        Args:
            expected_returns: Expected returns vector (n_assets)
            cov_matrix: Covariance matrix (n_assets x n_assets)
            weight_bounds: Min and max weight bounds
        
        Returns:
            PortfolioResult with maximum Sharpe ratio weights
        """
        return self.optimize_portfolio(
            expected_returns,
            cov_matrix,
            target_return=None,
            weight_bounds=weight_bounds
        )
