"""
VaR (Value at Risk) and CVaR (Conditional VaR) stress testing.

Risk metrics:
  - Historical VaR: empirical quantile of returns
  - Parametric VaR: Gaussian assumption
  - Monte Carlo VaR: simulated paths with GBM or GARCH
  - CVaR (Expected Shortfall): average loss beyond VaR
  - Stress scenarios: 2008 crash, COVID crash, FTX collapse, flash crash

Usage:
    from src.risk.var_stress_test import RiskAnalyzer

    analyzer = RiskAnalyzer(returns, portfolio_value=100000)
    var_95 = analyzer.historical_var(confidence=0.95)
    cvar_95 = analyzer.historical_cvar(confidence=0.95)
    mc_var = analyzer.monte_carlo_var(confidence=0.95, n_sims=10000)
    stress = analyzer.stress_test(scenario="covid_crash")
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class RiskMetrics:
    var_95: float  # 95% VaR in USD
    var_99: float  # 99% VaR in USD
    cvar_95: float  # 95% CVaR in USD
    cvar_99: float  # 99% CVaR in USD
    max_drawdown: float
    volatility_annual: float
    sharpe_ratio: float
    sortino_ratio: float
    calmar_ratio: float


@dataclass
class StressTestResult:
    scenario: str
    portfolio_loss_usd: float
    portfolio_loss_pct: float
    worst_asset: str
    worst_asset_loss: float
    recovery_time_days: int
    description: str


# Historical stress scenarios (crypto market)
STRESS_SCENARIOS = {
    "covid_crash": {
        "shock_pct": -0.45,  # -45% in 2 days (March 2020)
        "duration_days": 2,
        "description": "COVID-19 crash: BTC -45% in 48 hours (March 2020)",
    },
    "ftx_collapse": {
        "shock_pct": -0.25,  # -25% in 4 days (Nov 2022)
        "duration_days": 4,
        "description": "FTX collapse: BTC -25%, altcoins -40% (Nov 2022)",
    },
    "flash_crash_2021": {
        "shock_pct": -0.30,  # -30% in hours (May 2021)
        "duration_days": 1,
        "description": "May 2021 flash crash: BTC -30% in 24h",
    },
    "luna_collapse": {
        "shock_pct": -0.35,
        "duration_days": 3,
        "description": "Terra/LUNA collapse: crypto market -35% (May 2022)",
    },
    "china_ban_2021": {
        "shock_pct": -0.15,
        "duration_days": 2,
        "description": "China crypto ban: BTC -15% (Sep 2021)",
    },
    "2008_financial": {
        "shock_pct": -0.50,
        "duration_days": 30,
        "description": "2008 financial crisis (hypothetical crypto impact)",
    },
    "extreme_tail": {
        "shock_pct": -0.60,
        "duration_days": 7,
        "description": "Extreme tail event: 6-sigma crash (-60%)",
    },
}


class RiskAnalyzer:
    """Portfolio risk analysis with VaR, CVaR, and stress testing."""

    def __init__(
        self,
        returns: np.ndarray,
        portfolio_value: float = 10000.0,
        weights: np.ndarray | None = None,
        risk_free_rate: float = 0.0,
        annualization_factor: int = 365,  # crypto trades 365 days
    ):
        self.returns = returns
        self.portfolio_value = portfolio_value
        self.n_assets = returns.shape[1] if returns.ndim > 1 else 1
        self.weights = weights if weights is not None else np.ones(self.n_assets) / self.n_assets
        self.risk_free_rate = risk_free_rate
        self.annualization = annualization_factor

        # Compute portfolio returns
        if returns.ndim > 1:
            self.port_returns = returns @ self.weights
        else:
            self.port_returns = returns

    def historical_var(self, confidence: float = 0.95) -> float:
        """Historical VaR — empirical quantile of portfolio returns."""
        percentile = (1 - confidence) * 100
        var_return = np.percentile(self.port_returns, percentile)
        return abs(var_return * self.portfolio_value)

    def historical_cvar(self, confidence: float = 0.95) -> float:
        """Historical CVaR — average loss beyond VaR."""
        percentile = (1 - confidence) * 100
        var_return = np.percentile(self.port_returns, percentile)
        tail_losses = self.port_returns[self.port_returns <= var_return]
        if len(tail_losses) == 0:
            return self.historical_var(confidence)
        cvar_return = np.mean(tail_losses)
        return abs(cvar_return * self.portfolio_value)

    def parametric_var(self, confidence: float = 0.95) -> float:
        """Parametric (Gaussian) VaR."""
        try:
            from scipy.stats import norm
            z = norm.ppf(1 - confidence)
            mean = np.mean(self.port_returns)
            std = np.std(self.port_returns)
            var_return = mean + z * std
            return abs(var_return * self.portfolio_value)
        except ImportError:
            # Manual z-score approximation
            z_scores = {0.90: 1.282, 0.95: 1.645, 0.99: 2.326}
            z = z_scores.get(confidence, 1.645)
            mean = np.mean(self.port_returns)
            std = np.std(self.port_returns)
            var_return = mean + z * std
            return abs(var_return * self.portfolio_value)

    def monte_carlo_var(
        self, confidence: float = 0.95, n_sims: int = 10000,
        horizon_days: int = 1, model: str = "gbm",
    ) -> float:
        """Monte Carlo VaR using GBM or GARCH simulation."""
        mean = np.mean(self.port_returns)
        std = np.std(self.port_returns)

        if model == "gbm":
            # Geometric Brownian Motion
            simulated_returns = np.random.normal(
                mean * horizon_days, std * np.sqrt(horizon_days), n_sims
            )
        elif model == "fat_tails":
            # Student's t-distribution for fat tails
            from scipy.stats import t as t_dist
            df = 5  # degrees of freedom (fat tails)
            simulated_returns = t_dist.rvs(
                df, loc=mean * horizon_days,
                scale=std * np.sqrt(horizon_days),
                size=n_sims,
            )
        else:
            simulated_returns = np.random.normal(
                mean * horizon_days, std * np.sqrt(horizon_days), n_sims
            )

        percentile = (1 - confidence) * 100
        var_return = np.percentile(simulated_returns, percentile)
        return abs(var_return * self.portfolio_value)

    def monte_carlo_cvar(
        self, confidence: float = 0.95, n_sims: int = 10000,
        horizon_days: int = 1,
    ) -> float:
        """Monte Carlo CVaR."""
        mean = np.mean(self.port_returns)
        std = np.std(self.port_returns)
        simulated_returns = np.random.normal(
            mean * horizon_days, std * np.sqrt(horizon_days), n_sims
        )
        percentile = (1 - confidence) * 100
        var_return = np.percentile(simulated_returns, percentile)
        tail = simulated_returns[simulated_returns <= var_return]
        cvar_return = np.mean(tail) if len(tail) > 0 else var_return
        return abs(cvar_return * self.portfolio_value)

    def stress_test(self, scenario: str = "covid_crash") -> StressTestResult:
        """Run historical stress test scenario."""
        config = STRESS_SCENARIOS.get(scenario)
        if not config:
            raise ValueError(f"Unknown scenario: {scenario}. Available: {list(STRESS_SCENARIOS.keys())}")

        shock = config["shock_pct"]
        loss_usd = abs(shock * self.portfolio_value)

        # Find worst-performing asset
        if self.returns.ndim > 1:
            asset_losses = np.mean(self.returns, axis=0) * config["duration_days"] + shock
            worst_idx = np.argmin(asset_losses)
            worst_loss = asset_losses[worst_idx]
            worst_asset = f"Asset_{worst_idx}"
        else:
            worst_asset = "Portfolio"
            worst_loss = shock

        return StressTestResult(
            scenario=scenario,
            portfolio_loss_usd=loss_usd,
            portfolio_loss_pct=abs(shock),
            worst_asset=worst_asset,
            worst_asset_loss=worst_loss,
            recovery_time_days=config["duration_days"] * 3,  # rough estimate
            description=config["description"],
        )

    def stress_test_all(self) -> list[StressTestResult]:
        """Run all stress test scenarios."""
        return [self.stress_test(s) for s in STRESS_SCENARIOS]

    def compute_all_metrics(self) -> RiskMetrics:
        """Compute comprehensive risk metrics."""
        cumulative = np.cumprod(1 + self.port_returns)
        peak = np.maximum.accumulate(cumulative)
        drawdown = (cumulative - peak) / peak
        max_dd = np.min(drawdown)

        annual_mean = np.mean(self.port_returns) * self.annualization
        annual_std = np.std(self.port_returns) * np.sqrt(self.annualization)
        sharpe = (annual_mean - self.risk_free_rate) / annual_std if annual_std > 0 else 0

        downside = self.port_returns[self.port_returns < 0]
        downside_std = np.std(downside) * np.sqrt(self.annualization) if len(downside) > 0 else 0
        sortino = (annual_mean - self.risk_free_rate) / downside_std if downside_std > 0 else 0

        calmar = annual_mean / abs(max_dd) if max_dd != 0 else 0

        return RiskMetrics(
            var_95=self.historical_var(0.95),
            var_99=self.historical_var(0.99),
            cvar_95=self.historical_cvar(0.95),
            cvar_99=self.historical_cvar(0.99),
            max_drawdown=max_dd * self.portfolio_value,
            volatility_annual=annual_std,
            sharpe_ratio=sharpe,
            sortino_ratio=sortino,
            calmar_ratio=calmar,
        )
