"""Unit tests for risk/cvar.py — CVaRCalculator with historical, parametric, Monte Carlo."""

import numpy as np
import pytest
from scipy import stats

from src.risk.cvar import CVaRCalculator, CVaRResult
from src.risk.var import VaRResult


# ─── Fixtures ───


@pytest.fixture
def returns() -> np.ndarray:
    """Deterministic normal returns (seeded)."""
    rng = np.random.default_rng(42)
    return rng.normal(0.001, 0.02, 500)


@pytest.fixture
def cvar_calc() -> CVaRCalculator:
    return CVaRCalculator(confidence_level=0.95, time_horizon=1.0)


# ─── Historical CVaR ───


def test_historical_cvar_more_negative_than_var(cvar_calc: CVaRCalculator, returns: np.ndarray) -> None:
    """CVaR should be more negative than VaR (average of tail losses)."""
    result = cvar_calc.calculate_cvar(returns, method="historical")
    assert result.cvar_value <= result.var_value
    assert result.method == "historical"


def test_historical_cvar_returns_cvar_result(cvar_calc: CVaRCalculator, returns: np.ndarray) -> None:
    """Historical CVaR should return CVaRResult with correct fields."""
    result = cvar_calc.calculate_cvar(returns, method="historical")
    assert isinstance(result, CVaRResult)
    assert result.confidence_level == 0.95
    assert result.time_horizon == 1.0


# ─── Parametric CVaR ───


def test_parametric_cvar_formula(cvar_calc: CVaRCalculator, returns: np.ndarray) -> None:
    """Parametric CVaR should match normal distribution formula."""
    result = cvar_calc.calculate_cvar(returns, method="parametric")
    mean = np.mean(returns)
    std = np.std(returns)
    z = stats.norm.ppf(0.05)
    expected = mean * 1.0 - std * np.sqrt(1.0) * (stats.norm.pdf(z) / 0.05)
    assert result.cvar_value == pytest.approx(expected, rel=1e-6)
    assert result.method == "parametric"


# ─── Monte Carlo CVaR ───


def test_monte_carlo_cvar_returns_result(cvar_calc: CVaRCalculator, returns: np.ndarray) -> None:
    """Monte Carlo CVaR should return a CVaRResult."""
    result = cvar_calc.calculate_cvar(returns, method="monte_carlo")
    assert isinstance(result, CVaRResult)
    assert result.method == "monte_carlo"


# ─── Invalid Method ───


def test_invalid_method_raises_valueerror(cvar_calc: CVaRCalculator, returns: np.ndarray) -> None:
    """Unknown method should raise ValueError."""
    with pytest.raises(ValueError, match="Unknown method"):
        cvar_calc.calculate_cvar(returns, method="invalid")


# ─── Expected Shortfall Alias ───


def test_expected_shortfall_equals_historical_cvar(cvar_calc: CVaRCalculator, returns: np.ndarray) -> None:
    """calculate_expected_shortfall should be alias for historical CVaR."""
    es = cvar_calc.calculate_expected_shortfall(returns)
    cvar = cvar_calc.calculate_cvar(returns, method="historical")
    assert es.cvar_value == pytest.approx(cvar.cvar_value, rel=1e-6)


# ─── Tail Risk Measures ───


def test_tail_risk_measures_returns_dict(cvar_calc: CVaRCalculator, returns: np.ndarray) -> None:
    """tail_risk_measures should return dict with required keys."""
    result = cvar_calc.calculate_tail_risk_measures(returns)
    assert "cvar" in result
    assert "var" in result
    assert "skewness" in result
    assert "kurtosis" in result
    assert "tail_index" in result
    assert "max_drawdown" in result
    assert "tail_ratio" in result


def test_tail_risk_measures_max_drawdown_negative(cvar_calc: CVaRCalculator, returns: np.ndarray) -> None:
    """Max drawdown should be ≤ 0."""
    result = cvar_calc.calculate_tail_risk_measures(returns)
    assert result["max_drawdown"] <= 0


# ─── Tail Index ───


def test_tail_index_insufficient_data_returns_inf(cvar_calc: CVaRCalculator) -> None:
    """Tail index with < 10 tail observations should return inf."""
    small_returns = np.array([-0.01, -0.02, -0.005])
    result = cvar_calc._calculate_tail_index(small_returns)
    assert result == float("inf")


def test_tail_index_normal_returns_finite(cvar_calc: CVaRCalculator, returns: np.ndarray) -> None:
    """Tail index for normal returns should be a positive finite number."""
    result = cvar_calc._calculate_tail_index(returns)
    assert result > 0
    assert np.isfinite(result)


# ─── Stress Scenarios ───


def test_stress_scenarios_returns_dict(cvar_calc: CVaRCalculator, returns: np.ndarray) -> None:
    """analyze_stress_scenarios should return dict keyed by scenario name."""
    scenarios = {"mild": 1.5, "severe": 3.0}
    results = cvar_calc.analyze_stress_scenarios(returns, scenarios)
    assert "mild" in results
    assert "severe" in results
    assert results["mild"]["shock_multiplier"] == 1.5
    assert results["severe"]["shock_multiplier"] == 3.0


def test_stress_scenarios_severe_worse_than_mild(cvar_calc: CVaRCalculator, returns: np.ndarray) -> None:
    """Higher shock multiplier should produce more negative CVaR."""
    scenarios = {"mild": 1.0, "severe": 3.0}
    results = cvar_calc.analyze_stress_scenarios(returns, scenarios)
    assert results["severe"]["cvar"] <= results["mild"]["cvar"]
