"""
Portfolio optimizer — Markowitz, Black-Litterman, Risk Parity.

Computes optimal asset allocation for a portfolio of crypto assets.

Methods:
  - Markowitz (Mean-Variance): maximize Sharpe ratio
  - Black-Litterman: combine market views with historical estimates
  - Risk Parity: equalize risk contribution across assets
  - Minimum Variance: minimize portfolio volatility

Usage:
    from src.strategies.portfolio_optimizer import PortfolioOptimizer

    opt = PortfolioOptimizer(method="markowitz")

    returns = pd.DataFrame({...})  # daily returns for each asset
    weights = opt.optimize(returns, target_return=0.001)

    # Black-Litterman with custom views
    bl_weights = opt.black_litterman(
        returns, market_caps, views={"BTC": 0.02, "ETH": -0.01}
    )
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np

logger = logging.getLogger(__name__)

try:
    import scipy.optimize as sco
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False


@dataclass
class OptimizationResult:
    weights: np.ndarray
    expected_return: float
    expected_volatility: float
    sharpe_ratio: float
    method: str
    success: bool
    message: str = ""


class PortfolioOptimizer:
    """Portfolio optimization with multiple methods."""

    def __init__(
        self,
        method: str = "markowitz",
        risk_free_rate: float = 0.0,
        max_weight: float = 0.40,
        min_weight: float = 0.0,
    ):
        self.method = method
        self.risk_free_rate = risk_free_rate
        self.max_weight = max_weight
        self.min_weight = min_weight

    def optimize(
        self,
        returns: np.ndarray,
        target_return: float | None = None,
        target_risk: float | None = None,
    ) -> OptimizationResult:
        """Optimize portfolio weights."""
        if not SCIPY_AVAILABLE:
            return self._equal_weight(returns, "scipy not available")

        if self.method == "markowitz":
            return self._markowitz(returns)
        elif self.method == "min_variance":
            return self._min_variance(returns, target_return)
        elif self.method == "risk_parity":
            return self._risk_parity(returns)
        else:
            return self._equal_weight(returns, f"unknown method: {self.method}")

    def _markowitz(self, returns: np.ndarray) -> OptimizationResult:
        """Maximize Sharpe ratio (tangency portfolio)."""
        n_assets = returns.shape[1]
        mean_returns = np.mean(returns, axis=0)
        cov_matrix = np.cov(returns, rowvar=False)

        def neg_sharpe(weights: np.ndarray) -> float:
            port_return = np.dot(weights, mean_returns)
            port_vol = np.sqrt(weights @ cov_matrix @ weights)
            if port_vol < 1e-10:
                return 1e6
            return -(port_return - self.risk_free_rate) / port_vol

        constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}]
        bounds = [(self.min_weight, self.max_weight)] * n_assets
        x0 = np.ones(n_assets) / n_assets

        result = sco.minimize(neg_sharpe, x0, method="SLSQP", bounds=bounds, constraints=constraints)

        weights = result.x
        port_return = np.dot(weights, mean_returns)
        port_vol = np.sqrt(weights @ cov_matrix @ weights)
        sharpe = (port_return - self.risk_free_rate) / port_vol if port_vol > 0 else 0

        return OptimizationResult(
            weights=weights, expected_return=port_return,
            expected_volatility=port_vol, sharpe_ratio=sharpe,
            method="markowitz", success=result.success, message=result.message,
        )

    def _min_variance(self, returns: np.ndarray, target_return: float | None = None) -> OptimizationResult:
        """Minimize portfolio variance."""
        n_assets = returns.shape[1]
        mean_returns = np.mean(returns, axis=0)
        cov_matrix = np.cov(returns, rowvar=False)

        def portfolio_variance(weights: np.ndarray) -> float:
            return weights @ cov_matrix @ weights

        constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}]
        if target_return is not None:
            constraints.append({
                "type": "eq",
                "fun": lambda w: np.dot(w, mean_returns) - target_return,
            })

        bounds = [(self.min_weight, self.max_weight)] * n_assets
        x0 = np.ones(n_assets) / n_assets

        result = sco.minimize(portfolio_variance, x0, method="SLSQP", bounds=bounds, constraints=constraints)

        weights = result.x
        port_return = np.dot(weights, mean_returns)
        port_vol = np.sqrt(weights @ cov_matrix @ weights)
        sharpe = (port_return - self.risk_free_rate) / port_vol if port_vol > 0 else 0

        return OptimizationResult(
            weights=weights, expected_return=port_return,
            expected_volatility=port_vol, sharpe_ratio=sharpe,
            method="min_variance", success=result.success, message=result.message,
        )

    def _risk_parity(self, returns: np.ndarray) -> OptimizationResult:
        """Equal risk contribution portfolio."""
        n_assets = returns.shape[1]
        cov_matrix = np.cov(returns, rowvar=False)
        mean_returns = np.mean(returns, axis=0)

        def risk_contribution_objective(weights: np.ndarray) -> float:
            port_vol = np.sqrt(weights @ cov_matrix @ weights)
            if port_vol < 1e-10:
                return 1e6
            marginal = cov_matrix @ weights
            contribution = weights * marginal / port_vol
            target = port_vol / n_assets
            return np.sum((contribution - target) ** 2)

        constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}]
        bounds = [(self.min_weight, self.max_weight)] * n_assets
        x0 = np.ones(n_assets) / n_assets

        result = sco.minimize(risk_contribution_objective, x0, method="SLSQP", bounds=bounds, constraints=constraints)

        weights = result.x
        port_return = np.dot(weights, mean_returns)
        port_vol = np.sqrt(weights @ cov_matrix @ weights)
        sharpe = (port_return - self.risk_free_rate) / port_vol if port_vol > 0 else 0

        return OptimizationResult(
            weights=weights, expected_return=port_return,
            expected_volatility=port_vol, sharpe_ratio=sharpe,
            method="risk_parity", success=result.success, message=result.message,
        )

    def black_litterman(
        self,
        returns: np.ndarray,
        market_caps: np.ndarray,
        views: dict[int, float],
        view_confidences: dict[int, float] | None = None,
        tau: float = 0.05,
    ) -> OptimizationResult:
        """Black-Litterman model combining market equilibrium with investor views."""
        n_assets = returns.shape[1]
        cov_matrix = np.cov(returns, rowvar=False)

        total_cap = np.sum(market_caps)
        if total_cap <= 0:
            return self._equal_weight(returns, "market_caps sum to 0")

        market_weights = market_caps / total_cap
        risk_aversion = 2.5
        equilibrium_returns = risk_aversion * cov_matrix @ market_weights

        P, Q = self._build_views_matrix(views, n_assets)
        omega = self._build_omega(P, cov_matrix, tau, view_confidences)

        bl_returns, bl_cov = self._compute_bl_posterior(
            equilibrium_returns, cov_matrix, tau, P, Q, omega, returns
        )
        if bl_returns is None:
            return self._equal_weight(returns, "BL: singular matrix in posterior")

        return self._optimize_bl(bl_returns, bl_cov, market_weights)

    @staticmethod
    def _build_views_matrix(
        views: dict[int, float], n_assets: int
    ) -> tuple[np.ndarray, np.ndarray]:
        """Build views matrices P and Q from investor views dict."""
        P = np.zeros((len(views), n_assets))
        Q = np.zeros(len(views))
        for i, (asset_idx, expected_ret) in enumerate(views.items()):
            P[i, asset_idx] = 1.0
            Q[i] = expected_ret
        return P, Q

    @staticmethod
    def _build_omega(
        P: np.ndarray, cov_matrix: np.ndarray, tau: float,
        view_confidences: dict[int, float] | None,
    ) -> np.ndarray:
        """Build Omega (view uncertainty matrix) from confidences or prior."""
        if view_confidences:
            return np.diag([1.0 / max(c, 0.01) for c in view_confidences.values()])
        return np.diag(np.diag(P @ (tau * cov_matrix) @ P.T))

    def _compute_bl_posterior(
        self, equilibrium_returns: np.ndarray, cov_matrix: np.ndarray,
        tau: float, P: np.ndarray, Q: np.ndarray, omega: np.ndarray,
        returns: np.ndarray,
    ) -> tuple[np.ndarray | None, np.ndarray]:
        """Compute Black-Litterman posterior returns and covariance."""
        tau_cov = tau * cov_matrix
        try:
            inv_matrix = np.linalg.inv(P @ tau_cov @ P.T + omega)
        except np.linalg.LinAlgError:
            return None, cov_matrix
        bl_returns = equilibrium_returns + tau_cov @ P.T @ inv_matrix @ (Q - P @ equilibrium_returns)
        bl_cov = cov_matrix + tau_cov - tau_cov @ P.T @ inv_matrix @ P @ tau_cov
        return bl_returns, bl_cov

    def _optimize_bl(
        self, bl_returns: np.ndarray, bl_cov: np.ndarray, x0: np.ndarray
    ) -> OptimizationResult:
        """Optimize portfolio with BL estimates (max Sharpe)."""
        def neg_sharpe(weights: np.ndarray) -> float:
            port_return = np.dot(weights, bl_returns)
            port_vol = np.sqrt(weights @ bl_cov @ weights)
            if port_vol < 1e-10:
                return 1e6
            return -(port_return - self.risk_free_rate) / port_vol

        n_assets = len(bl_returns)
        constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}]
        bounds = [(self.min_weight, self.max_weight)] * n_assets

        result = sco.minimize(neg_sharpe, x0, method="SLSQP", bounds=bounds, constraints=constraints)

        weights = result.x
        port_return = np.dot(weights, bl_returns)
        port_vol = np.sqrt(weights @ bl_cov @ weights)
        sharpe = (port_return - self.risk_free_rate) / port_vol if port_vol > 0 else 0

        return OptimizationResult(
            weights=weights, expected_return=port_return,
            expected_volatility=port_vol, sharpe_ratio=sharpe,
            method="black_litterman", success=result.success, message=result.message,
        )

    def _equal_weight(self, returns: np.ndarray, reason: str) -> OptimizationResult:
        """Fallback: equal weight portfolio."""
        n_assets = returns.shape[1]
        weights = np.ones(n_assets) / n_assets
        mean_returns = np.mean(returns, axis=0)
        cov_matrix = np.cov(returns, rowvar=False)
        port_return = np.dot(weights, mean_returns)
        port_vol = np.sqrt(weights @ cov_matrix @ weights)
        sharpe = (port_return - self.risk_free_rate) / port_vol if port_vol > 0 else 0

        return OptimizationResult(
            weights=weights, expected_return=port_return,
            expected_volatility=port_vol, sharpe_ratio=sharpe,
            method="equal_weight", success=False, message=reason,
        )

    def efficient_frontier(
        self, returns: np.ndarray, n_points: int = 50
    ) -> list[OptimizationResult]:
        """Compute efficient frontier."""
        if not SCIPY_AVAILABLE:
            return []

        mean_returns = np.mean(returns, axis=0)
        min_ret, max_ret = mean_returns.min(), mean_returns.max()
        target_returns = np.linspace(min_ret, max_ret, n_points)

        frontier = []
        for target in target_returns:
            result = self._min_variance(returns, target_return=target)
            if result.success:
                frontier.append(result)

        return frontier
