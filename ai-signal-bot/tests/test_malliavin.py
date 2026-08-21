"""Tests for Malliavin Calculus model."""
import math
import random

import pytest

from src.research.malliavin import (
    MalliavinResult,
    bs_call,
    bs_greeks,
    compute_returns,
    malliavin_analysis,
    malliavin_greeks,
    malliavin_signal,
    norm_cdf,
    random_normal,
    simulate_paths,
)


def _prices(n=120):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


def _sim(n_paths=1000, n_steps=50, seed=42):
    """Standard seeded simulation."""
    rng = random.Random(seed)
    return simulate_paths(100.0, 0.0, 0.2, 0.1, n_steps, n_paths, rng)


class TestComputeReturns:
    def test_basic(self):
        returns = compute_returns([100.0, 110.0, 121.0])
        assert returns == pytest.approx([0.1, 0.1])

    def test_single_pair(self):
        returns = compute_returns([100.0, 105.0])
        assert returns == pytest.approx([0.05])

    def test_negative_returns(self):
        returns = compute_returns([100.0, 90.0])
        assert returns == pytest.approx([-0.1])


class TestRandomNormal:
    def test_deterministic_with_seed(self):
        rng1 = random.Random(7)
        rng2 = random.Random(7)
        assert random_normal(rng1) == pytest.approx(random_normal(rng2))

    def test_mean_approx_zero(self):
        rng = random.Random(1)
        values = [random_normal(rng) for _ in range(5000)]
        assert sum(values) / len(values) == pytest.approx(0.0, abs=0.1)

    def test_std_approx_one(self):
        rng = random.Random(2)
        values = [random_normal(rng) for _ in range(5000)]
        mean = sum(values) / len(values)
        var = sum((v - mean) ** 2 for v in values) / len(values)
        assert math.sqrt(var) == pytest.approx(1.0, abs=0.1)


class TestSimulatePaths:
    def test_deterministic_with_seed(self):
        sim1 = _sim(seed=42)
        sim2 = _sim(seed=42)
        assert sim1["paths"] == sim2["paths"]
        assert sim1["brownian_paths"] == sim2["brownian_paths"]

    def test_path_count(self):
        sim = _sim(n_paths=200)
        assert len(sim["paths"]) == 200
        assert len(sim["brownian_paths"]) == 200

    def test_path_length(self):
        sim = _sim(n_steps=50)
        assert len(sim["paths"][0]) == 50
        assert len(sim["brownian_paths"][0]) == 50

    def test_starts_at_s0(self):
        sim = _sim()
        assert sim["paths"][0][0] == pytest.approx(100.0)

    def test_brownian_starts_zero(self):
        sim = _sim()
        assert sim["brownian_paths"][0][0] == pytest.approx(0.0)

    def test_prices_positive(self):
        sim = _sim()
        assert all(p > 0 for path in sim["paths"] for p in path)


class TestNormCdf:
    def test_zero(self):
        assert norm_cdf(0.0) == pytest.approx(0.5, abs=1e-4)

    def test_positive(self):
        assert norm_cdf(1.96) == pytest.approx(0.975, abs=1e-3)

    def test_negative(self):
        assert norm_cdf(-1.96) == pytest.approx(0.025, abs=1e-3)

    def test_monotonic(self):
        assert norm_cdf(-1.0) < norm_cdf(0.0) < norm_cdf(1.0)

    def test_large_positive(self):
        assert norm_cdf(5.0) == pytest.approx(1.0, abs=1e-6)


class TestBsCall:
    def test_positive_price(self):
        assert bs_call(100.0, 100.0, 0.1, 0.05, 0.2) > 0

    def test_atm_approx(self):
        # ATM call ≈ 0.4·S·σ·√T for r≈0
        price = bs_call(100.0, 100.0, 0.1, 0.0, 0.2)
        assert price == pytest.approx(0.4 * 100 * 0.2 * math.sqrt(0.1), rel=0.15)

    def test_increasing_in_spot(self):
        assert bs_call(110.0, 100.0, 0.1, 0.05, 0.2) > bs_call(90.0, 100.0, 0.1, 0.05, 0.2)

    def test_decreasing_in_strike(self):
        assert bs_call(100.0, 90.0, 0.1, 0.05, 0.2) > bs_call(100.0, 110.0, 0.1, 0.05, 0.2)

    def test_deep_itm_approx(self):
        # Deep ITM call ≈ S - K·e^{-rT}
        price = bs_call(150.0, 100.0, 0.1, 0.05, 0.2)
        assert price == pytest.approx(150.0 - 100.0 * math.exp(-0.05 * 0.1), rel=0.1)


class TestBsGreeks:
    def test_delta_in_unit_interval(self):
        greeks = bs_greeks(100.0, 100.0, 0.1, 0.05, 0.2)
        assert 0 < greeks["delta"] < 1

    def test_gamma_positive(self):
        greeks = bs_greeks(100.0, 100.0, 0.1, 0.05, 0.2)
        assert greeks["gamma"] > 0

    def test_vega_positive(self):
        greeks = bs_greeks(100.0, 100.0, 0.1, 0.05, 0.2)
        assert greeks["vega"] > 0

    def test_theta_negative_for_call(self):
        greeks = bs_greeks(100.0, 100.0, 0.1, 0.05, 0.2)
        assert greeks["theta"] < 0

    def test_rho_positive_for_call(self):
        greeks = bs_greeks(100.0, 100.0, 0.1, 0.05, 0.2)
        assert greeks["rho"] > 0

    def test_itm_delta_higher(self):
        itm = bs_greeks(110.0, 100.0, 0.1, 0.05, 0.2)
        otm = bs_greeks(90.0, 100.0, 0.1, 0.05, 0.2)
        assert itm["delta"] > otm["delta"]


class TestMalliavinGreeks:
    def _result(self, n_paths=1000):
        sim = _sim(n_paths=n_paths)
        return malliavin_greeks(sim["paths"], sim["brownian_paths"], 100.0, 100.0, 0.1, 0.05, 0.2, 50)

    def test_price_close_to_analytical(self):
        result = self._result()
        analytical = bs_call(100.0, 100.0, 0.1, 0.05, 0.2)
        assert result["price"] == pytest.approx(analytical, abs=0.5)

    def test_delta_close_to_analytical(self):
        result = self._result()
        analytical = bs_greeks(100.0, 100.0, 0.1, 0.05, 0.2)
        assert result["delta"] == pytest.approx(analytical["delta"], abs=0.1)

    def test_vega_close_to_analytical(self):
        result = self._result()
        analytical = bs_greeks(100.0, 100.0, 0.1, 0.05, 0.2)
        assert result["vega"] == pytest.approx(analytical["vega"], abs=3.0)

    def test_gamma_finite(self):
        result = self._result()
        assert math.isfinite(result["gamma"])

    def test_fd_delta_close_to_analytical(self):
        result = self._result()
        analytical = bs_greeks(100.0, 100.0, 0.1, 0.05, 0.2)
        assert result["fd_delta"] == pytest.approx(analytical["delta"], rel=0.01)

    def test_fd_gamma_close_to_analytical(self):
        result = self._result()
        analytical = bs_greeks(100.0, 100.0, 0.1, 0.05, 0.2)
        assert result["fd_gamma"] == pytest.approx(analytical["gamma"], rel=0.05)

    def test_fd_vega_close_to_analytical(self):
        result = self._result()
        analytical = bs_greeks(100.0, 100.0, 0.1, 0.05, 0.2)
        assert result["fd_vega"] == pytest.approx(analytical["vega"], rel=0.01)

    def test_delta_se_positive(self):
        result = self._result()
        assert result["delta_se"] > 0

    def test_delta_se_decreases_with_paths(self):
        small = self._result(n_paths=200)
        large = self._result(n_paths=2000)
        assert large["delta_se"] < small["delta_se"]

    def test_mean_payoff_positive(self):
        result = self._result()
        assert result["mean_payoff"] > 0


class TestMalliavinSignal:
    def test_buy(self):
        signal, reason = malliavin_signal(0.7)
        assert signal == "BUY"

    def test_sell(self):
        signal, reason = malliavin_signal(0.05)
        assert signal == "SELL"

    def test_neutral(self):
        signal, reason = malliavin_signal(0.3)
        assert signal == "NEUTRAL"

    def test_boundary_buy(self):
        signal, reason = malliavin_signal(0.5)
        assert signal == "NEUTRAL"

    def test_boundary_sell(self):
        signal, reason = malliavin_signal(0.1)
        assert signal == "NEUTRAL"


class TestMalliavinAnalysis:
    def test_basic_analysis(self):
        result = malliavin_analysis(_prices(120))
        assert isinstance(result, MalliavinResult)

    def test_insufficient_prices_returns_none(self):
        assert malliavin_analysis(_prices(20)) is None

    def test_empty_returns_none(self):
        assert malliavin_analysis([]) is None

    def test_deterministic_with_seed(self):
        r1 = malliavin_analysis(_prices(120), seed=42)
        r2 = malliavin_analysis(_prices(120), seed=42)
        assert r1.delta == pytest.approx(r2.delta)
        assert r1.price == pytest.approx(r2.price)

    def test_different_seeds_differ(self):
        r1 = malliavin_analysis(_prices(120), seed=1)
        r2 = malliavin_analysis(_prices(120), seed=2)
        assert r1.delta != r2.delta

    def test_signal_in_set(self):
        result = malliavin_analysis(_prices(120))
        assert result.signal in {"BUY", "SELL", "NEUTRAL"}

    def test_convergence_non_empty(self):
        result = malliavin_analysis(_prices(120), n_paths=1000)
        assert len(result.convergence) > 1

    def test_convergence_paths_increasing(self):
        result = malliavin_analysis(_prices(120), n_paths=1000)
        paths = [c["n_paths"] for c in result.convergence]
        assert paths == sorted(paths)

    def test_params_present(self):
        result = malliavin_analysis(_prices(120))
        assert result.s0 > 0
        assert result.k > 0
        assert result.sigma > 0
        assert result.t > 0

    def test_errors_finite(self):
        result = malliavin_analysis(_prices(120))
        assert math.isfinite(result.delta_error)
        assert math.isfinite(result.vega_error)
        assert math.isfinite(result.gamma_error)
        assert math.isfinite(result.price_error)

    def test_analytical_greeks_present(self):
        result = malliavin_analysis(_prices(120))
        assert 0 < result.analytical["delta"] < 1
        assert result.analytical["gamma"] > 0
        assert result.analytical["vega"] > 0

    def test_fd_greeks_finite(self):
        result = malliavin_analysis(_prices(120))
        assert math.isfinite(result.fd_delta)
        assert math.isfinite(result.fd_gamma)
        assert math.isfinite(result.fd_vega)

    def test_delta_se_positive(self):
        result = malliavin_analysis(_prices(120))
        assert result.delta_se > 0

    def test_custom_strike_itm(self):
        result = malliavin_analysis(_prices(120), strike_pct=0.8)
        assert result.delta > 0.5

    def test_custom_strike_otm(self):
        result = malliavin_analysis(_prices(120), strike_pct=1.2)
        assert result.delta < 0.5
