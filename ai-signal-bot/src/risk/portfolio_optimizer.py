"""Portfolio optimization — Markowitz, Black-Litterman, Kelly criterion, risk parity.

Features:
- Markowitz efficient frontier
- Black-Litterman with strategy views
- Kelly criterion position sizing
- Risk parity allocation
- Dynamic rebalancing (threshold-based)
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class AssetStats:
    symbol: str
    expected_return: float = 0.0
    volatility: float = 0.0
    weight: float = 0.0


@dataclass
class PortfolioResult:
    weights: dict[str, float]
    expected_return: float
    volatility: float
    sharpe_ratio: float
    method: str


class PortfolioOptimizer:
    """Portfolio optimization with multiple methods."""

    def __init__(self, risk_free_rate: float = 0.02, rebalance_threshold: float = 0.05):
        self.risk_free_rate = risk_free_rate
        self.rebalance_threshold = rebalance_threshold  # 5% deviation triggers rebalance
        self.current_weights: dict[str, float] = {}
        self.target_weights: dict[str, float] = {}
        self.last_rebalance: float = 0.0

    def markowitz_optimize(
        self, returns: np.ndarray, symbols: list[str],
        target_return: float | None = None
    ) -> PortfolioResult:
        """Markowitz mean-variance optimization (minimum variance or target return)."""
        n = len(symbols)
        if n < 2 or returns.shape[0] < 10:
            w = np.ones(n) / n
            return PortfolioResult(
                weights=dict(zip(symbols, w, strict=False)),
                expected_return=0.0, volatility=0.0,
                sharpe_ratio=0.0, method="markowitz_equal"
            )

        cov = np.cov(returns.T) * 252  # Annualized
        mean_returns = returns.mean(axis=0) * 252  # Annualized

        # Minimum variance portfolio (simplified: no short selling constraint via projection)
        try:
            inv_cov = np.linalg.inv(cov)
            ones = np.ones(n)
            if target_return is not None:
                # Cap target return to feasible range [min(mean), max(mean)]
                feasible_min = float(np.min(mean_returns))
                feasible_max = float(np.max(mean_returns))
                target_return = float(np.clip(target_return, feasible_min, feasible_max))

                # Target return optimization
                A = np.vstack([
                    np.hstack([2 * cov, -mean_returns.reshape(-1, 1), -ones.reshape(-1, 1)]),
                    np.hstack([mean_returns.reshape(1, -1), np.zeros((1, 1)), np.zeros((1, 1))]),
                    np.hstack([ones.reshape(1, -1), np.zeros((1, 1)), np.zeros((1, 1))])
                ])
                b = np.zeros(n + 2)
                b[n] = target_return
                b[n + 1] = 1.0
                x = np.linalg.solve(A, b)
                w = x[:n]
            else:
                # Minimum variance
                w = inv_cov @ ones / (ones @ inv_cov @ ones)

            # Project to non-negative and normalize
            w = np.maximum(w, 0)
            w = w / max(w.sum(), 1e-10)

            # If target return led to all-zero weights (infeasible), fall back to equal weights
            if target_return is not None and w.sum() < 1e-10:
                w = np.ones(n) / n

        except np.linalg.LinAlgError:
            w = np.ones(n) / n

        port_return = w @ mean_returns
        port_vol = math.sqrt(max(w @ cov @ w, 0))
        sharpe = (port_return - self.risk_free_rate) / max(port_vol, 1e-10)

        return PortfolioResult(
            weights=dict(zip(symbols, w.tolist(), strict=False)),
            expected_return=port_return,
            volatility=port_vol,
            sharpe_ratio=sharpe,
            method="markowitz"
        )

    def black_litterman(
        self, returns: np.ndarray, symbols: list[str],
        views: dict[str, float], view_confidences: dict[str, float] | None = None
    ) -> PortfolioResult:
        """Black-Litterman optimization with strategy views.

        views: {symbol: expected_return} from strategy signals
        view_confidences: {symbol: confidence_0_to_1} (omega = 1/confidence)
        """
        n = len(symbols)
        if n < 2 or returns.shape[0] < 10:
            w = np.ones(n) / n
            return PortfolioResult(
                weights=dict(zip(symbols, w, strict=False)),
                expected_return=0.0, volatility=0.0,
                sharpe_ratio=0.0, method="bl_equal"
            )

        cov = np.cov(returns.T) * 252
        market_weights = np.ones(n) / n  # Equal weight as prior
        risk_aversion = 2.5

        # Prior: implied returns from market portfolio
        pi = risk_aversion * cov @ market_weights

        # Views
        P = np.zeros((len(views), n))
        Q = np.zeros(len(views))
        omega = np.zeros((len(views), len(views)))

        for i, (sym, view_ret) in enumerate(views.items()):
            if sym in symbols:
                P[i, symbols.index(sym)] = 1.0
                Q[i] = view_ret
                conf = (view_confidences or {}).get(sym, 0.5)
                omega[i, i] = 1.0 / max(conf, 0.01)

        # Posterior returns
        try:
            tau = 0.025
            inv_cov = np.linalg.inv(cov * tau)
            inv_omega = np.linalg.inv(omega)
            posterior_returns = np.linalg.inv(inv_cov + P.T @ inv_omega @ P) @ (
                inv_cov @ pi + P.T @ inv_omega @ Q
            )
        except np.linalg.LinAlgError:
            posterior_returns = pi

        # Optimize with posterior returns
        try:
            inv_cov_full = np.linalg.inv(cov)
            ones = np.ones(n)
            w = inv_cov_full @ posterior_returns / (ones @ inv_cov_full @ posterior_returns)
            w = np.maximum(w, 0)
            w = w / max(w.sum(), 1e-10)
        except np.linalg.LinAlgError:
            w = np.ones(n) / n

        port_return = w @ posterior_returns
        port_vol = math.sqrt(max(w @ cov @ w, 0))
        sharpe = (port_return - self.risk_free_rate) / max(port_vol, 1e-10)

        return PortfolioResult(
            weights=dict(zip(symbols, w.tolist(), strict=False)),
            expected_return=port_return,
            volatility=port_vol,
            sharpe_ratio=sharpe,
            method="black_litterman"
        )

    def kelly_criterion(
        self, win_rate: float, win_loss_ratio: float,
        max_leverage: float = 1.0
    ) -> float:
        """Kelly criterion position sizing.

        f* = (p * b - q) / b
        where p = win rate, q = 1-p, b = win/loss ratio
        """
        p = win_rate
        q = 1.0 - p
        b = win_loss_ratio

        if b <= 0:
            return 0.0

        kelly = (p * b - q) / b
        # Half-Kelly for safety
        kelly = kelly * 0.5
        # Cap at max leverage
        kelly = min(kelly, max_leverage)
        return max(kelly, 0.0)

    def risk_parity(
        self, returns: np.ndarray, symbols: list[str],
        target_volatility: float = 0.15
    ) -> PortfolioResult:
        """Risk parity allocation — equal risk contribution from each asset."""
        n = len(symbols)
        if n < 2 or returns.shape[0] < 10:
            w = np.ones(n) / n
            return PortfolioResult(
                weights=dict(zip(symbols, w, strict=False)),
                expected_return=0.0, volatility=target_volatility,
                sharpe_ratio=0.0, method="risk_parity_equal"
            )

        cov = np.cov(returns.T) * 252
        vols = np.sqrt(np.diag(cov))

        # Inverse volatility weighting
        inv_vols = 1.0 / np.maximum(vols, 1e-10)
        w = inv_vols / inv_vols.sum()

        # Scale to target volatility
        port_vol = math.sqrt(max(w @ cov @ w, 0))
        if port_vol > 1e-10:
            scale = target_volatility / port_vol
            w = w * scale
            w = np.minimum(w, 1.0)  # No leverage
            w = w / max(w.sum(), 1e-10)

        mean_returns = returns.mean(axis=0) * 252
        port_return = w @ mean_returns
        port_vol = math.sqrt(max(w @ cov @ w, 0))
        sharpe = (port_return - self.risk_free_rate) / max(port_vol, 1e-10)

        return PortfolioResult(
            weights=dict(zip(symbols, w.tolist(), strict=False)),
            expected_return=port_return,
            volatility=port_vol,
            sharpe_ratio=sharpe,
            method="risk_parity"
        )

    def check_rebalance_needed(self, current_values: dict[str, float]) -> bool:
        """Check if portfolio needs rebalancing based on threshold deviation."""
        if not self.target_weights or not current_values:
            return False

        total_value = sum(current_values.values())
        if total_value <= 0:
            return False

        for symbol, target_w in self.target_weights.items():
            current_w = current_values.get(symbol, 0) / total_value
            if abs(current_w - target_w) > self.rebalance_threshold:
                return True

        # Check for symbols in current portfolio not in target weights
        for symbol in current_values:
            if symbol not in self.target_weights:
                current_w = current_values[symbol] / total_value
                if current_w > self.rebalance_threshold:
                    return True

        return False

    def set_target_weights(self, weights: dict[str, float]) -> None:
        """Set target allocation weights."""
        total = sum(weights.values())
        if total > 0:
            self.target_weights = {k: v / total for k, v in weights.items()}
        else:
            self.target_weights = weights

    def compute_rebalance_trades(
        self, current_values: dict[str, float]
    ) -> dict[str, float]:
        """Compute required trades to rebalance to target weights."""
        total_value = sum(current_values.values())
        if total_value <= 0 or not self.target_weights:
            return {}

        trades = {}
        for symbol, target_w in self.target_weights.items():
            target_value = total_value * target_w
            current_value = current_values.get(symbol, 0)
            trades[symbol] = target_value - current_value

        return trades
