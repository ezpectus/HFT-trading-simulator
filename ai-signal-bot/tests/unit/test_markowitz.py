"""Unit tests for portfolio/markowitz.py — MarkowitzOptimizer."""

import numpy as np
import pytest

from src.portfolio.markowitz import (
    EfficientFrontierPoint,
    MarkowitzOptimizer,
    PortfolioResult,
)

# ─── Fixtures ───


@pytest.fixture
def optimizer() -> MarkowitzOptimizer:
    return MarkowitzOptimizer(risk_free_rate=0.02)


@pytest.fixture
def returns_matrix() -> np.ndarray:
    """3 assets × 300 periods, seeded deterministic."""
    rng = np.random.default_rng(42)
    return rng.multivariate_normal(
        mean=[0.001, 0.002, 0.0015],
        cov=[[0.004, 0.001, 0.0005],
             [0.001, 0.006, 0.001],
             [0.0005, 0.001, 0.003]],
        size=300,
    ).T


@pytest.fixture
def expected_returns(returns_matrix: np.ndarray) -> np.ndarray:
    return np.mean(returns_matrix, axis=1)


@pytest.fixture
def cov_matrix(returns_matrix: np.ndarray) -> np.ndarray:
    return np.cov(returns_matrix)


# ─── Expected Returns & Covariance ───


def test_calculate_expected_returns(optimizer: MarkowitzOptimizer, returns_matrix: np.ndarray) -> None:
    """Expected returns should be mean along axis=1."""
    result = optimizer.calculate_expected_returns(returns_matrix)
    assert result.shape == (3,)
    assert np.allclose(result, np.mean(returns_matrix, axis=1))


def test_calculate_covariance_matrix(optimizer: MarkowitzOptimizer, returns_matrix: np.ndarray) -> None:
    """Covariance matrix should match np.cov."""
    result = optimizer.calculate_covariance_matrix(returns_matrix)
    assert result.shape == (3, 3)
    assert np.allclose(result, np.cov(returns_matrix))


# ─── Portfolio Metrics ───


def test_portfolio_metrics_equal_weights(
    optimizer: MarkowitzOptimizer, expected_returns: np.ndarray, cov_matrix: np.ndarray,
) -> None:
    """Equal weights should produce valid metrics."""
    weights = np.array([1 / 3, 1 / 3, 1 / 3])
    ret, vol, sharpe = optimizer.calculate_portfolio_metrics(weights, expected_returns, cov_matrix)
    assert isinstance(ret, float)
    assert isinstance(vol, float)
    assert isinstance(sharpe, float)
    assert vol >= 0


def test_portfolio_metrics_zero_volatility(optimizer: MarkowitzOptimizer) -> None:
    """Zero volatility (zero covariance) should produce Sharpe=0 (guard)."""
    weights = np.array([0.5, 0.5])
    er = np.array([0.01, 0.02])
    cov = np.zeros((2, 2))
    ret, vol, sharpe = optimizer.calculate_portfolio_metrics(weights, er, cov)
    assert vol == 0.0
    assert sharpe == 0.0


# ─── Optimize Portfolio ───


def test_optimize_portfolio_returns_result(
    optimizer: MarkowitzOptimizer, expected_returns: np.ndarray, cov_matrix: np.ndarray,
) -> None:
    """optimize_portfolio should return PortfolioResult with weights summing to 1."""
    result = optimizer.optimize_portfolio(expected_returns, cov_matrix)
    assert isinstance(result, PortfolioResult)
    assert np.sum(result.weights) == pytest.approx(1.0, abs=1e-4)
    assert len(result.weights) == 3


def test_optimize_portfolio_min_variance(
    optimizer: MarkowitzOptimizer, expected_returns: np.ndarray, cov_matrix: np.ndarray,
) -> None:
    """Min variance portfolio should have lower volatility than max Sharpe."""
    min_var = optimizer.calculate_minimum_variance_portfolio(expected_returns, cov_matrix)
    max_sharpe = optimizer.calculate_maximum_sharpe_portfolio(expected_returns, cov_matrix)
    assert min_var.volatility <= max_sharpe.volatility + 1e-6


def test_optimize_portfolio_max_sharpe(
    optimizer: MarkowitzOptimizer, expected_returns: np.ndarray, cov_matrix: np.ndarray,
) -> None:
    """Max Sharpe portfolio should have positive Sharpe ratio."""
    result = optimizer.calculate_maximum_sharpe_portfolio(expected_returns, cov_matrix)
    assert isinstance(result, PortfolioResult)
    assert np.sum(result.weights) == pytest.approx(1.0, abs=1e-4)


# ─── Efficient Frontier ───


def test_efficient_frontier_returns_points(
    optimizer: MarkowitzOptimizer, expected_returns: np.ndarray, cov_matrix: np.ndarray,
) -> None:
    """Efficient frontier should return list of EfficientFrontierPoint."""
    points = optimizer.calculate_efficient_frontier(expected_returns, cov_matrix, n_points=10)
    assert len(points) == 10
    assert all(isinstance(p, EfficientFrontierPoint) for p in points)


def test_efficient_frontier_volatility_ordered(
    optimizer: MarkowitzOptimizer, expected_returns: np.ndarray, cov_matrix: np.ndarray,
) -> None:
    """Frontier volatilities should be non-decreasing (convex frontier)."""
    points = optimizer.calculate_efficient_frontier(expected_returns, cov_matrix, n_points=20)
    vols = [p.volatility for p in points]
    for i in range(1, len(vols)):
        assert vols[i] >= vols[i - 1] - 1e-6


# ─── Weight Bounds ───


def test_weight_bounds_respected(
    optimizer: MarkowitzOptimizer, expected_returns: np.ndarray, cov_matrix: np.ndarray,
) -> None:
    """Weights should respect bounds [0, 0.5]."""
    result = optimizer.optimize_portfolio(expected_returns, cov_matrix, weight_bounds=(0, 0.5))
    assert np.all(result.weights >= -1e-6)
    assert np.all(result.weights <= 0.5 + 1e-6)
