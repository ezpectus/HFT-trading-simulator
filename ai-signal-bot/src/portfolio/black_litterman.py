# Black-Litterman Model
#
# Implements the Black-Litterman model for portfolio optimization with
# incorporation of investor views and confidence levels.

from dataclasses import dataclass

import numpy as np

from .markowitz import MarkowitzOptimizer, PortfolioResult


@dataclass
class View:
    """Investor view on asset returns."""
    assets: list[int]  # Asset indices
    weights: list[float]  # View weights (e.g., [1, -1] for relative view)
    expected_return: float  # Expected return of the view
    confidence: float  # Confidence level (0 to 1)

    def __post_init__(self) -> None:
        if not 0 <= self.confidence <= 1:
            raise ValueError(f"View confidence must be in [0, 1], got {self.confidence}")


class BlackLittermanModel:
    """Black-Litterman portfolio optimization model."""

    def __init__(self, risk_free_rate: float = 0.02, tau: float = 0.05):
        self.risk_free_rate = risk_free_rate
        self.tau = tau
        self.markowitz = MarkowitzOptimizer(risk_free_rate)

    def calculate_prior_returns(self, market_weights: np.ndarray, cov_matrix: np.ndarray,
                                risk_aversion: float = 3.0) -> np.ndarray:
        prior_returns = risk_aversion * np.dot(cov_matrix, market_weights)
        return prior_returns

    def incorporate_views(self, prior_returns: np.ndarray, cov_matrix: np.ndarray,
                         views: list[View]) -> tuple[np.ndarray, np.ndarray]:
        """Incorporate investor views into prior returns."""
        n_views = len(views)
        if n_views == 0:
            return prior_returns, cov_matrix

        P, Q, Omega = self._build_view_matrices(views, prior_returns, cov_matrix)
        return self._compute_posterior(prior_returns, cov_matrix, P, Q, Omega)

    def _build_view_matrices(
        self, views: list[View], prior_returns: np.ndarray, cov_matrix: np.ndarray,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Build P, Q, and Omega matrices from views."""
        n_assets = len(prior_returns)
        n_views = len(views)
        P = np.zeros((n_views, n_assets))
        Q = np.array([view.expected_return for view in views])
        Omega = np.zeros((n_views, n_views))
        for i, view in enumerate(views):
            for j, asset_idx in enumerate(view.assets):
                P[i, asset_idx] = view.weights[j]
            view_cov = self.tau * np.dot(P[i:i+1], np.dot(cov_matrix, P[i:i+1].T))
            Omega[i, i] = view_cov[0, 0] / max(view.confidence, 1e-10)
        return P, Q, Omega

    def _compute_posterior(
        self, prior_returns: np.ndarray, cov_matrix: np.ndarray,
        P: np.ndarray, Q: np.ndarray, Omega: np.ndarray,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Compute posterior returns and covariance using BL formula."""
        try:
            tau_sigma_inv = np.linalg.inv(self.tau * cov_matrix)
            omega_inv = np.linalg.inv(Omega)
            M1 = tau_sigma_inv + np.dot(P.T, np.dot(omega_inv, P))
            M2 = np.dot(tau_sigma_inv, prior_returns) + np.dot(P.T, np.dot(omega_inv, Q))
            posterior_returns = np.dot(np.linalg.inv(M1), M2)
            posterior_covariance = cov_matrix + np.linalg.inv(M1)
        except np.linalg.LinAlgError:
            posterior_returns = prior_returns
            posterior_covariance = cov_matrix
        return posterior_returns, posterior_covariance

    def optimize_portfolio(self, posterior_returns: np.ndarray, posterior_covariance: np.ndarray,
                          target_return: float | None = None,
                          weight_bounds: tuple[float, float] = (0, 1)) -> PortfolioResult:
        return self.markowitz.optimize_portfolio(
            posterior_returns,
            posterior_covariance,
            target_return=target_return,
            weight_bounds=weight_bounds
        )

    def calculate_black_litterman_portfolio(self, market_weights: np.ndarray,
                                          cov_matrix: np.ndarray,
                                          views: list[View],
                                          risk_aversion: float = 3.0,
                                          target_return: float | None = None,
                                          weight_bounds: tuple[float, float] = (0, 1)) -> PortfolioResult:
        """Calculate Black-Litterman optimal portfolio."""
        prior_returns = self.calculate_prior_returns(market_weights, cov_matrix, risk_aversion)

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
                               views: list[View],
                               risk_aversion: float = 3.0) -> dict[str, PortfolioResult]:
        """Compare Black-Litterman with traditional Markowitz optimization."""
        prior_returns = self.calculate_prior_returns(market_weights, cov_matrix, risk_aversion)

        markowitz_result = self.markowitz.optimize_portfolio(
            prior_returns,
            cov_matrix,
            target_return=None,
            weight_bounds=(0, 1)
        )

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
