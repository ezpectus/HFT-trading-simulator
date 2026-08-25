"""Tests for ML feature store."""
import pytest
from src.ml.feature_store import FeatureStore


class TestFeatureStore:
    def test_creation_without_redis(self):
        fs = FeatureStore(redis_host=None)
        assert fs is not None

    def test_update_and_get_features(self):
        fs = FeatureStore(redis_host=None)
        fs.update_features("BTC/USDT", {"rsi_14": 65.3, "ema_fast": 65100.5})
        features = fs.get_features("BTC/USDT", ["rsi_14"])
        assert features is not None
