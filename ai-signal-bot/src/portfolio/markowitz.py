# Markowitz Mean-Variance Optimization
#
# Implements the Markowitz efficient frontier calculation and portfolio optimization
# with support for weight constraints, sector constraints, and turnover constraints.

from src.observability.logging import get_logger
from dataclasses import dataclass

import numpy as np

logger = get_logger(__name__)


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
        self.risk_free_rate = risk_free_rate

    def calculate_expected_returns(self, returns: np.ndarray) -> np.ndarray:
        return np.mean(returns, axis=1)

    def calculate_covariance_matrix(self, returns: np.ndarray) -> np.ndarray:
        return np.cov(returns)

    def calculate_portfolio_metrics(self, weights: np.ndarray, expected_returns: np.ndarray,
                                   cov_matrix: np.ndarray) -> tuple[float, float, float]:
        portfolio_return = np.dot(weights, expected_returns)
        portfolio_variance = np.dot(weights.T, np.dot(cov_matrix, weights))
        portfolio_volatility = np.sqrt(max(portfolio_variance, 0))
        sharpe_ratio = (portfolio_return - self.risk_free_rate) / portfolio_volatility if portfolio_volatility > 0 else 0.0

        return portfolio_return, portfolio_volatility, sharpe_ratio

    def _make_objective(self, expected_returns, cov_matrix, target_return, min_variance):
        """Build the objective function for scipy optimization."""
        def objective(weights):
            portfolio_return, portfolio_volatility, _ = self.calculate_portfolio_metrics(
                weights, expected_returns, cov_matrix
            )
            if target_return is not None:
                return portfolio_volatility
            elif min_variance:
                return portfolio_volatility
            if portfolio_volatility < 1e-10:
                return 1e6
            return -(portfolio_return - self.risk_free_rate) / portfolio_volatility
        return objective

    def _build_constraints(self, expected_returns, target_return,
                           sector_constraints, max_turnover, current_weights):
        """Build optimization constraint list."""
        constraints = [{'type': 'eq', 'fun': lambda w: np.sum(w) - 1}]
        if target_return is not None:
            constraints.append({
                'type': 'eq',
                'fun': lambda w: np.dot(w, expected_returns) - target_return,
            })
        if sector_constraints:
            for sector, (min_w, max_w) in sector_constraints.items():
                logger.warning(
                    "Sector constraints require asset-to-sector mapping (not implemented). "
                    "Skipping sector '%s' [min=%.2f, max=%.2f].",
                    sector, min_w, max_w,
                )
        if max_turnover is not None and current_weights is not None:
            constraints.append({
                'type': 'ineq',
                'fun': lambda w: max_turnover - np.sum(np.abs(w - current_weights)),
            })
        return constraints

    def optimize_portfolio(self, expected_returns: np.ndarray, cov_matrix: np.ndarray,
                          target_return: float | None = None,
                          weight_bounds: tuple[float, float] = (0, 1),
                          sector_constraints: dict[str, tuple[float, float]] | None = None,
                          max_turnover: float | None = None,
                          current_weights: np.ndarray | None = None,
                          min_variance: bool = False) -> PortfolioResult:
        """Optimize portfolio weights using scipy SLSQP.

        Falls back to equal weights if scipy is not available.
        """
        n_assets = len(expected_returns)
        initial_weights = np.ones(n_assets) / n_assets
        try:
            from scipy.optimize import minimize
            objective = self._make_objective(expected_returns, cov_matrix, target_return, min_variance)
            constraints = self._build_constraints(
                expected_returns, target_return, sector_constraints, max_turnover, current_weights,
            )
            bounds = [weight_bounds] * n_assets
            result = minimize(
                objective, initial_weights, method='SLSQP',
                bounds=bounds, constraints=constraints,
                options={'ftol': 1e-9, 'disp': False},
            )
            optimal_weights = result.x
        except ImportError:
            optimal_weights = initial_weights
        portfolio_return, portfolio_volatility, sharpe_ratio = self.calculate_portfolio_metrics(
            optimal_weights, expected_returns, cov_matrix
        )
        return PortfolioResult(
            weights=optimal_weights, expected_return=portfolio_return,
            volatility=portfolio_volatility, sharpe_ratio=sharpe_ratio,
        )

    def calculate_efficient_frontier(self, expected_returns: np.ndarray, cov_matrix: np.ndarray,
                                    n_points: int = 50,
                                    weight_bounds: tuple[float, float] = (0, 1)) -> list[EfficientFrontierPoint]:
        """Calculate efficient frontier points."""
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

        frontier_points.sort(key=lambda p: p.volatility)
        return frontier_points

    def calculate_minimum_variance_portfolio(self, expected_returns: np.ndarray,
                                            cov_matrix: np.ndarray,
                                            weight_bounds: tuple[float, float] = (0, 1)) -> PortfolioResult:
        """Calculate minimum variance portfolio."""
        return self.optimize_portfolio(
            expected_returns,
            cov_matrix,
            target_return=None,
            weight_bounds=weight_bounds,
            min_variance=True
        )

    def calculate_maximum_sharpe_portfolio(self, expected_returns: np.ndarray,
                                          cov_matrix: np.ndarray,
                                          weight_bounds: tuple[float, float] = (0, 1)) -> PortfolioResult:
        """Calculate maximum Sharpe ratio portfolio (tangency portfolio)."""
        return self.optimize_portfolio(
            expected_returns,
            cov_matrix,
            target_return=None,
            weight_bounds=weight_bounds
        )
