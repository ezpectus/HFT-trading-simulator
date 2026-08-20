"""Feature engineering for ML ensemble strategy — 50+ features from candle data.

Extracted from ml_ensemble.py for file-size compliance.
"""

from __future__ import annotations

import math

import numpy as np


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
            w_closes = closes[i - window:i + 1]
            w_highs = highs[i - window:i + 1]
            w_lows = lows[i - window:i + 1]
            w_volumes = volumes[i - window:i + 1]

            feat = []
            feat.extend(FeatureEngineer._price_features(closes[i], highs[i], lows[i], w_closes))
            feat.extend(FeatureEngineer._volume_features(volumes[i], w_volumes, w_closes))
            feat.extend(FeatureEngineer._technical_features(w_highs, w_lows, w_closes, closes[i], w_volumes))
            feat.extend(FeatureEngineer._microstructure_features(w_closes, w_volumes, w_highs, w_lows))
            features.append(feat)

        return np.array(features)

    @staticmethod
    def _price_features(c: float, h: float, low: float, w_closes: np.ndarray) -> list:
        """Extract 10 price-based features."""
        return [
            c,
            (h - low) / max(c, 1e-8),
            (c - w_closes.mean()) / max(w_closes.std(), 1e-8),
            np.log(max(c / w_closes[0], 1e-8)),
            (c - w_closes.min()) / max(w_closes.max() - w_closes.min(), 1e-8),
            w_closes[-1] / w_closes[-5] - 1 if len(w_closes) >= 5 else 0,
            w_closes[-1] / w_closes[-10] - 1 if len(w_closes) >= 10 else 0,
            w_closes[-1] / w_closes[-20] - 1 if len(w_closes) >= 20 else 0,
            (h - c) / max(c, 1e-8),
            (c - low) / max(c, 1e-8),
        ]

    @staticmethod
    def _volume_features(v: float, w_volumes: np.ndarray, w_closes: np.ndarray) -> list:
        """Extract 10 volume-based features."""
        vwap = np.sum(w_volumes * w_closes) / max(np.sum(w_volumes), 1e-8)
        return [
            v,
            v / max(w_volumes.mean(), 1e-8),
            (v - w_volumes.mean()) / max(w_volumes.std(), 1e-8),
            np.sum(w_volumes[-5:]) / max(np.sum(w_volumes), 1e-8),
            (w_volumes[-1] - w_volumes[0]) / max(w_volumes[0], 1e-8),
            np.log(max(v, 1e-8)),
            v * w_closes[-1],
            vwap,
            (w_closes[-1] - vwap) / w_closes[-1],
            np.std(w_volumes) / max(np.mean(w_volumes), 1e-8),
        ]

    @staticmethod
    def _technical_features(w_highs: np.ndarray, w_lows: np.ndarray, w_closes: np.ndarray, c: float, w_volumes: np.ndarray = None) -> list:
        """Extract 20 technical indicator features."""
        if w_volumes is None:
            w_volumes = w_closes
        ema_fast = FeatureEngineer._ema(w_closes, min(5, len(w_closes)))
        ema_slow = FeatureEngineer._ema(w_closes, min(10, len(w_closes)))
        rsi_val = FeatureEngineer._rsi(w_closes, min(14, len(w_closes) - 1))
        atr_val = FeatureEngineer._atr(w_highs, w_lows, w_closes, min(14, len(w_closes) - 1))
        return [
            ema_fast / max(ema_slow, 1e-8) - 1,
            ema_fast - c,
            ema_slow - c,
            rsi_val,
            rsi_val - 50,
            atr_val,
            atr_val / max(c, 1e-8),
            FeatureEngineer._bollinger_pos(w_closes, min(20, len(w_closes))),
            np.mean(w_closes[-5:]) / c - 1,
            np.mean(w_closes[-10:]) / c - 1,
            np.mean(w_closes[-20:]) / c - 1 if len(w_closes) >= 20 else 0,
            (w_highs[-20:].max() - c) / c if len(w_closes) >= 20 else 0,
            (c - w_lows[-20:].min()) / c if len(w_closes) >= 20 else 0,
            FeatureEngineer._momentum(w_closes, min(10, len(w_closes) - 1)),
            FeatureEngineer._roc(w_closes, min(10, len(w_closes) - 1)),
            np.std(np.diff(np.log(w_closes[-20:]))) if len(w_closes) >= 21 else 0,
            np.std(np.diff(np.log(w_closes[-5:]))) if len(w_closes) >= 6 else 0,
            FeatureEngineer._williams_r(w_highs, w_lows, c, min(14, len(w_closes))),
            FeatureEngineer._cci(w_highs, w_lows, w_closes, min(20, len(w_closes))),
            FeatureEngineer._mfi(w_highs, w_lows, w_closes, w_volumes, min(14, len(w_closes) - 1)),
        ]

    @staticmethod
    def _microstructure_features(w_closes: np.ndarray, w_volumes: np.ndarray, w_highs: np.ndarray, w_lows: np.ndarray) -> list:
        """Extract 10 cross-asset / microstructure features."""
        corr = np.corrcoef(w_closes[-10:], w_volumes[-10:])[0, 1] if len(w_closes) >= 10 else 0
        return [
            np.sum(np.diff(w_closes) > 0) / max(len(w_closes) - 1, 1),
            np.sum(np.diff(w_closes) < 0) / max(len(w_closes) - 1, 1),
            np.max(np.abs(np.diff(np.log(w_closes[-10:])))) if len(w_closes) >= 11 else 0,
            np.mean(np.abs(np.diff(np.log(w_closes[-10:])))) if len(w_closes) >= 11 else 0,
            np.sum(np.diff(w_volumes) > 0) / max(len(w_volumes) - 1, 1),
            (w_closes[-1] - w_closes[0]) / max(np.sum(np.abs(np.diff(w_closes))), 1e-8),
            0.0 if math.isnan(corr) else corr,
            np.sum(w_volumes[-5:] * np.sign(np.diff(w_closes[-6:]))) / max(np.sum(w_volumes[-5:]), 1e-8),
            FeatureEngineer._range_expansion(w_highs, w_lows, min(10, len(w_closes))),
            FeatureEngineer._gap(w_closes, min(5, len(w_closes) - 1)),
        ]

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
