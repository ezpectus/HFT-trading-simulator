"""Tests for SDE (Euler/Milstein) model."""
import math

import pytest

from src.technical_analysis.sde import (
    SDEResult,
    estimate_params,
    sde_analysis,
    sde_signal,
    simulate_cir,
    simulate_gbm,
    simulate_gbm_milstein,
    simulate_heston,
    simulate_merton,
    simulate_ou,
)


def _prices(n=60):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


class TestSimulateGBM:
    def test_shape(self):
        paths = simulate_gbm(100.0, 0.1, 0.3, 30 / 365, 50, 10, seed=42)
        assert len(paths) == 10
        assert all(len(p) == 50 for p in paths)

    def test_starts_at_s0(self):
        paths = simulate_gbm(100.0, 0.1, 0.3, 30 / 365, 50, 5, seed=42)
        assert all(p[0] == pytest.approx(100.0) for p in paths)

    def test_deterministic_with_seed(self):
        a = simulate_gbm(100.0, 0.1, 0.3, 30 / 365, 30, 5, seed=7)
        b = simulate_gbm(100.0, 0.1, 0.3, 30 / 365, 30, 5, seed=7)
        assert a == b

    def test_prices_positive(self):
        paths = simulate_gbm(100.0, 0.1, 0.3, 30 / 365, 50, 10, seed=42)
        assert all(p > 0 for path in paths for p in path)


class TestSimulateGBMMilstein:
    def test_shape(self):
        paths = simulate_gbm_milstein(100.0, 0.1, 0.3, 30 / 365, 50, 10, seed=42)
        assert len(paths) == 10
        assert all(len(p) == 50 for p in paths)

    def test_deterministic_with_seed(self):
        a = simulate_gbm_milstein(100.0, 0.1, 0.3, 30 / 365, 30, 5, seed=7)
        b = simulate_gbm_milstein(100.0, 0.1, 0.3, 30 / 365, 30, 5, seed=7)
        assert a == b


class TestSimulateOU:
    def test_shape(self):
        paths = simulate_ou(100.0, 2.0, 100.0, 0.3, 30 / 365, 50, 10, seed=42)
        assert len(paths) == 10

    def test_mean_reversion(self):
        # Start far from mean, should revert
        paths = simulate_ou(50.0, 5.0, 100.0, 0.1, 1.0, 200, 20, seed=42)
        finals = [p[-1] for p in paths]
        assert sum(finals) / len(finals) > 60


class TestSimulateCIR:
    def test_shape(self):
        paths = simulate_cir(0.04, 2.0, 0.04, 0.3, 30 / 365, 50, 10, seed=42)
        assert len(paths) == 10

    def test_non_negative(self):
        paths = simulate_cir(0.04, 2.0, 0.04, 0.5, 1.0, 100, 20, seed=42)
        assert all(v >= 0 for path in paths for v in path)


class TestSimulateHeston:
    def test_shape(self):
        result = simulate_heston(100.0, 0.04, 0.1, 2.0, 0.04, 0.3, -0.7, 30 / 365, 50, 10, seed=42)
        assert len(result["paths"]) == 10
        assert len(result["vol_paths"]) == 10

    def test_vol_non_negative(self):
        result = simulate_heston(100.0, 0.04, 0.1, 2.0, 0.04, 0.3, -0.7, 1.0, 100, 10, seed=42)
        assert all(v >= 0 for path in result["vol_paths"] for v in path)


class TestSimulateMerton:
    def test_shape(self):
        paths = simulate_merton(100.0, 0.1, 0.3, 5.0, -0.05, 0.08, 30 / 365, 50, 10, seed=42)
        assert len(paths) == 10

    def test_prices_positive(self):
        paths = simulate_merton(100.0, 0.1, 0.3, 5.0, -0.05, 0.08, 30 / 365, 50, 10, seed=42)
        assert all(p > 0 for path in paths for p in path)


class TestEstimateParams:
    def test_basic(self):
        returns = [0.01 * (i % 3 - 1) for i in range(100)]
        est = estimate_params(returns)
        assert math.isfinite(est["mu"])
        assert est["sigma"] > 0
        assert math.isfinite(est["ou_theta"])
        assert math.isfinite(est["ou_mu"])


class TestSDESignal:
    def test_buy(self):
        assert sde_signal(0.02) == "BUY"

    def test_sell(self):
        assert sde_signal(-0.02) == "SELL"

    def test_neutral(self):
        assert sde_signal(0.005) == "NEUTRAL"


class TestSDEAnalysis:
    def test_basic_gbm(self):
        result = sde_analysis(_prices(60), model="gbm", seed=42)
        assert isinstance(result, SDEResult)
        assert result.signal in {"BUY", "SELL", "NEUTRAL"}

    def test_milstein(self):
        result = sde_analysis(_prices(60), model="gbm", scheme="milstein", seed=42)
        assert isinstance(result, SDEResult)

    def test_ou(self):
        result = sde_analysis(_prices(60), model="ou", seed=42)
        assert isinstance(result, SDEResult)

    def test_cir(self):
        result = sde_analysis(_prices(60), model="cir", seed=42)
        assert isinstance(result, SDEResult)

    def test_heston(self):
        result = sde_analysis(_prices(60), model="heston", seed=42)
        assert isinstance(result, SDEResult)
        assert result.vol_sim is not None

    def test_merton(self):
        result = sde_analysis(_prices(60), model="merton", seed=42)
        assert isinstance(result, SDEResult)

    def test_insufficient_prices_returns_none(self):
        assert sde_analysis(_prices(10)) is None

    def test_empty_returns_none(self):
        assert sde_analysis([]) is None

    def test_deterministic_with_seed(self):
        a = sde_analysis(_prices(60), seed=7)
        b = sde_analysis(_prices(60), seed=7)
        assert a.sim == b.sim

    def test_percentiles_ordered(self):
        result = sde_analysis(_prices(60), seed=42)
        assert result.p5 <= result.p25 <= result.median <= result.p75 <= result.p95

    def test_mean_path_length(self):
        result = sde_analysis(_prices(60), n_steps=80, seed=42)
        assert len(result.mean_path) == 80

    def test_ci_width_positive(self):
        result = sde_analysis(_prices(60), seed=42)
        assert result.ci_width > 0

    def test_auto_params(self):
        result = sde_analysis(_prices(60), seed=42)
        assert result.used_sigma > 0
        assert math.isfinite(result.used_mu)
