"""ML ensemble strategy — feature engineering, LightGBM/XGBoost direction prediction,
Isolation Forest anomaly filtering, HMM regime detection, walk-forward optimization.

Uses scikit-learn for models (LightGBM/XGBoost optional with fallback to GradientBoosting).
"""

from __future__ import annotations

import logging
import math
from collections import deque
from dataclasses import dataclass

import numpy as np

from src.strategies.ml_features import FeatureEngineer  # noqa: F401 (re-export)
from src.strategies.strategies import Signal, SignalDirection

logger = logging.getLogger(__name__)

# Try importing ML libraries
try:
    from sklearn.ensemble import GradientBoostingClassifier, IsolationForest
    from sklearn.model_selection import TimeSeriesSplit  # noqa: F401
    from sklearn.preprocessing import StandardScaler
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    logger.warning("scikit-learn not available, ML ensemble will use simple heuristics")

try:
    import lightgbm as lgb
    LGB_AVAILABLE = True
except ImportError:
    LGB_AVAILABLE = False

try:
    import xgboost as xgb
    XGB_AVAILABLE = True
except ImportError:
    XGB_AVAILABLE = False


@dataclass
class MLConfig:
    lookback: int = 200
    feature_window: int = 20
    prediction_horizon: int = 5       # Predict return N candles ahead
    train_interval: int = 50          # Retrain every N candles
    min_train_samples: int = 100
    confidence_threshold: float = 60.0
    anomaly_contamination: float = 0.05
    n_hmm_states: int = 3
    use_lightgbm: bool = True
    use_xgboost: bool = False


class HMMRegimeDetector:
    """Simple HMM-like regime detection using Gaussian mixture + transition matrix."""

    def __init__(self, n_states: int = 3):
        self.n_states = n_states
        self.states = ["calm", "trending", "volatile"]
        self.current_state: int = 0
        self.transition_matrix = np.full((n_states, n_states), 1.0 / n_states)
        self.state_means = np.zeros(n_states)
        self.state_vars = np.ones(n_states)
        self._returns: deque[float] = deque(maxlen=500)
        self._fitted = False
        self._update_count: int = 0

    def update(self, ret: float) -> int:
        """Update with new return, return current regime index."""
        self._returns.append(ret)
        self._update_count += 1
        if len(self._returns) >= 100 and not self._fitted:
            self._fit()
        elif self._fitted and self._update_count % 50 == 0:
            self._fit()

        if self._fitted:
            # Classify current return
            log_probs = []
            for i in range(self.n_states):
                var = max(self.state_vars[i], 1e-10)
                lp = -0.5 * math.log(2 * math.pi * var) - (ret - self.state_means[i]) ** 2 / (2 * var)
                lp += math.log(max(self.transition_matrix[self.current_state, i], 1e-10))
                log_probs.append(lp)
            self.current_state = int(np.argmax(log_probs))

        return self.current_state

    def _fit(self) -> None:
        """Simple k-means-like fitting."""
        arr = np.array(self._returns)
        if len(arr) < 50:
            return
        # Sort returns and split into n_states groups
        sorted_returns = np.sort(arr)
        n = len(sorted_returns)
        for i in range(self.n_states):
            start = int(i * n / self.n_states)
            end = int((i + 1) * n / self.n_states)
            segment = sorted_returns[start:end]
            self.state_means[i] = segment.mean()
            self.state_vars[i] = max(segment.var(), 1e-8)

        # Estimate transition matrix from state sequence
        states = np.array([self._classify(r) for r in arr])
        trans = np.zeros((self.n_states, self.n_states))
        for i in range(len(states) - 1):
            trans[states[i], states[i + 1]] += 1
        row_sums = trans.sum(axis=1, keepdims=True)
        row_sums[row_sums == 0] = 1
        self.transition_matrix = trans / row_sums
        self._fitted = True

    def _classify(self, ret: float) -> int:
        dists = [abs(ret - m) / max(math.sqrt(v), 1e-5) for m, v in zip(self.state_means, self.state_vars, strict=False)]
        return int(np.argmin(dists))

    def get_regime(self) -> str:
        return self.states[self.current_state] if self.current_state < len(self.states) else "unknown"


class MLEnsembleStrategy:
    """ML-based ensemble with regime detection and anomaly filtering."""

    def __init__(self, config: MLConfig | None = None):
        self.config = config or MLConfig()
        self.name = "ml_ensemble"
        self.feature_engineer = FeatureEngineer()
        self.hmm = HMMRegimeDetector(n_states=self.config.n_hmm_states)
        self.model = None
        self.anomaly_detector = None
        self.scaler = StandardScaler() if SKLEARN_AVAILABLE else None
        self.is_trained = False
        self.train_count = 0
        self.step_count = 0
        self.feature_importance: dict = {}
        self.last_prediction: float = 0.0
        self.last_regime: str = "calm"

    def _build_model(self) -> None:
        """Build the ML model."""
        if not SKLEARN_AVAILABLE:
            return

        if self.config.use_lightgbm and LGB_AVAILABLE:
            self.model = lgb.LGBMClassifier(
                n_estimators=100, max_depth=5, learning_rate=0.05,
                subsample=0.8, colsample_bytree=0.8, verbose=-1
            )
        elif self.config.use_xgboost and XGB_AVAILABLE:
            self.model = xgb.XGBClassifier(
                n_estimators=100, max_depth=5, learning_rate=0.05,
                subsample=0.8, colsample_bytree=0.8, verbosity=0
            )
        else:
            self.model = GradientBoostingClassifier(
                n_estimators=50, max_depth=3, learning_rate=0.05
            )

        self.anomaly_detector = IsolationForest(
            contamination=self.config.anomaly_contamination, random_state=42
        )

    def _prepare_labels(self, closes: np.ndarray, horizon: int) -> np.ndarray:
        """Create labels: 1 if return > 0 over horizon, 0 otherwise."""
        labels = []
        for i in range(len(closes) - horizon):
            if closes[i] < 1e-8:
                labels.append(0)
                continue
            ret = (closes[i + horizon] / closes[i] - 1)
            labels.append(1 if ret > 0 else 0)
        return np.array(labels)

    def train(self, candles: list[dict]) -> dict:
        """Train the model on historical data."""
        if not SKLEARN_AVAILABLE:
            return {"trained": False, "reason": "scikit-learn not available"}
        if len(candles) < self.config.min_train_samples + self.config.feature_window:
            return {"trained": False, "reason": "Insufficient data"}
        if self.model is None:
            self._build_model()

        features = self.feature_engineer.extract_features(candles, self.config.feature_window)
        if len(features) < self.config.min_train_samples:
            return {"trained": False, "reason": "Not enough feature samples"}

        closes = np.array([c["close"] if isinstance(c, dict) else c.close for c in candles])
        labels = self._prepare_labels(closes[self.config.feature_window:], self.config.prediction_horizon)
        min_len = min(len(features), len(labels))
        X, y = features[:min_len], labels[:min_len]
        if len(X) < self.config.min_train_samples or len(np.unique(y)) < 2:
            return {"trained": False, "reason": "Insufficient samples or single class"}

        X_scaled = self.scaler.fit_transform(X)
        X_clean, y_clean = self._filter_anomalies(X_scaled, y)
        self.model.fit(X_clean, y_clean)
        self.is_trained = True
        self.train_count += 1
        self._extract_feature_importance()
        self._train_hmm(closes)

        logger.info(f"[ML Ensemble] Model trained: {len(X_clean)} samples, {X.shape[1]} features")
        return {"trained": True, "samples": len(X_clean), "features": X.shape[1],
                "train_count": self.train_count}

    def _filter_anomalies(self, X_scaled: np.ndarray, y: np.ndarray) -> tuple:
        """Train anomaly detector and filter outliers."""
        self.anomaly_detector.fit(X_scaled)
        is_normal = self.anomaly_detector.predict(X_scaled) == 1
        X_clean, y_clean = X_scaled[is_normal], y[is_normal]
        if len(X_clean) < 50 or len(np.unique(y_clean)) < 2:
            X_clean, y_clean = X_scaled, y
        return X_clean, y_clean

    def _extract_feature_importance(self) -> None:
        """Extract feature importance from trained model."""
        if hasattr(self.model, "feature_importances_"):
            self.feature_importance = {
                f"feature_{i}": float(imp)
                for i, imp in enumerate(self.model.feature_importances_)
            }

    def _train_hmm(self, closes: np.ndarray) -> None:
        """Train HMM regime detector on log returns."""
        safe_closes = np.maximum(closes, 1e-8)
        returns = np.diff(np.log(safe_closes))
        for r in returns:
            self.hmm.update(r)

    def predict(self, candles: list[dict]) -> dict:
        """Predict direction from latest candles."""
        if not self.is_trained or not SKLEARN_AVAILABLE:
            return {"direction": 0, "confidence": 0, "regime": "unknown"}

        features = self.feature_engineer.extract_features(candles, self.config.feature_window)
        if len(features) == 0:
            return {"direction": 0, "confidence": 0, "regime": "unknown"}

        latest = features[-1:].reshape(1, -1)
        latest_scaled = self.scaler.transform(latest)

        # Check anomaly
        is_anomaly = self.anomaly_detector.predict(latest_scaled)[0] == -1
        if is_anomaly:
            return {"direction": 0, "confidence": 0, "regime": self.hmm.get_regime(), "anomaly": True}

        # Predict
        proba = self.model.predict_proba(latest_scaled)[0]
        direction = 1 if proba[1] > 0.5 else -1
        confidence = max(proba) * 100

        # Update regime
        closes = [c["close"] if isinstance(c, dict) else c.close for c in candles]
        if len(closes) >= 2:
            ret = math.log(max(closes[-1] / closes[-2], 1e-8))
            self.hmm.update(ret)
        self.last_regime = self.hmm.get_regime()
        self.last_prediction = direction

        return {
            "direction": direction,
            "confidence": confidence,
            "regime": self.last_regime,
            "anomaly": False,
        }

    def analyze(self, symbol: str, candles: list[dict]) -> Signal:
        """Generate trading signal from ML prediction."""
        self.step_count += 1
        if self.step_count % self.config.train_interval == 0 and len(candles) >= self.config.min_train_samples:
            result = self.train(candles)
            if not result.get("trained"):
                logger.debug(f"[ML Ensemble] Training skipped: {result.get('reason')}")
        if not self.is_trained:
            return Signal(symbol=symbol, direction=SignalDirection.NEUTRAL,
                          confidence=0, strategy=self.name, entry_price=0,
                          stop_loss=0, take_profit=0, reason="Model not trained yet")

        pred = self.predict(candles)
        price = candles[-1]["close"] if isinstance(candles[-1], dict) else candles[-1].close

        if pred["anomaly"]:
            return Signal(symbol=symbol, direction=SignalDirection.NEUTRAL,
                          confidence=0, strategy=self.name, entry_price=price,
                          stop_loss=0, take_profit=0, reason="Anomaly detected, skipping")
        if pred["confidence"] < self.config.confidence_threshold:
            return Signal(symbol=symbol, direction=SignalDirection.NEUTRAL,
                          confidence=int(pred["confidence"]), strategy=self.name,
                          entry_price=price, stop_loss=0, take_profit=0,
                          reason=f"Confidence {pred['confidence']:.1f} below threshold")
        return self._build_directional_signal(symbol, pred, price, candles)

    def _build_directional_signal(self, symbol: str, pred: dict, price: float, candles: list) -> Signal:
        """Build LONG/SHORT signal with ATR-based SL/TP."""
        highs = [c["high"] if isinstance(c, dict) else c.high for c in candles[-14:]]
        lows = [c["low"] if isinstance(c, dict) else c.low for c in candles[-14:]]
        closes = [c["close"] if isinstance(c, dict) else c.close for c in candles[-14:]]
        current_atr = FeatureEngineer._atr(np.array(highs), np.array(lows), np.array(closes), 14)
        confidence = int(pred["confidence"])
        regime = pred["regime"]

        if pred["direction"] > 0:
            return Signal(symbol=symbol, direction=SignalDirection.LONG,
                          confidence=confidence, strategy=self.name, entry_price=price,
                          stop_loss=price - 2 * current_atr, take_profit=price + 3 * current_atr,
                          reason=f"ML predict LONG (conf={pred['confidence']:.1f}, regime={regime})")
        return Signal(symbol=symbol, direction=SignalDirection.SHORT,
                      confidence=confidence, strategy=self.name, entry_price=price,
                      stop_loss=price + 2 * current_atr, take_profit=price - 3 * current_atr,
                      reason=f"ML predict SHORT (conf={pred['confidence']:.1f}, regime={regime})")

    def get_feature_importance(self) -> dict:
        return self.feature_importance
