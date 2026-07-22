"""Statistical arbitrage — multi-pair cointegration trading.

Cointegration scanning (Engle-Granger), Kalman filter hedge ratio,
z-score entry/exit with dynamic thresholds, half-life holding period,
correlation matrix monitoring.
"""

from __future__ import annotations

import logging
import math
from collections import deque
from dataclasses import dataclass

import numpy as np

from src.strategies.strategies import Signal, SignalDirection

logger = logging.getLogger(__name__)


def _ols_regression(y: np.ndarray, x: np.ndarray) -> tuple[float, float, np.ndarray]:
    """OLS regression: y = alpha + beta * x + residual. Returns (alpha, beta, residuals)."""
    n = len(y)
    if n < 3:
        return 0.0, 1.0, np.zeros(n)
    x_with_const = np.column_stack([np.ones(n), x])
    try:
        coeffs, _, _, _ = np.linalg.lstsq(x_with_const, y, rcond=None)
        alpha, beta = coeffs[0], coeffs[1]
        residuals = y - (alpha + beta * x)
        return alpha, beta, residuals
    except np.linalg.LinAlgError:
        return 0.0, 1.0, y - x


def _adf_statistic(residuals: np.ndarray) -> float:
    """Augmented Dickey-Fuller test statistic (simplified, no lag selection)."""
    n = len(residuals)
    if n < 10:
        return 0.0
    dy = np.diff(residuals)
    y_lag = residuals[:-1]
    # Regress dy on y_lag
    x = y_lag - y_lag.mean()
    y = dy - dy.mean()
    denom = np.sum(x * x)
    if denom < 1e-12:
        return 0.0
    beta = np.sum(x * y) / denom
    # Standard error
    residuals_reg = dy - beta * y_lag
    se = math.sqrt(np.sum(residuals_reg ** 2) / (n - 2)) / math.sqrt(denom)
    if se < 1e-12:
        return 0.0
    return beta / se


def _half_life(residuals: np.ndarray) -> float:
    """Estimate half-life of mean reversion via Ornstein-Uhlenbeck AR(1)."""
    n = len(residuals)
    if n < 10:
        return float("inf")
    dy = np.diff(residuals)
    y_lag = residuals[:-1] - residuals[:-1].mean()
    x = y_lag
    y = dy - dy.mean()
    denom = np.sum(x * x)
    if denom < 1e-12:
        return float("inf")
    beta = np.sum(x * y) / denom
    if beta >= 0:
        return float("inf")
    return -math.log(2) / beta


class KalmanFilterHedge:
    """Kalman filter for adaptive hedge ratio estimation."""

    def __init__(self, process_var: float = 1e-5, measurement_var: float = 1e-3):
        self.process_var = process_var
        self.measurement_var = measurement_var
        self.hedge_ratio: float = 1.0
        self.intercept: float = 0.0
        self._p_ratio: float = 1.0
        self._p_intercept: float = 1.0
        self._initialized = False

    def init(self, ratio: float, intercept: float = 0.0) -> None:
        self.hedge_ratio = ratio
        self.intercept = intercept
        self._p_ratio = 1.0
        self._p_intercept = 1.0
        self._initialized = True

    def update(self, y: float, x: float) -> tuple[float, float]:
        """Update with new price observations. Returns (hedge_ratio, intercept)."""
        if not self._initialized:
            self.init(1.0, 0.0)

        # Predict
        self._p_ratio += self.process_var
        self._p_intercept += self.process_var

        # Update
        predicted_y = self.intercept + self.hedge_ratio * x
        residual = y - predicted_y
        s = self._p_ratio * x * x + self._p_intercept + self.measurement_var
        if s < 1e-12:
            return self.hedge_ratio, self.intercept

        k_ratio = self._p_ratio * x / s
        k_intercept = self._p_intercept / s

        self.hedge_ratio += k_ratio * residual
        self.intercept += k_intercept * residual

        self._p_ratio -= k_ratio * x * self._p_ratio
        self._p_intercept -= k_intercept * self._p_intercept

        return self.hedge_ratio, self.intercept


@dataclass
class PairConfig:
    entry_z: float = 2.0
    exit_z: float = 0.5
    stop_z: float = 4.0
    min_half_life: float = 1.0
    max_half_life: float = 100.0
    adf_threshold: float = -2.86    # 5% critical value
    min_correlation: float = 0.5
    lookback: int = 200
    recompute_interval: int = 50    # Recompute cointegration every N steps


class StatisticalArbitrage:
    """Multi-pair statistical arbitrage strategy."""

    def __init__(self, config: PairConfig | None = None):
        self.config = config or PairConfig()
        self.name = "statistical_arbitrage"
        self.kalman = KalmanFilterHedge()
        self.spread_history: deque[float] = deque(maxlen=self.config.lookback)
        self.spread_mean: float = 0.0
        self.spread_std: float = 1.0
        self.half_life: float = float("inf")
        self.adf_stat: float = 0.0
        self.is_cointegrated: bool = False
        self.step_count: int = 0
        self.current_hedge_ratio: float = 1.0
        self.current_intercept: float = 0.0

    def check_cointegration(self, prices_a: np.ndarray, prices_b: np.ndarray) -> dict:
        """Run Engle-Granger 2-step cointegration test."""
        if len(prices_a) < 20 or len(prices_b) < 20:
            return {"cointegrated": False, "adf": 0.0, "hedge_ratio": 1.0, "half_life": float("inf")}

        alpha, beta, residuals = _ols_regression(prices_a, prices_b)
        adf = _adf_statistic(residuals)
        hl = _half_life(residuals)

        cointegrated = (
            adf < self.config.adf_threshold and
            self.config.min_half_life <= hl <= self.config.max_half_life
        )

        self.adf_stat = adf
        self.half_life = hl
        self.current_hedge_ratio = beta
        self.current_intercept = alpha
        self.is_cointegrated = cointegrated

        if cointegrated:
            self.kalman.init(beta, alpha)

        return {
            "cointegrated": cointegrated,
            "adf": adf,
            "hedge_ratio": beta,
            "intercept": alpha,
            "half_life": hl,
        }

    def compute_spread(self, price_a: float, price_b: float) -> float:
        """Compute spread using current hedge ratio."""
        return price_a - self.current_hedge_ratio * price_b - self.current_intercept

    def update(self, price_a: float, price_b: float) -> None:
        """Update spread history and Kalman filter."""
        if self.is_cointegrated:
            self.kalman.update(price_a, price_b)
            self.current_hedge_ratio = self.kalman.hedge_ratio
            self.current_intercept = self.kalman.intercept

        spread = self.compute_spread(price_a, price_b)
        self.spread_history.append(spread)

        if len(self.spread_history) >= 20:
            arr = np.array(self.spread_history)
            self.spread_mean = arr.mean()
            self.spread_std = max(arr.std(), 1e-8)

        self.step_count += 1

    def z_score(self) -> float:
        """Current z-score of the spread."""
        if self.spread_std < 1e-8 or len(self.spread_history) < 2:
            return 0.0
        current_spread = self.spread_history[-1]
        return (current_spread - self.spread_mean) / self.spread_std

    def analyze(self, symbol_a: str, symbol_b: str,
                candles_a: list[dict], candles_b: list[dict]) -> Signal:
        """Analyze a pair for statistical arbitrage signals."""
        min_len = min(len(candles_a), len(candles_b))
        if min_len < self.config.lookback:
            return Signal(
                symbol=f"{symbol_a}/{symbol_b}", direction=SignalDirection.NEUTRAL,
                confidence=0, strategy=self.name, entry_price=0,
                stop_loss=0, take_profit=0, reason="Insufficient data for cointegration",
            )

        closes_a = np.array([c["close"] if isinstance(c, dict) else c.close for c in candles_a[-self.config.lookback:]])
        closes_b = np.array([c["close"] if isinstance(c, dict) else c.close for c in candles_b[-self.config.lookback:]])

        # Recompute cointegration periodically
        if self.step_count % self.config.recompute_interval == 0 or not self.is_cointegrated:
            result = self.check_cointegration(closes_a, closes_b)
            if not result["cointegrated"]:
                return Signal(
                    symbol=f"{symbol_a}/{symbol_b}", direction=SignalDirection.NEUTRAL,
                    confidence=0, strategy=self.name, entry_price=closes_a[-1],
                    stop_loss=0, take_profit=0,
                    reason=f"Not cointegrated (ADF={self.adf_stat:.2f}, HL={self.half_life:.1f})",
                )

        # Update spread
        self.update(closes_a[-1], closes_b[-1])

        z = self.z_score()
        price_a = closes_a[-1]

        if abs(z) < self.config.entry_z:
            return Signal(
                symbol=f"{symbol_a}/{symbol_b}", direction=SignalDirection.NEUTRAL,
                confidence=0, strategy=self.name, entry_price=price_a,
                stop_loss=0, take_profit=0, reason=f"Z-score {z:.2f} below entry threshold",
            )

        # Entry signals
        if z > self.config.entry_z:
            # Spread too wide: short A, long B
            confidence = min(95, 40 + abs(z) * 10)
            return Signal(
                symbol=f"{symbol_a}/{symbol_b}", direction=SignalDirection.SHORT,
                confidence=confidence, strategy=self.name,
                entry_price=price_a, stop_loss=price_a * (1 + self.config.stop_z * self.spread_std / price_a),
                take_profit=price_a * (1 + self.config.exit_z * self.spread_std / price_a),
                reason=f"Z-score={z:.2f} > {self.config.entry_z}, short {symbol_a} long {symbol_b}",
            )
        elif z < -self.config.entry_z:
            # Spread too narrow: long A, short B
            confidence = min(95, 40 + abs(z) * 10)
            return Signal(
                symbol=f"{symbol_a}/{symbol_b}", direction=SignalDirection.LONG,
                confidence=confidence, strategy=self.name,
                entry_price=price_a, stop_loss=price_a * (1 - self.config.stop_z * self.spread_std / price_a),
                take_profit=price_a * (1 - self.config.exit_z * self.spread_std / price_a),
                reason=f"Z-score={z:.2f} < -{self.config.entry_z}, long {symbol_a} short {symbol_b}",
            )

        return Signal(
            symbol=f"{symbol_a}/{symbol_b}", direction=SignalDirection.NEUTRAL,
            confidence=0, strategy=self.name, entry_price=price_a,
            stop_loss=0, take_profit=0, reason="No signal",
        )


class CorrelationMatrix:
    """Monitor correlation matrix across multiple symbols."""

    def __init__(self, symbols: list[str], lookback: int = 200):
        self.symbols = symbols
        self.lookback = lookback
        self.price_history: dict[str, deque[float]] = {
            s: deque(maxlen=lookback) for s in symbols
        }
        self.matrix: np.ndarray | None = None

    def update(self, symbol: str, price: float) -> None:
        if symbol in self.price_history:
            self.price_history[symbol].append(price)

    def compute(self) -> np.ndarray | None:
        """Compute correlation matrix from price returns."""
        min_len = min(len(d) for d in self.price_history.values())
        if min_len < 10:
            return None

        returns = {}
        for sym, prices in self.price_history.items():
            arr = np.array(list(prices)[-min_len:])
            rets = np.diff(np.log(arr))
            returns[sym] = rets

        n = len(self.symbols)
        mat = np.zeros((n, n))
        for i in range(n):
            for j in range(n):
                if i == j:
                    mat[i, j] = 1.0
                else:
                    r1, r2 = returns[self.symbols[i]], returns[self.symbols[j]]
                    std1, std2 = r1.std(), r2.std()
                    if std1 > 1e-10 and std2 > 1e-10:
                        mat[i, j] = np.corrcoef(r1, r2)[0, 1]
                    else:
                        mat[i, j] = 0.0

        self.matrix = mat
        return mat

    def find_pairs(self, min_corr: float = 0.5) -> list[tuple[str, str, float]]:
        """Find highly correlated pairs."""
        if self.matrix is None:
            return []
        pairs = []
        n = len(self.symbols)
        for i in range(n):
            for j in range(i + 1, n):
                corr = self.matrix[i, j]
                if abs(corr) >= min_corr:
                    pairs.append((self.symbols[i], self.symbols[j], corr))
        return sorted(pairs, key=lambda x: abs(x[2]), reverse=True)
