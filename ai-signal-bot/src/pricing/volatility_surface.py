"""
Volatility surface modeling using SVI (Stochastic Volatility Inspired) and SABR.

SVI parameterization: w(k) = a + b * (rho * (k - m) + sqrt((k - m)^2 + sigma^2))
  where:
    k = log-moneyness (log(K/F))
    w = total implied variance (sigma^2 * T)
    a = level (asymptotic variance)
    b = slope (asymptotic variance increase)
    rho = skew (correlation between spot and vol)
    m = center (moneyness at minimum variance)
    sigma = curvature (smoothness of the wing)

SABR model: sigma_F = alpha * (F/K)^(beta-1) * ... Hagan's formula

Usage:
    from src.pricing.volatility_surface import VolatilitySurface

    vs = VolatilitySurface(model="svi")
    params = vs.calibrate(strikes, maturities, implied_vols, forward_price)
    iv = vs.implied_vol(strike=65000, maturity_days=30, forward=64000)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np

logger = logging.getLogger(__name__)

try:
    from scipy.optimize import least_squares, minimize
    from scipy.stats import norm  # noqa: F401
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False


@dataclass
class SVIParams:
    a: float  # level
    b: float  # slope
    rho: float  # skew (-1 to 1)
    m: float  # center (log-moneyness)
    sigma: float  # curvature


@dataclass
class SABRParams:
    alpha: float  # initial vol
    beta: float  # CEV exponent (0 to 1)
    rho: float  # correlation (-1 to 1)
    nu: float  # vol-of-vol


class VolatilitySurface:
    """Volatility surface calibration and interpolation."""

    def __init__(self, model: str = "svi"):
        self.model = model
        self.svi_params: SVIParams | None = None
        self.sabr_params: SABRParams | None = None
        self._calibrated = False

    # ── SVI ──

    def svi_variance(self, k: float, params: SVIParams) -> float:
        """SVI total variance: w(k) = a + b * (rho*(k-m) + sqrt((k-m)^2 + sigma^2))"""
        km = k - params.m
        return params.a + params.b * (params.rho * km + np.sqrt(km**2 + params.sigma**2))

    def calibrate_svi(
        self,
        log_moneyness: np.ndarray,
        implied_variances: np.ndarray,
        initial_params: tuple | None = None,
    ) -> SVIParams:
        """Calibrate SVI parameters to market data."""
        if not SCIPY_AVAILABLE:
            return SVIParams(0.04, 0.1, 0.0, 0.0, 0.1)

        if initial_params is None:
            initial_params = (
                np.mean(implied_variances),  # a
                0.1,  # b
                0.0,  # rho
                0.0,  # m
                0.1,  # sigma
            )

        def objective(params):
            a, b, rho, m, sigma = params
            # No-arbitrage constraints
            if b < 0 or abs(rho) > 1 or sigma < 0:
                return 1e10
            if a + b * sigma * np.sqrt(1 - rho**2) < 0:  # min variance > 0
                return 1e10
            p = SVIParams(a, b, rho, m, sigma)
            model_var = np.array([self.svi_variance(k, p) for k in log_moneyness])
            return np.sum((model_var - implied_variances) ** 2)

        result = minimize(
            objective, initial_params,
            method="Nelder-Mead",
            options={"maxiter": 10000, "xatol": 1e-8, "fatol": 1e-10},
        )

        a, b, rho, m, sigma = result.x
        self.svi_params = SVIParams(a, b, rho, m, sigma)
        self._calibrated = True
        logger.info(f"[VolSurface] SVI calibrated: a={a:.4f} b={b:.4f} rho={rho:.3f} m={m:.4f} sigma={sigma:.4f}")
        return self.svi_params

    def implied_vol_svi(self, log_moneyness: float, maturity_years: float) -> float:
        """Get implied volatility from calibrated SVI surface."""
        if not self.svi_params:
            return 0.5  # fallback 50% vol
        total_var = self.svi_variance(log_moneyness, self.svi_params)
        return np.sqrt(total_var / maturity_years) if maturity_years > 0 else np.sqrt(total_var)

    # ── SABR ──

    def sabr_implied_vol(
        self, forward: float, strike: float, maturity: float, params: SABRParams
    ) -> float:
        """Hagan's SABR implied volatility formula."""
        if abs(forward - strike) < 1e-10:
            # ATM formula
            term1 = (1 + (((1 - params.beta)**2 * params.alpha**2) /
                          (24 * forward**(2 - 2 * params.beta)) +
                          (params.rho * params.beta * params.nu * params.alpha) /
                          (4 * forward**(1 - params.beta)) +
                          ((2 - 3 * params.rho**2) * params.nu**2) / 24) * maturity)
            return params.alpha / forward**(1 - params.beta) * term1

        z = (params.nu / params.alpha) * forward**((1 - params.beta) / 2) * (1 - params.beta) * np.log(forward / strike)
        x_z = np.log((np.sqrt(1 - 2 * params.rho * z + z**2) + z - params.rho) / (1 - params.rho))

        if abs(x_z) < 1e-10:
            sigma = params.alpha / (forward**(1 - params.beta))
        else:
            sigma = (params.alpha * (1 + (((1 - params.beta)**2 * params.alpha**2) /
                         (24 * (forward * strike)**((1 - params.beta) / 2)) +
                         (params.rho * params.beta * params.nu * params.alpha) /
                         (4 * (forward * strike)**((1 - params.beta) / 4)) +
                         ((2 - 3 * params.rho**2) * params.nu**2) / 24) * maturity)) / (
                (forward * strike)**((1 - params.beta) / 4) * (1 + ((1 - params.beta)**2 / 24) * np.log(forward / strike)**2 +
                ((1 - params.beta)**4 / 1920) * np.log(forward / strike)**4) * x_z / z)

        return sigma

    def calibrate_sabr(
        self,
        forwards: np.ndarray,
        strikes: np.ndarray,
        maturities: np.ndarray,
        implied_vols: np.ndarray,
        beta: float = 0.5,
    ) -> SABRParams:
        """Calibrate SABR parameters to market data."""
        if not SCIPY_AVAILABLE:
            return SABRParams(0.3, beta, 0.0, 0.3)

        def residuals(params):
            alpha, rho, nu = params
            if alpha < 0 or abs(rho) > 1 or nu < 0:
                return np.full(len(implied_vols), 1e10)
            p = SABRParams(alpha, beta, rho, nu)
            model_vols = np.array([
                self.sabr_implied_vol(f, k, t, p)
                for f, k, t in zip(forwards, strikes, maturities, strict=False)
            ])
            return model_vols - implied_vols

        result = least_squares(residuals, [0.3, 0.0, 0.3], method="lm")
        alpha, rho, nu = result.x
        self.sabr_params = SABRParams(alpha, beta, rho, nu)
        self._calibrated = True
        logger.info(f"[VolSurface] SABR calibrated: alpha={alpha:.4f} beta={beta:.2f} rho={rho:.3f} nu={nu:.4f}")
        return self.sabr_params

    # ── General interface ──

    def implied_vol(self, strike: float, maturity_days: float, forward: float) -> float:
        """Get implied volatility for any strike/maturity."""
        maturity_years = maturity_days / 365.0
        if maturity_years <= 0:
            return 0.5

        if self.model == "svi" and self.svi_params:
            log_moneyness = np.log(strike / forward)
            return self.implied_vol_svi(log_moneyness, maturity_years)
        elif self.model == "sabr" and self.sabr_params:
            return self.sabr_implied_vol(forward, strike, maturity_years, self.sabr_params)
        else:
            return 0.5  # fallback

    def generate_surface(
        self, forward: float, maturity_days: np.ndarray, strikes: np.ndarray
    ) -> np.ndarray:
        """Generate full volatility surface grid."""
        surface = np.zeros((len(maturity_days), len(strikes)))
        for i, t in enumerate(maturity_days):
            for j, k in enumerate(strikes):
                surface[i, j] = self.implied_vol(k, t, forward)
        return surface
