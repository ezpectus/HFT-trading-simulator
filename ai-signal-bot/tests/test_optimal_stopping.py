"""Tests for Optimal Stopping (Snell Envelope) model."""
import math

import pytest

from src.technical_analysis.optimal_stopping import (
    BinomialResult,
    LongstaffSchwartzResult,
    OptimalStoppingResult,
    _random_normal,
    _solve3x3,
    binomial_american,
    estimate_annualized_volatility,
    longstaff_schwartz,
    optimal_stopping_analysis,
)

S0 = 100.0
K = 100.0
T = 30 / 365
R = 0.05
SIGMA = 0.3


class TestBinomialAmerican:
    def test_basic_put_price(self):
        result = binomial_american(S0, K, T, R, SIGMA, 50, is_call=False)
        assert isinstance(result, BinomialResult)
        assert result.price > 0

    def test_basic_call_price(self):
        result = binomial_american(S0, K, T, R, SIGMA, 50, is_call=True)
        assert isinstance(result, BinomialResult)
        assert result.price > 0

    def test_invalid_s0_returns_none(self):
        assert binomial_american(0, K, T, R, SIGMA, 50) is None

    def test_invalid_sigma_returns_none(self):
        assert binomial_american(S0, K, T, R, 0, 50) is None

    def test_invalid_steps_returns_none(self):
        assert binomial_american(S0, K, T, R, SIGMA, 0) is None

    def test_deep_itm_put_expensive(self):
        itm = binomial_american(S0, 150.0, T, R, SIGMA, 50, is_call=False)
        otm = binomial_american(S0, 50.0, T, R, SIGMA, 50, is_call=False)
        assert itm.price > otm.price

    def test_put_price_converges_with_steps(self):
        coarse = binomial_american(S0, K, T, R, SIGMA, 20, is_call=False)
        fine = binomial_american(S0, K, T, R, SIGMA, 200, is_call=False)
        assert fine.price == pytest.approx(coarse.price, abs=0.5)

    def test_call_no_early_exercise(self):
        result = binomial_american(S0, K, T, R, SIGMA, 50, is_call=True)
        assert all(cp["price"] == math.inf for cp in result.critical_prices)

    def test_put_has_finite_boundary(self):
        result = binomial_american(S0, K, T, R, SIGMA, 50, is_call=False)
        assert any(cp["price"] > 0 for cp in result.critical_prices)

    def test_exercise_points_present_for_put(self):
        result = binomial_american(S0, K, T, R, SIGMA, 50, is_call=False)
        assert len(result.exercise_points) > 0

    def test_tree_params_u_times_d_equals_one(self):
        result = binomial_american(S0, K, T, R, SIGMA, 50)
        assert result.params["u"] * result.params["d"] == pytest.approx(1.0)

    def test_risk_neutral_prob_in_unit_interval(self):
        result = binomial_american(S0, K, T, R, SIGMA, 50)
        assert 0 < result.params["p"] < 1

    def test_price_within_bounds(self):
        result = binomial_american(S0, K, T, R, SIGMA, 50, is_call=False)
        assert 0 < result.price < K


class TestLongstaffSchwartz:
    def test_basic_put_price(self):
        result = longstaff_schwartz(S0, K, T, R, SIGMA, 1000, 50, is_call=False, seed=42)
        assert isinstance(result, LongstaffSchwartzResult)
        assert result.price > 0

    def test_deterministic_with_seed(self):
        a = longstaff_schwartz(S0, K, T, R, SIGMA, 500, 50, is_call=False, seed=7)
        b = longstaff_schwartz(S0, K, T, R, SIGMA, 500, 50, is_call=False, seed=7)
        assert a.price == b.price
        assert a.euro_price == b.euro_price

    def test_invalid_paths_returns_none(self):
        assert longstaff_schwartz(S0, K, T, R, SIGMA, 2, 50) is None

    def test_invalid_sigma_returns_none(self):
        assert longstaff_schwartz(S0, K, T, R, 0, 1000, 50) is None

    def test_euro_price_positive(self):
        result = longstaff_schwartz(S0, K, T, R, SIGMA, 1000, 50, is_call=False, seed=42)
        assert result.euro_price > 0

    def test_early_exercise_premium_non_negative(self):
        result = longstaff_schwartz(S0, K, T, R, SIGMA, 2000, 50, is_call=False, seed=42)
        assert result.early_exercise_premium >= 0

    def test_exercise_prob_sums_to_one(self):
        result = longstaff_schwartz(S0, K, T, R, SIGMA, 1000, 50, is_call=False, seed=42)
        assert sum(result.exercise_prob) == pytest.approx(1.0)

    def test_exercise_times_in_range(self):
        result = longstaff_schwartz(S0, K, T, R, SIGMA, 1000, 50, is_call=False, seed=42)
        assert all(0 <= t <= 50 for t in result.exercise_times)

    def test_n_paths_matches(self):
        result = longstaff_schwartz(S0, K, T, R, SIGMA, 500, 50, is_call=False, seed=42)
        assert result.n_paths == 500

    def test_american_put_ge_european(self):
        result = longstaff_schwartz(S0, K, T, R, SIGMA, 2000, 50, is_call=False, seed=42)
        assert result.price >= result.euro_price - 0.05


class TestSolve3x3:
    def test_basic_system(self):
        a = [[2.0, 1.0, 0.0], [1.0, 3.0, 1.0], [0.0, 1.0, 2.0]]
        b = [1.0, 2.0, 3.0]
        x = _solve3x3(a, b)
        assert x is not None
        for i in range(3):
            assert sum(a[i][j] * x[j] for j in range(3)) == pytest.approx(b[i])

    def test_singular_returns_none(self):
        a = [[1.0, 2.0, 3.0], [2.0, 4.0, 6.0], [1.0, 1.0, 1.0]]
        assert _solve3x3(a, [1.0, 2.0, 3.0]) is None

    def test_identity_system(self):
        a = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
        assert _solve3x3(a, [5.0, -2.0, 3.0]) == pytest.approx([5.0, -2.0, 3.0])


class TestRandomNormal:
    def test_mean_approx_zero(self):
        import random as _random

        rng = _random.Random(42)
        samples = [_random_normal(rng) for _ in range(2000)]
        assert abs(sum(samples) / len(samples)) < 0.1

    def test_variance_approx_one(self):
        import random as _random

        rng = _random.Random(42)
        samples = [_random_normal(rng) for _ in range(2000)]
        mean = sum(samples) / len(samples)
        variance = sum((s - mean) ** 2 for s in samples) / len(samples)
        assert variance == pytest.approx(1.0, abs=0.1)


class TestEstimateAnnualizedVolatility:
    def test_basic(self):
        prices = [100.0 * (1 + 0.01 * (i % 3 - 1)) for i in range(30)]
        sigma = estimate_annualized_volatility(prices)
        assert sigma is not None
        assert sigma > 0

    def test_constant_prices_zero(self):
        assert estimate_annualized_volatility([100.0] * 30) == pytest.approx(0.0)

    def test_insufficient_returns_none(self):
        assert estimate_annualized_volatility([100.0]) is None

    def test_empty_returns_none(self):
        assert estimate_annualized_volatility([]) is None


class TestOptimalStoppingAnalysis:
    def test_basic_analysis(self):
        prices = [100.0 * (1 + 0.005 * (i % 5 - 2)) for i in range(40)]
        result = optimal_stopping_analysis(prices, seed=42)
        assert isinstance(result, OptimalStoppingResult)
        assert result.s0 == pytest.approx(prices[-1])
        assert result.strike == pytest.approx(prices[-1])

    def test_empty_prices_returns_none(self):
        assert optimal_stopping_analysis([]) is None

    def test_custom_strike_and_call(self):
        prices = [100.0 * (1 + 0.005 * (i % 5 - 2)) for i in range(40)]
        result = optimal_stopping_analysis(prices, strike=110.0, is_call=True, seed=42)
        assert result.strike == pytest.approx(110.0)
        assert result.is_call is True

    def test_sigma_estimated(self):
        prices = [100.0 * (1 + 0.005 * (i % 5 - 2)) for i in range(40)]
        result = optimal_stopping_analysis(prices, seed=42)
        assert result.sigma > 0
