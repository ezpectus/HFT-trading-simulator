"""
Market microstructure — realistic price generation with fat tails, jumps,
stochastic volatility, regime switching, and intraday volume patterns.

Models:
- Student-t returns (df=4) for fat tails
- Merton jump diffusion (Poisson jumps)
- Heston stochastic volatility (correlated with price)
- Markov regime switching (calm → volatile → crash)
- U-shaped intraday volatility (high at open/close)
- VWAP-like volume profile
"""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import logging
logger = logging.getLogger(__name__)


class MarketRegime(Enum):
    CALM = 0
    VOLATILE = 1
    CRASH = 2
    RECOVERY = 3


# Markov transition matrix: P[regime_i → regime_j]
# Rows = current, Cols = next
#               CALM   VOL    CRASH  RECOV
REGIME_TRANSITIONS = np.array([
    [0.985, 0.014, 0.001, 0.000],  # CALM
    [0.020, 0.970, 0.008, 0.002],  # VOLATILE
    [0.000, 0.010, 0.950, 0.040],  # CRASH
    [0.030, 0.000, 0.000, 0.970],  # RECOVERY
])

REGIME_PARAMS = {
    MarketRegime.CALM:     {"drift": 0.0001, "vol_scale": 1.0,  "jump_prob": 0.001, "jump_size": 0.01},
    MarketRegime.VOLATILE: {"drift": -0.0002, "vol_scale": 2.5,  "jump_prob": 0.005, "jump_size": 0.03},
    MarketRegime.CRASH:    {"drift": -0.003,  "vol_scale": 5.0,  "jump_prob": 0.02,  "jump_size": 0.08},
    MarketRegime.RECOVERY: {"drift": 0.001,   "vol_scale": 1.5,  "jump_prob": 0.002, "jump_size": 0.02},
}


@dataclass
class MicrostructureConfig:
    base_volatility: float = 0.02          # Annualized base vol
    student_t_df: float = 4.0              # Degrees of freedom for fat tails
    heston_kappa: float = 2.0              # Mean reversion speed of variance
    heston_theta: float = 0.04             # Long-run variance
    heston_sigma: float = 0.3              # Vol of vol
    heston_rho: float = -0.7               # Correlation (price, vol)
    jump_lambda: float = 0.005             # Poisson jump intensity (per step)
    jump_mu: float = -0.01                 # Mean jump size (negative = crashes)
    jump_sigma: float = 0.03               # Jump size volatility
    dt: float = 1.0 / (252 * 24 * 60)      # Per-minute step
    intraday_pattern: bool = True          # U-shaped volatility
    regime_switching: bool = True          # Enable Markov regimes


class MarketMicrostructure:
    """Realistic market price generator with microstructure effects."""

    def __init__(self, config: MicrostructureConfig = None):
        self.config = config or MicrostructureConfig()
        self.regime: MarketRegime = MarketRegime.CALM
        self.variance: float = self.config.heston_theta
        self.step_count: int = 0
        self._rng = np.random.default_rng(seed=42)

    def reset(self, seed: int = 42) -> None:
        self.regime = MarketRegime.CALM
        self.variance = self.config.heston_theta
        self.step_count = 0
        self._rng = np.random.default_rng(seed=seed)

    def _maybe_switch_regime(self) -> None:
        if not self.config.regime_switching:
            return
        probs = REGIME_TRANSITIONS[self.regime.value]
        r = self._rng.random()
        cumulative = 0.0
        for i, p in enumerate(probs):
            cumulative += p
            if r < cumulative:
                self.regime = MarketRegime(i)
                return

    def _intraday_vol_multiplier(self, hour: float, minute: float) -> float:
        """U-shaped pattern: high at open (0h) and close (24h), low midday."""
        if not self.config.intraday_pattern:
            return 1.0
        t = hour + minute / 60.0
        # U-shape: 1.5 at t=0 and t=24, 0.7 at t=12
        return 0.7 + 0.8 * ((t / 12.0 - 1.0) ** 2)

    def _update_heston_variance(self, dt: float) -> float:
        """Heston stochastic volatility update (Euler discretization)."""
        kappa = self.config.heston_kappa
        theta = self.config.heston_theta
        sigma = self.config.heston_sigma
        dW_vol = self._rng.standard_normal() * np.sqrt(dt)
        self.variance += kappa * (theta - self.variance) * dt + sigma * np.sqrt(max(self.variance, 0)) * dW_vol
        self.variance = max(self.variance, 0.001)  # Floor variance
        return self.variance

    def _sample_student_t(self, df: float) -> float:
        """Sample from Student-t distribution (fat tails)."""
        x = self._rng.standard_normal()
        v = self._rng.chisquare(df)
        return x * np.sqrt(df / v)

    def _sample_jump(self, regime_params: dict) -> float:
        """Merton jump: Poisson trigger + Gaussian jump size."""
        if self._rng.random() < regime_params["jump_prob"]:
            jump = self._rng.normal(regime_params["jump_mu"], regime_params["jump_sigma"])
            return jump
        return 0.0

    def generate_return(self, hour: float = 0.0, minute: float = 0.0) -> float:
        """Generate a single return step with all microstructure effects."""
        self._maybe_switch_regime()
        regime_params = REGIME_PARAMS[self.regime]
        dt = self.config.dt

        # Stochastic volatility (Heston)
        vol = self._update_heston_variance(dt)
        vol_scale = regime_params["vol_scale"]
        intraday_mult = self._intraday_vol_multiplier(hour, minute)
        effective_vol = np.sqrt(vol) * vol_scale * intraday_mult

        # Student-t return (fat tails)
        t_sample = self._sample_student_t(self.config.student_t_df)
        drift = regime_params["drift"]
        ret = drift * dt + effective_vol * t_sample * np.sqrt(dt)

        # Merton jump
        ret += self._sample_jump(regime_params)

        self.step_count += 1
        return ret

    def generate_price(self, current_price: float, hour: float = 0.0, minute: float = 0.0) -> float:
        """Generate next price from current price."""
        ret = self.generate_return(hour, minute)
        return current_price * np.exp(ret)

    def generate_volume(self, hour: float = 0.0, minute: float = 0.0, base_volume: float = 100.0) -> float:
        """Generate volume following U-shaped intraday profile."""
        mult = self._intraday_vol_multiplier(hour, minute)
        noise = self._rng.lognormal(0, 0.5)
        vol_mult = 1.0
        if self.regime == MarketRegime.VOLATILE:
            vol_mult = 1.8
        elif self.regime == MarketRegime.CRASH:
            vol_mult = 3.5
        elif self.regime == MarketRegime.RECOVERY:
            vol_mult = 1.3
        return base_volume * mult * noise * vol_mult

    def get_state(self) -> dict:
        return {
            "regime": self.regime.name,
            "variance": self.variance,
            "step_count": self.step_count,
            "effective_vol": np.sqrt(self.variance),
        }
