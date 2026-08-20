"""Unit tests for strategies/ml_features.py — FeatureEngineer 50+ feature extraction."""

import numpy as np
import pytest

from src.strategies.ml_features import FeatureEngineer


# ─── Fixtures ───


def _make_candles(n: int = 30) -> list[dict]:
    """Generate deterministic candle data."""
    rng = np.random.default_rng(42)
    candles = []
    price = 50000.0
    for i in range(n):
        change = rng.normal(0, 0.01)
        o = price
        c = price * (1 + change)
        h = max(o, c) * (1 + abs(rng.normal(0, 0.002)))
        low = min(o, c) * (1 - abs(rng.normal(0, 0.002)))
        vol = rng.uniform(100, 1000)
        candles.append({"open": o, "high": h, "low": low, "close": c, "volume": vol})
        price = c
    return candles


@pytest.fixture
def candles() -> list[dict]:
    return _make_candles(30)


# ─── extract_features ───


def test_extract_features_returns_2d_array(candles: list[dict]) -> None:
    """extract_features should return 2D numpy array."""
    features = FeatureEngineer.extract_features(candles, window=20)
    assert features.ndim == 2
    assert features.shape[0] == len(candles) - 20
    assert features.shape[1] >= 50


def test_extract_features_insufficient_data() -> None:
    """Insufficient candles should return empty (0,0) array."""
    features = FeatureEngineer.extract_features(_make_candles(10), window=20)
    assert features.shape == (0, 0)


def test_extract_features_no_nan(candles: list[dict]) -> None:
    """Features should not contain NaN values."""
    features = FeatureEngineer.extract_features(candles, window=20)
    assert not np.any(np.isnan(features))


def test_extract_features_no_inf(candles: list[dict]) -> None:
    """Features should not contain Inf values."""
    features = FeatureEngineer.extract_features(candles, window=20)
    assert not np.any(np.isinf(features))


# ─── Price Features ───


def test_price_features_returns_10_values() -> None:
    """_price_features should return 10 values."""
    closes = np.array([50000, 50100, 50200, 50150, 50180])
    result = FeatureEngineer._price_features(50180, 50300, 50050, closes)
    assert len(result) == 10


# ─── Volume Features ───


def test_volume_features_returns_10_values() -> None:
    """_volume_features should return 10 values."""
    closes = np.array([50000, 50100, 50200, 50150, 50180])
    volumes = np.array([100, 200, 150, 300, 250])
    result = FeatureEngineer._volume_features(250, volumes, closes)
    assert len(result) == 10


# ─── Technical Features ───


def test_technical_features_returns_20_values() -> None:
    """_technical_features should return 20 values."""
    closes = np.linspace(50000, 51000, 25)
    highs = closes * 1.01
    lows = closes * 0.99
    result = FeatureEngineer._technical_features(highs, lows, closes, closes[-1])
    assert len(result) == 20


# ─── Microstructure Features ───


def test_microstructure_features_returns_10_values() -> None:
    """_microstructure_features should return 10 values."""
    closes = np.linspace(50000, 51000, 25)
    volumes = np.linspace(100, 300, 25)
    highs = closes * 1.01
    lows = closes * 0.99
    result = FeatureEngineer._microstructure_features(closes, volumes, highs, lows)
    assert len(result) == 10


# ─── Helper Indicators ───


def test_ema_returns_float() -> None:
    """_ema should return a float."""
    data = np.array([100, 101, 102, 103, 104])
    result = FeatureEngineer._ema(data, 5)
    assert isinstance(result, float)
    assert result > 0


def test_rsi_range_0_to_100() -> None:
    """_rsi should return value in [0, 100]."""
    closes = np.array([100, 102, 101, 103, 105, 104, 106, 108, 107, 109, 111])
    result = FeatureEngineer._rsi(closes, 10)
    assert 0 <= result <= 100


def test_rsi_all_gains_returns_100() -> None:
    """_rsi with all gains should return 100."""
    closes = np.array([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110])
    result = FeatureEngineer._rsi(closes, 10)
    assert result == 100.0


def test_atr_positive() -> None:
    """_atr should return a positive value."""
    highs = np.array([105, 106, 107, 108, 109])
    lows = np.array([100, 101, 102, 103, 104])
    closes = np.array([102, 103, 104, 105, 106])
    result = FeatureEngineer._atr(highs, lows, closes, 4)
    assert result > 0


def test_bollinger_pos_range() -> None:
    """_bollinger_pos should return a finite value."""
    closes = np.array([100, 101, 102, 103, 104, 105, 106, 107, 108, 109])
    result = FeatureEngineer._bollinger_pos(closes, 10)
    assert np.isfinite(result)


def test_momentum_returns_difference() -> None:
    """_momentum should return close[-1] - close[-period]."""
    closes = np.array([100, 101, 102, 103, 110])
    result = FeatureEngineer._momentum(closes, 4)
    assert result == pytest.approx(10.0)


def test_roc_returns_percentage() -> None:
    """_roc should return percentage change."""
    closes = np.array([100, 101, 102, 103, 110])
    result = FeatureEngineer._roc(closes, 4)
    assert result == pytest.approx(10.0, rel=1e-4)


def test_williams_r_range() -> None:
    """_williams_r should return value in [-100, 0]."""
    highs = np.array([105, 106, 107, 108, 109])
    lows = np.array([100, 101, 102, 103, 104])
    result = FeatureEngineer._williams_r(highs, lows, 105, 5)
    assert -100 <= result <= 0


def test_cci_returns_float() -> None:
    """_cci should return a finite float."""
    highs = np.array([105, 106, 107, 108, 109] * 4)
    lows = np.array([100, 101, 102, 103, 104] * 4)
    closes = np.array([102, 103, 104, 105, 106] * 4)
    result = FeatureEngineer._cci(highs, lows, closes, 20)
    assert np.isfinite(result)


def test_mfi_range_0_to_100() -> None:
    """_mfi should return value in [0, 100]."""
    highs = np.array([105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115])
    lows = np.array([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110])
    closes = np.array([102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112])
    volumes = np.array([100, 200, 150, 300, 250, 180, 220, 310, 280, 190, 240])
    result = FeatureEngineer._mfi(highs, lows, closes, volumes, 10)
    assert 0 <= result <= 100


def test_range_expansion_returns_float() -> None:
    """_range_expansion should return a finite float."""
    highs = np.array([105, 106, 107, 108, 109, 110, 111, 112, 113, 114])
    lows = np.array([100, 101, 102, 103, 104, 105, 106, 107, 108, 109])
    result = FeatureEngineer._range_expansion(highs, lows, 5)
    assert np.isfinite(result)


def test_gap_returns_float() -> None:
    """_gap should return a finite float."""
    closes = np.array([100, 101, 102, 103, 104, 105, 110])
    result = FeatureEngineer._gap(closes, 5)
    assert np.isfinite(result)
