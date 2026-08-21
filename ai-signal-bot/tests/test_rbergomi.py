"""Tests for Rough Volatility (rBergomi) model."""
import math

import pytest

from src.technical_analysis.rbergomi import (
    RBergomiResult,
    estimate_hurst,
    fbm,
    frac_gaussian_noise,
    rbergomi_analysis,
    rbergomi_signal,
    simulate_rbergomi,
)


def _prices(n=80):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


class TestFractionalGaussianNoise:
    def test_length(self):
        fgn = frac_gaussian_noise(50, 0.1, seed=42)
        assert len(fgn) == 50

    def test_deterministic_with_seed(self):
        a = frac_gaussian_noise(30, 0.1, seed=7)
        b = frac_gaussian_noise(30, 0.1, seed=7)
        assert a == b

    def test_unit_variance(self):
        fgn = frac_gaussian_noise(200, 0.1, seed=42)
        mean = sum(fgn) / len(fgn)
        variance = sum((v - mean) ** 2 for v in fgn) / len(fgn)
        assert variance == pytest.approx(1.0, abs=0.15)

    def test_rough_hurst_negative_autocorrelation(self):
        fgn = frac_gaussian_noise(300, 0.1, seed=42)
        mean = sum(fgn) / len(fgn)
        ac1 = sum((fgn[i] - mean) * (fgn[i - 1] - mean) for i in range(1, len(fgn)))
        ac1 /= sum((v - mean) ** 2 for v in fgn)
        assert ac1 < 0

    def test_smooth_hurst_positive_autocorrelation(self):
        fgn = frac_gaussian_noise(300, 0.9, seed=42)
        mean = sum(fgn) / len(fgn)
        ac1 = sum((fgn[i] - mean) * (fgn[i - 1] - mean) for i in range(1, len(fgn)))
        ac1 /= sum((v - mean) ** 2 for v in fgn)
        assert ac1 > 0


class TestFBM:
    def test_starts_at_zero(self):
        bm = fbm(30, 0.1, seed=42)
        assert bm[0] == pytest.approx(0.0)

    def test_length(self):
        bm = fbm(30, 0.1, seed=42)
        assert len(bm) == 30

    def test_deterministic_with_seed(self):
        a = fbm(20, 0.1, seed=7)
        b = fbm(20, 0.1, seed=7)
        assert a == b


class TestSimulateRBergomi:
    def test_basic_simulation(self):
        sim = simulate_rbergomi(0.1, 1.5, -0.7, 0.2, 30 / 365, 50, 20, seed=42)
        assert len(sim["paths"]) == 20
        assert len(sim["vol_paths"]) == 20
        assert len(sim["mean_vol"]) == 50
        assert len(sim["mean_price_path"]) == 50

    def test_deterministic_with_seed(self):
        a = simulate_rbergomi(0.1, 1.5, -0.7, 0.2, 30 / 365, 30, 10, seed=7)
        b = simulate_rbergomi(0.1, 1.5, -0.7, 0.2, 30 / 365, 30, 10, seed=7)
        assert a["mean_price"] == b["mean_price"]
        assert a["paths"] == b["paths"]

    def test_prices_positive(self):
        sim = simulate_rbergomi(0.1, 1.5, -0.7, 0.2, 30 / 365, 50, 20, seed=42)
        assert all(p > 0 for path in sim["paths"] for p in path)

    def test_vol_paths_positive(self):
        sim = simulate_rbergomi(0.1, 1.5, -0.7, 0.2, 30 / 365, 50, 20, seed=42)
        assert all(v > 0 for vp in sim["vol_paths"] for v in vp)

    def test_p5_le_p95(self):
        sim = simulate_rbergomi(0.1, 1.5, -0.7, 0.2, 30 / 365, 50, 50, seed=42)
        assert sim["p5"] <= sim["p95"]

    def test_mean_price_between_p5_p95(self):
        sim = simulate_rbergomi(0.1, 1.5, -0.7, 0.2, 30 / 365, 50, 50, seed=42)
        assert sim["p5"] <= sim["mean_price"] <= sim["p95"]

    def test_var_swaps_positive(self):
        sim = simulate_rbergomi(0.1, 1.5, -0.7, 0.2, 30 / 365, 50, 20, seed=42)
        assert all(vs > 0 for vs in sim["var_swaps"])

    def test_atm_vol_positive(self):
        sim = simulate_rbergomi(0.1, 1.5, -0.7, 0.2, 30 / 365, 50, 20, seed=42)
        assert sim["atm_vol"] > 0

    def test_skew_positive_for_rough(self):
        sim = simulate_rbergomi(0.1, 1.5, -0.7, 0.2, 30 / 365, 50, 20, seed=42)
        assert sim["skew"] > 0


class TestEstimateHurst:
    def test_rough_series_low_hurst(self):
        returns = [math.sin(i * 0.5) * 0.01 + (i % 3 - 1) * 0.005 for i in range(200)]
        hurst = estimate_hurst(returns)
        assert 0.01 <= hurst <= 0.99

    def test_insufficient_returns_default(self):
        assert estimate_hurst([0.01] * 3) == pytest.approx(0.1)

    def test_constant_returns_smooth_hurst(self):
        # RV scales linearly with scale -> H = 1, clamped to 0.99
        assert estimate_hurst([0.01] * 100) == pytest.approx(0.99)


class TestRBergomiSignal:
    def test_buy(self):
        assert rbergomi_signal(0.02) == "BUY"

    def test_sell(self):
        assert rbergomi_signal(-0.02) == "SELL"

    def test_neutral(self):
        assert rbergomi_signal(0.005) == "NEUTRAL"

    def test_boundary_buy(self):
        assert rbergomi_signal(0.01) == "NEUTRAL"


class TestRBergomiAnalysis:
    def test_basic_analysis(self):
        result = rbergomi_analysis(_prices(80), seed=42)
        assert isinstance(result, RBergomiResult)
        assert result.n_paths == 50

    def test_insufficient_prices_returns_none(self):
        assert rbergomi_analysis(_prices(20)) is None

    def test_empty_returns_none(self):
        assert rbergomi_analysis([]) is None

    def test_used_hurst_positive(self):
        result = rbergomi_analysis(_prices(80), seed=42)
        assert 0.01 <= result.used_h <= 0.99

    def test_xi0_positive(self):
        result = rbergomi_analysis(_prices(80), seed=42)
        assert result.xi0 > 0

    def test_signal_in_set(self):
        result = rbergomi_analysis(_prices(80), seed=42)
        assert result.signal in {"BUY", "SELL", "NEUTRAL"}

    def test_vol_regime_in_set(self):
        result = rbergomi_analysis(_prices(80), seed=42)
        assert result.vol_regime in {"HIGH", "LOW", "NORMAL"}

    def test_expected_return_finite(self):
        result = rbergomi_analysis(_prices(80), seed=42)
        assert math.isfinite(result.expected_return)

    def test_manual_hurst(self):
        result = rbergomi_analysis(_prices(80), h=0.3, auto_hurst=False, seed=42)
        assert result.used_h == pytest.approx(0.3)

    def test_deterministic_with_seed(self):
        a = rbergomi_analysis(_prices(80), seed=7)
        b = rbergomi_analysis(_prices(80), seed=7)
        assert a.mean_price == b.mean_price
        assert a.paths == b.paths

    def test_custom_paths(self):
        result = rbergomi_analysis(_prices(80), n_paths=10, seed=42)
        assert result.n_paths == 10
