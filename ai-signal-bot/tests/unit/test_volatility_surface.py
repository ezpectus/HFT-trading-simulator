"""Unit tests for pricing/volatility_surface.py.

Covers: SVIParams, SABRParams, VolatilitySurface.
"""
import math

import numpy as np


class TestSVIParams:
    def test_svi_params_creation(self):
        from src.pricing.volatility_surface import SVIParams
        p = SVIParams(a=0.04, b=0.1, rho=0.0, m=0.0, sigma=0.1)
        assert p.a == 0.04
        assert p.b == 0.1
        assert p.rho == 0.0
        assert p.m == 0.0
        assert p.sigma == 0.1


class TestSABRParams:
    def test_sabr_params_creation(self):
        from src.pricing.volatility_surface import SABRParams
        p = SABRParams(alpha=0.3, beta=0.5, rho=0.0, nu=0.3)
        assert p.alpha == 0.3
        assert p.beta == 0.5
        assert p.rho == 0.0
        assert p.nu == 0.3


class TestVolatilitySurface:
    def test_init_default_svi(self):
        from src.pricing.volatility_surface import VolatilitySurface
        vs = VolatilitySurface(model="svi")
        assert vs.model == "svi"
        assert vs.svi_params is None
        assert vs.sabr_params is None
        assert vs._calibrated is False

    def test_init_sabr(self):
        from src.pricing.volatility_surface import VolatilitySurface
        vs = VolatilitySurface(model="sabr")
        assert vs.model == "sabr"

    def test_svi_variance_at_center(self):
        from src.pricing.volatility_surface import SVIParams, VolatilitySurface
        vs = VolatilitySurface()
        p = SVIParams(a=0.04, b=0.1, rho=0.0, m=0.0, sigma=0.1)
        var = vs.svi_variance(0.0, p)
        expected = 0.04 + 0.1 * (0.0 + math.sqrt(0.0 + 0.01))
        assert abs(var - expected) < 1e-10

    def test_svi_variance_symmetric(self):
        from src.pricing.volatility_surface import SVIParams, VolatilitySurface
        vs = VolatilitySurface()
        p = SVIParams(a=0.04, b=0.1, rho=0.0, m=0.0, sigma=0.1)
        var_pos = vs.svi_variance(0.1, p)
        var_neg = vs.svi_variance(-0.1, p)
        assert abs(var_pos - var_neg) < 1e-10

    def test_implied_vol_svi_no_params_returns_fallback(self):
        from src.pricing.volatility_surface import VolatilitySurface
        vs = VolatilitySurface()
        iv = vs.implied_vol_svi(0.0, 1.0)
        assert iv == 0.5

    def test_implied_vol_svi_negative_variance_returns_fallback(self):
        from src.pricing.volatility_surface import SVIParams, VolatilitySurface
        vs = VolatilitySurface()
        vs.svi_params = SVIParams(a=-0.5, b=0.1, rho=0.0, m=0.0, sigma=0.1)
        iv = vs.implied_vol_svi(0.0, 1.0)
        assert iv == 0.5

    def test_implied_vol_svi_valid(self):
        from src.pricing.volatility_surface import SVIParams, VolatilitySurface
        vs = VolatilitySurface()
        vs.svi_params = SVIParams(a=0.04, b=0.1, rho=0.0, m=0.0, sigma=0.1)
        iv = vs.implied_vol_svi(0.0, 0.25)
        expected = math.sqrt(0.04 + 0.1 * 0.1) / math.sqrt(0.25)
        assert abs(iv - expected) < 1e-6

    def test_sabr_implied_vol_atm(self):
        from src.pricing.volatility_surface import SABRParams, VolatilitySurface
        vs = VolatilitySurface()
        p = SABRParams(alpha=0.3, beta=0.5, rho=0.0, nu=0.3)
        iv = vs.sabr_implied_vol(100.0, 100.0, 1.0, p)
        assert iv > 0

    def test_sabr_implied_vol_otm(self):
        from src.pricing.volatility_surface import SABRParams, VolatilitySurface
        vs = VolatilitySurface()
        p = SABRParams(alpha=0.3, beta=0.5, rho=0.0, nu=0.3)
        iv = vs.sabr_implied_vol(100.0, 110.0, 1.0, p)
        assert iv > 0

    def test_sabr_implied_vol_zero_forward_returns_fallback(self):
        from src.pricing.volatility_surface import SABRParams, VolatilitySurface
        vs = VolatilitySurface()
        p = SABRParams(alpha=0.3, beta=0.5, rho=0.0, nu=0.3)
        iv = vs.sabr_implied_vol(0.0, 100.0, 1.0, p)
        assert iv == 0.5

    def test_implied_vol_no_model_returns_fallback(self):
        from src.pricing.volatility_surface import VolatilitySurface
        vs = VolatilitySurface(model="svi")
        iv = vs.implied_vol(strike=100.0, maturity_days=30, forward=100.0)
        assert iv == 0.5

    def test_implied_vol_zero_maturity_returns_fallback(self):
        from src.pricing.volatility_surface import VolatilitySurface
        vs = VolatilitySurface()
        iv = vs.implied_vol(strike=100.0, maturity_days=0, forward=100.0)
        assert iv == 0.5

    def test_generate_surface(self):
        from src.pricing.volatility_surface import SVIParams, VolatilitySurface
        vs = VolatilitySurface(model="svi")
        vs.svi_params = SVIParams(a=0.04, b=0.1, rho=0.0, m=0.0, sigma=0.1)
        maturities = np.array([7, 30, 90])
        strikes = np.array([48000, 50000, 52000])
        surface = vs.generate_surface(50000.0, maturities, strikes)
        assert surface.shape == (3, 3)
        assert np.all(surface > 0)

    def test_calibrate_svi_returns_params(self):
        from src.pricing.volatility_surface import SVIParams, VolatilitySurface
        vs = VolatilitySurface()
        log_m = np.array([-0.1, -0.05, 0.0, 0.05, 0.1])
        var = np.array([0.06, 0.05, 0.04, 0.05, 0.06])
        params = vs.calibrate_svi(log_m, var)
        assert isinstance(params, SVIParams)
        assert params.a > 0
