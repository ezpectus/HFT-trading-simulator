"""Unit tests for risk/stress_test.py — StressTestScenario with 4 scenario types."""

import numpy as np
import pytest

from src.risk.stress_test import StressTestResult, StressTestScenario


# ─── Fixtures ───


@pytest.fixture
def scenario() -> StressTestScenario:
    return StressTestScenario(initial_portfolio_value=100000)


@pytest.fixture
def prices() -> np.ndarray:
    return np.array([50000, 3000, 200])


@pytest.fixture
def positions() -> np.ndarray:
    return np.array([1.0, 5.0, 100.0])


# ─── 2008 Crisis ───


def test_crisis_2008_returns_result(scenario: StressTestScenario, prices: np.ndarray, positions: np.ndarray) -> None:
    """Crisis 2008 scenario should return StressTestResult."""
    result = scenario.crisis_2008_scenario(prices, positions)
    assert isinstance(result, StressTestResult)
    assert result.scenario_name == "2008 Financial Crisis"
    assert result.pnl < 0
    assert result.pnl_percentage < 0


def test_crisis_2008_50pct_drop(scenario: StressTestScenario, prices: np.ndarray, positions: np.ndarray) -> None:
    """2008 crisis should simulate ~50% drop (pnl ≈ -50%)."""
    result = scenario.crisis_2008_scenario(prices, positions)
    assert result.pnl_percentage == pytest.approx(-0.5, rel=0.01)


def test_crisis_2008_zero_portfolio(scenario: StressTestScenario) -> None:
    """Zero portfolio value should produce 0 pnl_percentage (guard)."""
    result = scenario.crisis_2008_scenario(np.array([0, 0]), np.array([0, 0]))
    assert result.pnl_percentage == 0.0


# ─── COVID Crash ───


def test_covid_crash_returns_result(scenario: StressTestScenario, prices: np.ndarray, positions: np.ndarray) -> None:
    """COVID crash scenario should return StressTestResult."""
    result = scenario.covid_crash_scenario(prices, positions)
    assert isinstance(result, StressTestResult)
    assert result.scenario_name == "COVID-19 Crash"
    assert result.pnl < 0


def test_covid_crash_30pct_drop(scenario: StressTestScenario, prices: np.ndarray, positions: np.ndarray) -> None:
    """COVID crash should simulate ~30% drop (pnl ≈ -30%)."""
    result = scenario.covid_crash_scenario(prices, positions)
    assert result.pnl_percentage == pytest.approx(-0.3, rel=0.01)


# ─── FTX Collapse ───


def test_ftx_collapse_returns_result(scenario: StressTestScenario, prices: np.ndarray, positions: np.ndarray) -> None:
    """FTX collapse scenario should return StressTestResult."""
    result = scenario.ftx_collapse_scenario(prices, positions)
    assert isinstance(result, StressTestResult)
    assert result.scenario_name == "FTX Collapse"
    assert result.pnl < 0


def test_ftx_collapse_crypto_exposure(scenario: StressTestScenario, prices: np.ndarray, positions: np.ndarray) -> None:
    """FTX collapse with 100% crypto exposure should be worse than 50%."""
    r_full = scenario.ftx_collapse_scenario(prices, positions, crypto_exposure=1.0)
    r_half = scenario.ftx_collapse_scenario(prices, positions, crypto_exposure=0.5)
    assert r_full.pnl < r_half.pnl


# ─── Custom Scenario ───


def test_custom_scenario_returns_result(scenario: StressTestScenario, prices: np.ndarray, positions: np.ndarray) -> None:
    """Custom scenario should return StressTestResult with custom name."""
    shocks = np.array([0.8, 0.9, 1.1])
    result = scenario.custom_scenario(prices, positions, shocks, scenario_name="MyScenario")
    assert result.scenario_name == "MyScenario"
    assert isinstance(result, StressTestResult)


def test_custom_scenario_zero_shock(scenario: StressTestScenario, prices: np.ndarray, positions: np.ndarray) -> None:
    """Zero price shock should produce zero PnL."""
    shocks = np.array([1.0, 1.0, 1.0])
    result = scenario.custom_scenario(prices, positions, shocks)
    assert result.pnl == pytest.approx(0.0)


# ─── Run All Scenarios ───


def test_run_all_scenarios_returns_list(scenario: StressTestScenario, prices: np.ndarray, positions: np.ndarray) -> None:
    """run_all_scenarios should return list of 3 results."""
    results = scenario.run_all_scenarios(prices, positions)
    assert len(results) == 3
    assert all(isinstance(r, StressTestResult) for r in results)


# ─── Summary ───


def test_generate_summary_returns_dict(scenario: StressTestScenario, prices: np.ndarray, positions: np.ndarray) -> None:
    """generate_summary should return dict with required keys."""
    results = scenario.run_all_scenarios(prices, positions)
    summary = scenario.generate_summary(results)
    assert "total_scenarios" in summary
    assert "passed_scenarios" in summary
    assert "pass_rate" in summary
    assert "worst_pnl_percentage" in summary
    assert "best_pnl_percentage" in summary
    assert "average_pnl_percentage" in summary
    assert "max_margin_requirement" in summary
    assert "max_liquidity_impact" in summary
    assert "overall_passed" in summary


def test_generate_summary_empty_results(scenario: StressTestScenario) -> None:
    """generate_summary with empty results should handle gracefully."""
    summary = scenario.generate_summary([])
    assert summary["total_scenarios"] == 0
    assert summary["pass_rate"] == 0
