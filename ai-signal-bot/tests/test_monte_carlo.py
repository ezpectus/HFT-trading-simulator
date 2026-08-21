"""Tests for Monte Carlo simulation model."""
import math

import pytest

from src.technical_analysis.monte_carlo import (
    MonteCarloResult,
    _max_drawdown,
    _percentile,
    monte_carlo_from_pnls,
    run_monte_carlo,
)

POSITIVE_PNLS = [100.0, 150.0, 80.0, 200.0, 120.0, 90.0, 60.0, 110.0]
NEGATIVE_PNLS = [-100.0, -150.0, -80.0, -200.0, -120.0, -90.0, -60.0, -110.0]
MIXED_PNLS = [100.0, -50.0, 80.0, -120.0, 200.0, -30.0, 60.0, -90.0, 40.0, 70.0]


class TestMonteCarloFromPnls:
    def test_insufficient_pnls_returns_none(self):
        assert monte_carlo_from_pnls([10.0, -5.0, 3.0]) is None

    def test_empty_returns_none(self):
        assert monte_carlo_from_pnls([]) is None

    def test_zero_runs_returns_none(self):
        assert monte_carlo_from_pnls(POSITIVE_PNLS, runs=0) is None

    def test_negative_runs_returns_none(self):
        assert monte_carlo_from_pnls(POSITIVE_PNLS, runs=-5) is None

    def test_basic_result(self):
        result = monte_carlo_from_pnls(MIXED_PNLS, runs=100, seed=42)
        assert isinstance(result, MonteCarloResult)
        assert result.runs == 100
        assert result.n_trades == 10

    def test_percentile_keys(self):
        result = monte_carlo_from_pnls(MIXED_PNLS, runs=100, seed=42)
        assert set(result.percentiles.keys()) == {"p5", "p25", "p50", "p75", "p95"}

    def test_percentiles_ordered(self):
        result = monte_carlo_from_pnls(MIXED_PNLS, runs=500, seed=42)
        assert result.percentiles["p5"] <= result.percentiles["p25"]
        assert result.percentiles["p25"] <= result.percentiles["p50"]
        assert result.percentiles["p50"] <= result.percentiles["p75"]
        assert result.percentiles["p75"] <= result.percentiles["p95"]

    def test_profit_prob_in_range(self):
        result = monte_carlo_from_pnls(MIXED_PNLS, runs=100, seed=42)
        assert 0 <= result.profit_prob <= 100

    def test_all_positive_pnls_profit_prob_100(self):
        result = monte_carlo_from_pnls(POSITIVE_PNLS, runs=50, seed=42)
        assert result.profit_prob == pytest.approx(100.0)

    def test_all_negative_pnls_profit_prob_0(self):
        result = monte_carlo_from_pnls(NEGATIVE_PNLS, runs=50, seed=42)
        assert result.profit_prob == pytest.approx(0.0)

    def test_deterministic_with_seed(self):
        a = monte_carlo_from_pnls(MIXED_PNLS, runs=100, seed=123)
        b = monte_carlo_from_pnls(MIXED_PNLS, runs=100, seed=123)
        assert a.percentiles == b.percentiles
        assert a.profit_prob == b.profit_prob
        assert a.median_max_dd == b.median_max_dd

    def test_worst_return_le_best_return(self):
        result = monte_carlo_from_pnls(MIXED_PNLS, runs=100, seed=42)
        assert result.worst_return <= result.best_return

    def test_mean_return_finite(self):
        result = monte_carlo_from_pnls(MIXED_PNLS, runs=100, seed=42)
        assert math.isfinite(result.mean_return)

    def test_std_return_non_negative(self):
        result = monte_carlo_from_pnls(MIXED_PNLS, runs=100, seed=42)
        assert result.std_return >= 0

    def test_constant_pnls_zero_std(self):
        result = monte_carlo_from_pnls([50.0] * 10, runs=50, seed=42)
        assert result.std_return == pytest.approx(0.0)
        assert result.profit_prob == pytest.approx(100.0)

    def test_median_max_dd_non_negative(self):
        result = monte_carlo_from_pnls(MIXED_PNLS, runs=100, seed=42)
        assert result.median_max_dd >= 0

    def test_worst_max_dd_ge_median(self):
        result = monte_carlo_from_pnls(MIXED_PNLS, runs=100, seed=42)
        assert result.worst_max_dd >= result.median_max_dd

    def test_positive_pnls_zero_drawdown(self):
        result = monte_carlo_from_pnls(POSITIVE_PNLS, runs=50, seed=42)
        assert result.median_max_dd == pytest.approx(0.0)
        assert result.worst_max_dd == pytest.approx(0.0)

    def test_initial_balance_affects_drawdown(self):
        result = monte_carlo_from_pnls(MIXED_PNLS, runs=100, seed=42, initial_balance=1000.0)
        assert result.median_max_dd >= 0


class TestRunMonteCarlo:
    def test_trade_dicts(self):
        trades = [{"pnl": p} for p in MIXED_PNLS]
        result = run_monte_carlo(trades, runs=100, seed=42)
        assert isinstance(result, MonteCarloResult)
        assert result.n_trades == 10

    def test_raw_pnls(self):
        result = run_monte_carlo(MIXED_PNLS, runs=100, seed=42)
        assert isinstance(result, MonteCarloResult)

    def test_insufficient_trades_returns_none(self):
        assert run_monte_carlo([{"pnl": 10.0}] * 3) is None

    def test_empty_trades_returns_none(self):
        assert run_monte_carlo([]) is None

    def test_missing_pnl_key_defaults_zero(self):
        trades = [{"pnl": 100.0}, {"symbol": "BTC"}, {"pnl": 50.0}, {"pnl": -20.0}, {"pnl": 30.0}]
        result = run_monte_carlo(trades, runs=50, seed=42)
        assert result.n_trades == 5

    def test_custom_runs_and_balance(self):
        result = run_monte_carlo(MIXED_PNLS, runs=200, initial_balance=5000.0, seed=7)
        assert result.runs == 200


class TestHelpers:
    def test_max_drawdown_basic(self):
        curve = [100.0, 120.0, 90.0, 110.0, 80.0]
        assert _max_drawdown(curve) == pytest.approx(40.0)

    def test_max_drawdown_monotonic_up(self):
        assert _max_drawdown([100.0, 110.0, 120.0]) == pytest.approx(0.0)

    def test_max_drawdown_monotonic_down(self):
        assert _max_drawdown([100.0, 90.0, 80.0]) == pytest.approx(20.0)

    def test_percentile_median(self):
        values = [1.0, 2.0, 3.0, 4.0]
        assert _percentile(values, 0.5) == pytest.approx(3.0)

    def test_percentile_min(self):
        values = [1.0, 2.0, 3.0, 4.0]
        assert _percentile(values, 0.0) == pytest.approx(1.0)

    def test_percentile_max(self):
        values = [1.0, 2.0, 3.0, 4.0]
        assert _percentile(values, 0.99) == pytest.approx(4.0)
