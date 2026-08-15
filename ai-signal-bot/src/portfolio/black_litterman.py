# Black-Litterman Model
#
# Implements the Black-Litterman model for portfolio optimization with
# incorporation of investor views and confidence levels.

import numpy as np
from typing import List, Tuple, Optional, Dict
from dataclasses import dataclass

from .markowitz import MarkowitzOptimizer, PortfolioResult


@dataclass
class View:
    """Investor view on asset returns."""
    assets: List[int]  # Asset indices
    weights: List[float]  # View weights (e.g., [1, -1] for relative view)
    expected_return: float  # Expected return of the view
    confidence: float  # Confidence level (0 to 1)


class BlackLittermanModel:
    """Black-Litterman portfolio optimization model."""
    
    def __init__(self, risk_free_rate: float = 0.02, tau: float = 0.05):
        """
        Initialize Black-Litterman model.
        
        Args:
            risk_free_rate: Annual risk-free rate (default 2%)
            tau: Uncertainty scaling parameter (default 0.05)
        """
        self.risk_free_rate = risk_free_rate
        self.tau = tau
        self.markowitz = MarkowitzOptimizer(risk_free_rate)
    
    def calculate_prior_returns(self, market_weights: np.ndarray, cov_matrix: np.ndarray,
                                risk_aversion: float = 3.0) -> np.ndarray:
        """
        Calculate prior (equilibrium) returns from market weights.
        
        Args:
            market_weights: Market capitalization weights (n_assets)
            cov_matrix: Covariance matrix (n_assets x n_assets)
            risk_aversion: Risk aversion parameter (default 3.0)
        
        Returns:
            Prior returns vector (n_assets)
        """
        # Equilibrium returns: pi = lambda * Sigma * w_m
        prior_returns = risk_aversion * np.dot(cov_matrix, market_weights)
        return prior_returns
    
    def incorporate_views(self, prior_returns: np.ndarray, cov_matrix: np.ndarray,
                         views: List[View]) -> Tuple[np.ndarray, np.ndarray]:
        """
        Incorporate investor views into prior returns.
        
        Args:
            prior_returns: Prior returns vector (n_assets)
            cov_matrix: Covariance matrix (n_assets x n_assets)
            views: List of View objects
        
        Returns:
            Tuple of (posterior_returns, posterior_covariance)
        """
        n_assets = len(prior_returns)
        n_views = len(views)
        
        if n_views == 0:
            return prior_returns, cov_matrix
        
        # Build P matrix (picking matrix for views)
        P = np.zeros((n_views, n_assets))
        for i, view in enumerate(views):
            for j, asset_idx in enumerate(view.assets):
                P[i, asset_idx] = view.weights[j]
        
        # Build Q vector (view returns)
        Q = np.array([view.expected_return for view in views])
        
        # Build Omega matrix (uncertainty in views)
        Omega = np.zeros((n_views, n_views))
        for i, view in enumerate(views):
            # View uncertainty = tau * P * Sigma * P^T / confidence
            view_cov = self.tau * np.dot(P[i:i+1], np.dot(cov_matrix, P[i:i+1].T))
            safe_confidence = max(view.confidence, 1e-10)
            Omega[i, i] = view_cov[0, 0] / safe_confidence
        
        # Calculate posterior returns
        # mu_BL = [(tau * Sigma)^-1 + P^T * Omega^-1 * P]^-1 * [(tau * Sigma)^-1 * pi + P^T * Omega^-1 * Q]
        try:
            tau_sigma_inv = np.linalg.inv(self.tau * cov_matrix)
            omega_inv = np.linalg.inv(Omega)

            M1 = tau_sigma_inv + np.dot(P.T, np.dot(omega_inv, P))
            M2 = np.dot(tau_sigma_inv, prior_returns) + np.dot(P.T, np.dot(omega_inv, Q))

            posterior_returns = np.dot(np.linalg.inv(M1), M2)

            # Calculate posterior covariance
            # Sigma_BL = Sigma + [(tau * Sigma)^-1 + P^T * Omega^-1 * P]^-1
            posterior_covariance = cov_matrix + np.linalg.inv(M1)
        except np.linalg.LinAlgError:
            posterior_returns = prior_returns
            posterior_covariance = cov_matrix
        
        return posterior_returns, posterior_covariance
    
    def optimize_portfolio(self, posterior_returns: np.ndarray, posterior_covariance: np.ndarray,
                          target_return: Optional[float] = None,
                          weight_bounds: Tuple[float, float] = (0, 1)) -> PortfolioResult:
        """
        Optimize portfolio using posterior returns and covariance.
        
        Args:
            posterior_returns: Posterior returns vector (n_assets)
            posterior_covariance: Posterior covariance matrix (n_assets x n_assets)
            target_return: Target portfolio return (if None, maximize Sharpe ratio)
            weight_bounds: Min and max weight bounds
        
        Returns:
            PortfolioResult with optimal weights
        """
        return self.markowitz.optimize_portfolio(
            posterior_returns,
            posterior_covariance,
            target_return=target_return,
            weight_bounds=weight_bounds
        )
    
    def calculate_black_litterman_portfolio(self, market_weights: np.ndarray,
                                          cov_matrix: np.ndarray,
                                          views: List[View],
                                          risk_aversion: float = 3.0,
                                          target_return: Optional[float] = None,
                                          weight_bounds: Tuple[float, float] = (0, 1)) -> PortfolioResult:
        """
        Calculate Black-Litterman optimal portfolio.
        
        Args:
            market_weights: Market capitalization weights (n_assets)
            cov_matrix: Covariance matrix (n_assets x n_assets)
            views: List of View objects
            risk_aversion: Risk aversion parameter
            target_return: Target portfolio return
            weight_bounds: Min and max weight bounds
        
        Returns:
            PortfolioResult with optimal weights
        """
        # Calculate prior returns
        prior_returns = self.calculate_prior_returns(market_weights, cov_matrix, risk_aversion)
        
        # Incorporate views
        posterior_returns, posterior_covariance = self.incorporate_views(
            prior_returns, cov_matrix, views
        )
        
        # Optimize portfolio
        return self.optimize_portfolio(
            posterior_returns,
            posterior_covariance,
            target_return=target_return,
            weight_bounds=weight_bounds
        )
    
    def compare_with_markowitz(self, market_weights: np.ndarray, cov_matrix: np.ndarray,
                               views: List[View],
                               risk_aversion: float = 3.0) -> Dict[str, PortfolioResult]:
        """
        Compare Black-Litterman with traditional Markowitz optimization.
        
        Args:
            market_weights: Market capitalization weights (n_assets)
            cov_matrix: Covariance matrix (n_assets x n_assets)
            views: List of View objects
            risk_aversion: Risk aversion parameter
        
        Returns:
            Dict with 'markowitz' and 'black_litterman' PortfolioResults
        """
        # Calculate prior returns
        prior_returns = self.calculate_prior_returns(market_weights, cov_matrix, risk_aversion)
        
        # Markowitz optimization (using prior returns)
        markowitz_result = self.markowitz.optimize_portfolio(
            prior_returns,
            cov_matrix,
            target_return=None,
            weight_bounds=(0, 1)
        )
        
        # Black-Litterman optimization
        bl_result = self.calculate_black_litterman_portfolio(
            market_weights,
            cov_matrix,
            views,
            risk_aversion,
            target_return=None,
            weight_bounds=(0, 1)
        )
        
        return {
            'markowitz': markowitz_result,
            'black_litterman': bl_result
        }
