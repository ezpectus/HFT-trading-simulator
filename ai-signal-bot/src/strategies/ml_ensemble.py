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


class FeatureEngineer:
    """Generate 50+ features from candle data."""

    @staticmethod
    def extract_features(candles: list[dict], window: int = 20) -> np.ndarray:
        """Extract features from candle data. Returns (n_samples, n_features) array."""
        if len(candles) < window + 5:
            return np.array([]).reshape(0, 0)

        closes = np.array([c["close"] if isinstance(c, dict) else c.close for c in candles])
        highs = np.array([c["high"] if isinstance(c, dict) else c.high for c in candles])
        lows = np.array([c["low"] if isinstance(c, dict) else c.low for c in candles])
        volumes = np.array([c["volume"] if isinstance(c, dict) else c.volume for c in candles])

        features = []
        for i in range(window, len(closes)):
            c = closes[i]
            h = highs[i]
            low = lows[i]
            v = volumes[i]
            w_closes = closes[i - window:i + 1]
            w_highs = highs[i - window:i + 1]
            w_lows = lows[i - window:i + 1]
            w_volumes = volumes[i - window:i + 1]

            feat = []

            # Price-based features (10)
            feat.extend([
                c,                                          # Close price
                (h - low) / max(c, 1e-8),                     # Range ratio
                (c - w_closes.mean()) / max(w_closes.std(), 1e-8),  # Z-score
                np.log(max(c / w_closes[0], 1e-8)),         # Log return over window
                (c - w_closes.min()) / max(w_closes.max() - w_closes.min(), 1e-8),  # Stochastic
                w_closes[-1] / w_closes[-5] - 1 if len(w_closes) >= 5 else 0,  # 5-bar return
                w_closes[-1] / w_closes[-10] - 1 if len(w_closes) >= 10 else 0,  # 10-bar return
                w_closes[-1] / w_closes[-20] - 1 if len(w_closes) >= 20 else 0,  # 20-bar return
                (h - c) / max(c, 1e-8),                     # Upper shadow
                (c - low) / max(c, 1e-8),                     # Lower shadow
            ])

            # Volume features (10)
            feat.extend([
                v,                                          # Volume
                v / max(w_volumes.mean(), 1e-8),            # Volume ratio
                (v - w_volumes.mean()) / max(w_volumes.std(), 1e-8),  # Volume z-score
                np.sum(w_volumes[-5:]) / max(np.sum(w_volumes), 1e-8),  # Recent volume fraction
                (w_volumes[-1] - w_volumes[0]) / max(w_volumes[0], 1e-8),  # Volume trend
                np.log(max(v, 1e-8)),                       # Log volume
                v * c,                                      # Notional
                np.sum(w_volumes * w_closes) / max(np.sum(w_volumes), 1e-8),  # VWAP
                (c - np.sum(w_volumes * w_closes) / max(np.sum(w_volumes), 1e-8)) / c,  # VWAP deviation
                np.std(w_volumes) / max(np.mean(w_volumes), 1e-8),  # Volume CV
            ])

            # Technical indicators (20)
            ema_fast = FeatureEngineer._ema(w_closes, min(5, len(w_closes)))
            ema_slow = FeatureEngineer._ema(w_closes, min(10, len(w_closes)))
            rsi_val = FeatureEngineer._rsi(w_closes, min(14, len(w_closes) - 1))
            feat.extend([
                ema_fast / max(ema_slow, 1e-8) - 1,         # EMA ratio
                ema_fast - c,                               # EMA fast deviation
                ema_slow - c,                               # EMA slow deviation
                rsi_val,                                    # RSI
                rsi_val - 50,                               # RSI centered
                FeatureEngineer._atr(w_highs, w_lows, w_closes, min(14, len(w_closes) - 1)),  # ATR
                FeatureEngineer._atr(w_highs, w_lows, w_closes, min(14, len(w_closes) - 1)) / max(c, 1e-8),  # ATR ratio
                FeatureEngineer._bollinger_pos(w_closes, min(20, len(w_closes))),  # Bollinger position
                np.mean(w_closes[-5:]) / c - 1,             # SMA5 deviation
                np.mean(w_closes[-10:]) / c - 1,            # SMA10 deviation
                np.mean(w_closes[-20:]) / c - 1 if len(w_closes) >= 20 else 0,  # SMA20 deviation
                (w_highs[-20:].max() - c) / c if len(w_closes) >= 20 else 0,  # Distance from 20-high
                (c - w_lows[-20:].min()) / c if len(w_closes) >= 20 else 0,  # Distance from 20-low
                FeatureEngineer._momentum(w_closes, min(10, len(w_closes) - 1)),  # Momentum
                FeatureEngineer._roc(w_closes, min(10, len(w_closes) - 1)),  # Rate of change
                np.std(np.diff(np.log(w_closes[-20:]))) if len(w_closes) >= 21 else 0,  # Volatility
                np.std(np.diff(np.log(w_closes[-5:]))) if len(w_closes) >= 6 else 0,  # Short vol
                FeatureEngineer._williams_r(w_highs, w_lows, c, min(14, len(w_closes))),  # Williams %R
                FeatureEngineer._cci(w_highs, w_lows, w_closes, min(20, len(w_closes))),  # CCI
                FeatureEngineer._mfi(w_highs, w_lows, w_closes, w_volumes, min(14, len(w_closes) - 1)),  # MFI
            ])

            # Cross-asset / microstructure features (10)
            feat.extend([
                np.sum(np.diff(w_closes) > 0) / max(len(w_closes) - 1, 1),  # Up ratio
                np.sum(np.diff(w_closes) < 0) / max(len(w_closes) - 1, 1),  # Down ratio
                np.max(np.abs(np.diff(np.log(w_closes[-10:])))) if len(w_closes) >= 11 else 0,  # Max return
                np.mean(np.abs(np.diff(np.log(w_closes[-10:])))) if len(w_closes) >= 11 else 0,  # Mean abs return
                np.sum(np.diff(w_volumes) > 0) / max(len(w_volumes) - 1, 1),  # Volume up ratio
                (w_closes[-1] - w_closes[0]) / max(np.sum(np.abs(np.diff(w_closes))), 1e-8),  # Efficiency ratio
                (lambda c: 0.0 if math.isnan(c) else c)(np.corrcoef(w_closes[-10:], w_volumes[-10:])[0, 1]) if len(w_closes) >= 10 else 0,  # Price-volume corr
                np.sum(w_volumes[-5:] * np.sign(np.diff(w_closes[-6:]))) / max(np.sum(w_volumes[-5:]), 1e-8),  # Volume-weighted direction
                FeatureEngineer._range_expansion(w_highs, w_lows, min(10, len(w_closes))),  # Range expansion
                FeatureEngineer._gap(w_closes, min(5, len(w_closes) - 1)),  # Gap
            ])

            features.append(feat)

        return np.array(features)

    @staticmethod
    def _ema(data: np.ndarray, period: int) -> float:
        if len(data) < period:
            return float(data[-1])
        k = 2.0 / (period + 1)
        ema_val = data[0]
        for v in data[1:]:
            ema_val = v * k + ema_val * (1 - k)
        return ema_val

    @staticmethod
    def _rsi(closes: np.ndarray, period: int) -> float:
        if len(closes) < period + 1:
            return 50.0
        diffs = np.diff(closes[-period - 1:])
        gains = np.where(diffs > 0, diffs, 0)
        losses = np.where(diffs < 0, -diffs, 0)
        avg_gain = gains.mean()
        avg_loss = losses.mean()
        if avg_loss < 1e-10:
            return 100.0
        rs = avg_gain / avg_loss
        return 100.0 - 100.0 / (1.0 + rs)

    @staticmethod
    def _atr(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, period: int) -> float:
        if len(closes) < period + 1:
            return float(highs[-1] - lows[-1])
        trs = []
        for i in range(1, len(closes)):
            tr = max(
                highs[i] - lows[i],
                abs(highs[i] - closes[i - 1]),
                abs(lows[i] - closes[i - 1])
            )
            trs.append(tr)
        return np.mean(trs[-period:])

    @staticmethod
    def _bollinger_pos(closes: np.ndarray, period: int) -> float:
        if len(closes) < period:
            return 0.5
        window = closes[-period:]
        mean = window.mean()
        std = window.std()
        if std < 1e-10:
            return 0.5
        return (closes[-1] - mean) / (2 * std)

    @staticmethod
    def _momentum(closes: np.ndarray, period: int) -> float:
        if len(closes) < period + 1:
            return 0.0
        return closes[-1] - closes[-period]

    @staticmethod
    def _roc(closes: np.ndarray, period: int) -> float:
        if len(closes) < period + 1 or closes[-period] < 1e-8:
            return 0.0
        return (closes[-1] / closes[-period] - 1) * 100

    @staticmethod
    def _williams_r(highs: np.ndarray, lows: np.ndarray, close: float, period: int) -> float:
        if len(highs) < period:
            return -50.0
        hh = highs[-period:].max()
        ll = lows[-period:].min()
        if hh - ll < 1e-10:
            return -50.0
        return (hh - close) / (hh - ll) * -100

    @staticmethod
    def _cci(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, period: int) -> float:
        if len(closes) < period:
            return 0.0
        tp = (highs[-period:] + lows[-period:] + closes[-period:]) / 3.0
        sma = tp.mean()
        mad = np.mean(np.abs(tp - sma))
        if mad < 1e-10:
            return 0.0
        return (tp[-1] - sma) / (0.015 * mad)

    @staticmethod
    def _mfi(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, volumes: np.ndarray, period: int) -> float:
        if len(closes) < period + 1:
            return 50.0
        tp = (highs[-period - 1:] + lows[-period - 1:] + closes[-period - 1:]) / 3.0
        mf = tp * volumes[-period - 1:]
        pos_mf = np.sum(mf[1:][np.diff(tp) > 0])
        neg_mf = np.sum(mf[1:][np.diff(tp) < 0])
        if neg_mf < 1e-10:
            return 100.0
        mfr = pos_mf / neg_mf
        return 100.0 - 100.0 / (1.0 + mfr)

    @staticmethod
    def _range_expansion(highs: np.ndarray, lows: np.ndarray, period: int) -> float:
        if len(highs) < period * 2:
            return 0.0
        recent_range = (highs[-period:].max() - lows[-period:].min())
        prev_range = (highs[-period * 2:-period].max() - lows[-period * 2:-period].min())
        if prev_range < 1e-10:
            return 0.0
        return recent_range / prev_range - 1

    @staticmethod
    def _gap(closes: np.ndarray, period: int) -> float:
        if len(closes) < period + 2:
            return 0.0
        return (closes[-1] - closes[-period - 1]) / max(closes[-period - 1], 1e-8)


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

    def update(self, ret: float) -> int:
        """Update with new return, return current regime index."""
        self._returns.append(ret)
        if len(self._returns) >= 100 and not self._fitted:
            self._fit()
        elif self._fitted and len(self._returns) % 50 == 0:
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

        # Extract features
        features = self.feature_engineer.extract_features(candles, self.config.feature_window)
        if len(features) < self.config.min_train_samples:
            return {"trained": False, "reason": "Not enough feature samples"}

        closes = np.array([c["close"] if isinstance(c, dict) else c.close for c in candles])
        labels = self._prepare_labels(closes[self.config.feature_window:], self.config.prediction_horizon)

        # Align features and labels
        min_len = min(len(features), len(labels))
        X = features[:min_len]
        y = labels[:min_len]

        if len(X) < self.config.min_train_samples or len(np.unique(y)) < 2:
            return {"trained": False, "reason": "Insufficient samples or single class"}

        # Scale features
        X_scaled = self.scaler.fit_transform(X)

        # Train anomaly detector
        self.anomaly_detector.fit(X_scaled)

        # Filter anomalies
        is_normal = self.anomaly_detector.predict(X_scaled) == 1
        X_clean = X_scaled[is_normal]
        y_clean = y[is_normal]

        if len(X_clean) < 50 or len(np.unique(y_clean)) < 2:
            X_clean, y_clean = X_scaled, y

        # Train classifier
        self.model.fit(X_clean, y_clean)
        self.is_trained = True
        self.train_count += 1

        # Extract feature importance
        if hasattr(self.model, "feature_importances_"):
            self.feature_importance = {
                f"feature_{i}": float(imp)
                for i, imp in enumerate(self.model.feature_importances_)
            }

        # Train HMM on returns
        safe_closes = np.maximum(closes, 1e-8)
        returns = np.diff(np.log(safe_closes))
        for r in returns:
            self.hmm.update(r)

        logger.info(f"[ML Ensemble] Model trained: {len(X_clean)} samples, {X.shape[1]} features")
        return {
            "trained": True, "samples": len(X_clean), "features": X.shape[1],
            "train_count": self.train_count,
        }

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

        # Retrain periodically
        if self.step_count % self.config.train_interval == 0 and len(candles) >= self.config.min_train_samples:
            result = self.train(candles)
            if not result.get("trained"):
                logger.debug(f"[ML Ensemble] Training skipped: {result.get('reason')}")

        if not self.is_trained:
            return Signal(
                symbol=symbol, direction=SignalDirection.NEUTRAL,
                confidence=0, strategy=self.name, entry_price=0,
                stop_loss=0, take_profit=0, reason="Model not trained yet",
            )

        pred = self.predict(candles)
        price = candles[-1]["close"] if isinstance(candles[-1], dict) else candles[-1].close

        if pred["anomaly"]:
            return Signal(
                symbol=symbol, direction=SignalDirection.NEUTRAL,
                confidence=0, strategy=self.name, entry_price=price,
                stop_loss=0, take_profit=0, reason="Anomaly detected, skipping",
            )

        confidence = pred["confidence"]
        if confidence < self.config.confidence_threshold:
            return Signal(
                symbol=symbol, direction=SignalDirection.NEUTRAL,
                confidence=int(confidence), strategy=self.name, entry_price=price,
                stop_loss=0, take_profit=0,
                reason=f"Confidence {confidence:.1f} below threshold",
            )

        # ATR for SL/TP
        highs = [c["high"] if isinstance(c, dict) else c.high for c in candles[-14:]]
        lows = [c["low"] if isinstance(c, dict) else c.low for c in candles[-14:]]
        closes = [c["close"] if isinstance(c, dict) else c.close for c in candles[-14:]]
        current_atr = FeatureEngineer._atr(np.array(highs), np.array(lows), np.array(closes), 14)

        if pred["direction"] > 0:
            return Signal(
                symbol=symbol, direction=SignalDirection.LONG,
                confidence=int(confidence), strategy=self.name,
                entry_price=price, stop_loss=price - 2 * current_atr,
                take_profit=price + 3 * current_atr,
                reason=f"ML predict LONG (conf={confidence:.1f}, regime={pred['regime']})",
            )
        else:
            return Signal(
                symbol=symbol, direction=SignalDirection.SHORT,
                confidence=int(confidence), strategy=self.name,
                entry_price=price, stop_loss=price + 2 * current_atr,
                take_profit=price - 3 * current_atr,
                reason=f"ML predict SHORT (conf={confidence:.1f}, regime={pred['regime']})",
            )

    def get_feature_importance(self) -> dict:
        return self.feature_importance
