"""Tests for Affine Arithmetic model."""
import math

import pytest

from src.research.affine_arithmetic import (
    Affine,
    AffineResult,
    _erf,
    affine_analysis,
    affine_signal,
    robust_option_price,
    robust_portfolio_value,
)


def _prices(n=80):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


class TestAffine:
    def test_from_interval(self):
        a = Affine.from_interval(0.0, 2.0)
        assert a.center == pytest.approx(1.0)
        assert a.radius() == pytest.approx(1.0)

    def test_lower_upper(self):
        a = Affine.from_interval(0.0, 2.0)
        assert a.lower() == pytest.approx(0.0)
        assert a.upper() == pytest.approx(2.0)

    def test_add(self):
        a = Affine.from_interval(0.0, 2.0)
        b = Affine.from_interval(1.0, 3.0)
        c = a.add(b)
        assert c.center == pytest.approx(3.0)
        assert c.lower() == pytest.approx(1.0)
        assert c.upper() == pytest.approx(5.0)

    def test_sub(self):
        a = Affine.from_interval(0.0, 2.0)
        b = Affine.from_interval(1.0, 3.0)
        c = a.sub(b)
        assert c.center == pytest.approx(-1.0)

    def test_scalar_mul(self):
        a = Affine.from_interval(0.0, 2.0)
        c = a.mul(3.0)
        assert c.center == pytest.approx(3.0)
        assert c.radius() == pytest.approx(3.0)

    def test_mul_contains_product_interval(self):
        a = Affine.from_interval(1.0, 3.0)
        b = Affine.from_interval(2.0, 4.0)
        c = a.mul(b)
        # Product range [2, 12]; affine approx should contain it
        assert c.lower() <= 2.0 + 1e-9
        assert c.upper() >= 12.0 - 1e-9

    def test_exp_contains_exp_interval(self):
        a = Affine.from_interval(0.0, 1.0)
        e = a.exp()
        assert e.lower() <= 1.0 + 1e-9
        assert e.upper() >= math.e - 1e-9

    def test_scale(self):
        a = Affine.from_interval(0.0, 2.0)
        c = a.scale(2.0)
        assert c.center == pytest.approx(2.0)

    def test_shared_noise_symbol_correlation(self):
        # Same noise symbol in both: correlation tracked
        a = Affine(1.0, {1: 1.0})
        b = Affine(1.0, {1: 1.0})
        c = a.add(b)
        # Correlated: radius = 2 (not 4 as in interval arithmetic)
        assert c.radius() == pytest.approx(2.0)


class TestErf:
    def test_erf_zero(self):
        assert _erf(0.0) == pytest.approx(0.0, abs=1e-6)

    def test_erf_positive(self):
        assert _erf(1.0) == pytest.approx(0.8427, abs=1e-3)

    def test_erf_negative(self):
        assert _erf(-1.0) == pytest.approx(-0.8427, abs=1e-3)


class TestRobustOptionPrice:
    def test_price_range_contains_center(self):
        result = robust_option_price(100.0, 100.0, 30 / 365, 0.05, 0.2, 0.4)
        assert result["price_lo"] <= result["price_center"] <= result["price_hi"]

    def test_price_positive(self):
        result = robust_option_price(100.0, 100.0, 30 / 365, 0.05, 0.2, 0.4)
        assert result["price_lo"] > 0

    def test_d1_finite(self):
        result = robust_option_price(100.0, 100.0, 30 / 365, 0.05, 0.2, 0.4)
        assert math.isfinite(result["d1_center"])


class TestRobustPortfolio:
    def test_center_equals_weighted_sum(self):
        portfolio = robust_portfolio_value([0.5, 0.5], [0.1, 0.2], [0.01, 0.02])
        assert portfolio.center == pytest.approx(0.15)

    def test_radius_positive(self):
        portfolio = robust_portfolio_value([0.5, 0.5], [0.1, 0.2], [0.01, 0.02])
        assert portfolio.radius() > 0


class TestAffineSignal:
    def test_high_uncertainty(self):
        signal, reason = affine_signal(0.5)
        assert signal == "HIGH_UNCERTAINTY"

    def test_moderate(self):
        signal, reason = affine_signal(0.2)
        assert signal == "MODERATE_UNCERTAINTY"

    def test_low(self):
        signal, reason = affine_signal(0.05)
        assert signal == "LOW_UNCERTAINTY"

    def test_boundary_high(self):
        signal, reason = affine_signal(0.3)
        assert signal == "MODERATE_UNCERTAINTY"


class TestAffineAnalysis:
    def test_basic_analysis(self):
        result = affine_analysis(_prices(80))
        assert isinstance(result, AffineResult)

    def test_insufficient_prices_returns_none(self):
        assert affine_analysis(_prices(10)) is None

    def test_empty_returns_none(self):
        assert affine_analysis([]) is None

    def test_signal_in_set(self):
        result = affine_analysis(_prices(80))
        assert result.signal in {"HIGH_UNCERTAINTY", "MODERATE_UNCERTAINTY", "LOW_UNCERTAINTY"}

    def test_sigma_positive(self):
        result = affine_analysis(_prices(80))
        assert result.sigma > 0
        assert result.sigma_lo > 0

    def test_price_range_valid(self):
        result = affine_analysis(_prices(80))
        assert result.price_lo <= result.price_center <= result.price_hi

    def test_option_spread_positive(self):
        result = affine_analysis(_prices(80))
        assert result.option_spread > 0

    def test_position_value_interval(self):
        result = affine_analysis(_prices(80))
        assert result.position_value.lower() < result.position_value.upper()

    def test_with_return_interval(self):
        result = affine_analysis(_prices(80))
        assert result.with_return.lower() < result.with_return.upper()

    def test_portfolio_radius_positive(self):
        result = affine_analysis(_prices(80))
        assert result.portfolio.radius() > 0

    def test_custom_uncertainty(self):
        result = affine_analysis(_prices(80), uncertainty_pct=2.0)
        assert result.sigma_uncertainty > 0

    def test_custom_strike(self):
        result = affine_analysis(_prices(80), strike_pct=1.1)
        assert result.k == pytest.approx(result.s0 * 1.1)

    def test_d1_center_finite(self):
        result = affine_analysis(_prices(80))
        assert math.isfinite(result.d1_center)
