"""Unit tests for risk/var.py — VaRCalculator with historical, parametric, Monte Carlo methods."""

import numpy as np
import pytest
from scipy import stats

from src.risk.var import VaRCalculator, VaRResult

# ─── Fixtures ───


@pytest.fixture
def returns() -> np.ndarray:
    """Deterministic normal returns (seeded)."""
    rng = np.random.default_rng(42)
    return rng.normal(0.001, 0.02, 500)


@pytest.fixture
def var_calc() -> VaRCalculator:
    return VaRCalculator(confidence_level=0.95, time_horizon=1.0)


# ─── Historical VaR ───


def test_historical_var_returns_negative_value(var_calc: VaRCalculator, returns: np.ndarray) -> None:
    """Historical VaR should return a negative value (loss) at 95% confidence."""
    result = var_calc.calculate_historical_var(returns)
    assert result.var_value < 0
    assert result.method == "historical"
    assert result.confidence_level == 0.95


def test_historical_var_custom_confidence(var_calc: VaRCalculator, returns: np.ndarray) -> None:
    """Higher confidence should produce more negative VaR."""
    r95 = var_calc.calculate_historical_var(returns, confidence_level=0.95)
    r99 = var_calc.calculate_historical_var(returns, confidence_level=0.99)
    assert r99.var_value <= r95.var_value


def test_historical_var_time_horizon_scaling(var_calc: VaRCalculator, returns: np.ndarray) -> None:
    """Multi-day VaR should be scaled by sqrt(time)."""
    r1 = var_calc.calculate_historical_var(returns, time_horizon=1.0)
    r4 = var_calc.calculate_historical_var(returns, time_horizon=4.0)
    assert r4.var_value == pytest.approx(r1.var_value * 2.0, rel=1e-6)


# ─── Parametric VaR ───


def test_parametric_var_matches_normal_dist(var_calc: VaRCalculator, returns: np.ndarray) -> None:
    """Parametric VaR should match mean + z*std formula."""
    result = var_calc.calculate_parametric_var(returns)
    expected = np.mean(returns) + stats.norm.ppf(0.05) * np.std(returns)
    assert result.var_value == pytest.approx(expected, rel=1e-6)
    assert result.method == "parametric"


def test_parametric_var_time_horizon_linear_mean(var_calc: VaRCalculator, returns: np.ndarray) -> None:
    """Parametric VaR mean scales linearly with time, std by sqrt(t)."""
    result = var_calc.calculate_parametric_var(returns, time_horizon=5.0)
    mean = np.mean(returns)
    std = np.std(returns)
    z = stats.norm.ppf(0.05)
    expected = mean * 5.0 + z * std * np.sqrt(5.0)
    assert result.var_value == pytest.approx(expected, rel=1e-6)


# ─── Monte Carlo VaR ───


def test_monte_carlo_var_returns_result(var_calc: VaRCalculator, returns: np.ndarray) -> None:
    """Monte Carlo VaR should return a negative value at 95% confidence."""
    result = var_calc.calculate_monte_carlo_var(returns, n_simulations=5000)
    assert result.var_value < 0
    assert result.method == "monte_carlo"


def test_monte_carlo_var_fewer_simulations(var_calc: VaRCalculator, returns: np.ndarray) -> None:
    """Monte Carlo VaR should work with small simulation count."""
    result = var_calc.calculate_monte_carlo_var(returns, n_simulations=100)
    assert isinstance(result, VaRResult)
    assert result.method == "monte_carlo"


# ─── Multiple Confidence Levels ───


def test_var_multiple_levels_returns_dict(var_calc: VaRCalculator, returns: np.ndarray) -> None:
    """calculate_var_at_multiple_levels should return dict of results."""
    results = var_calc.calculate_var_at_multiple_levels(returns, [0.90, 0.95, 0.99])
    assert len(results) == 3
    assert 0.90 in results
    assert 0.95 in results
    assert 0.99 in results
    assert all(isinstance(r, VaRResult) for r in results.values())


def test_var_multiple_levels_default_levels(var_calc: VaRCalculator, returns: np.ndarray) -> None:
    """Default confidence levels should be [0.95, 0.99, 0.999]."""
    results = var_calc.calculate_var_at_multiple_levels(returns)
    assert len(results) == 3
    assert set(results.keys()) == {0.95, 0.99, 0.999}


# ─── Backtest ───


def test_backtest_var_returns_dict(var_calc: VaRCalculator, returns: np.ndarray) -> None:
    """backtest_var should return dict with required keys."""
    var_result = var_calc.calculate_historical_var(returns)
    bt = var_calc.backtest_var(returns, var_result, window_size=100)
    assert "violations" in bt
    assert "total_observations" in bt
    assert "violation_rate" in bt
    assert "expected_violations" in bt
    assert "kupiec_stat" in bt
    assert "passed" in bt


def test_backtest_var_empty_window(var_calc: VaRCalculator) -> None:
    """Backtest with insufficient data should have 0 observations."""
    small_returns = np.random.default_rng(42).normal(0, 0.01, 50)
    var_result = var_calc.calculate_historical_var(small_returns)
    bt = var_calc.backtest_var(small_returns, var_result, window_size=100)
    assert bt["total_observations"] == 0
    assert bt["violation_rate"] == 0


# ─── Kupiec Test ───


def test_kupiec_zero_violations(var_calc: VaRCalculator) -> None:
    """Kupiec test with 0 violations should return finite value."""
    stat = var_calc._kupiec_test(0, 100, 0.95)
    assert stat > 0
    assert np.isfinite(stat)


def test_kupiec_all_violations(var_calc: VaRCalculator) -> None:
    """Kupiec test with all violations should return inf."""
    stat = var_calc._kupiec_test(100, 100, 0.95)
    assert stat == float("inf")


def test_kupiec_normal_case(var_calc: VaRCalculator) -> None:
    """Kupiec test with expected violation rate should return small stat."""
    stat = var_calc._kupiec_test(5, 100, 0.95)
    assert stat >= 0
    assert np.isfinite(stat)


def test_kupiec_zero_observations(var_calc: VaRCalculator) -> None:
    """Kupiec test with 0 total observations should return 0."""
    stat = var_calc._kupiec_test(0, 0, 0.95)
    assert stat == 0.0
