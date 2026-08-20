"""Tests for ml/ modules — model_registry, automl, feature_store."""
import json
import os
import tempfile
import time

import pytest

from src.ml.model_registry import ABTest, ModelRegistry, ModelStatus, ModelVersion
from src.ml.automl import AutoMLConfig, AutoMLOptimizer
from src.ml.feature_store import FeatureStore


# ─── Model Registry ───


@pytest.fixture
def registry():
    with tempfile.TemporaryDirectory() as tmpdir:
        r = ModelRegistry(storage_dir=tmpdir)
        yield r


class TestModelStatus:
    def test_values(self):
        assert ModelStatus.CANDIDATE.value == "candidate"
        assert ModelStatus.STAGING.value == "staging"
        assert ModelStatus.PRODUCTION.value == "production"
        assert ModelStatus.ARCHIVED.value == "archived"
        assert ModelStatus.ROLLED_BACK.value == "rolled_back"


class TestModelVersion:
    def test_defaults(self):
        mv = ModelVersion(name="test", version="1.0.0", path="/models/test.onnx")
        assert mv.status == ModelStatus.CANDIDATE
        assert mv.metrics == {}
        assert mv.metadata == {}
        assert mv.registered_at > 0
        assert mv.promoted_at is None
        assert mv.ab_impressions == 0
        assert mv.ab_successes == 0


class TestABTest:
    def test_defaults(self):
        ab = ABTest("model", "1.0.0", "1.1.0", 0.5)
        assert ab.model_name == "model"
        assert ab.control_version == "1.0.0"
        assert ab.treatment_version == "1.1.0"
        assert ab.traffic_split == 0.5
        assert ab.active is True
        assert ab.started_at > 0


class TestModelRegistry:
    def test_empty(self, registry):
        assert len(registry.models) == 0

    def test_register(self, registry):
        mv = registry.register("lstm_btc", "1.0.0", "/models/lstm.onnx", metrics={"accuracy": 0.9})
        assert mv.name == "lstm_btc"
        assert mv.version == "1.0.0"
        assert mv.metrics["accuracy"] == 0.9
        assert mv.status == ModelStatus.CANDIDATE

    def test_get(self, registry):
        registry.register("lstm_btc", "1.0.0", "/models/lstm.onnx")
        mv = registry.get("lstm_btc", "1.0.0")
        assert mv is not None
        assert mv.version == "1.0.0"

    def test_get_nonexistent(self, registry):
        assert registry.get("nonexistent", "0.0.0") is None

    def test_get_production_model_none(self, registry):
        assert registry.get_production_model("test") is None

    def test_promote_to_production(self, registry):
        registry.register("lstm_btc", "1.0.0", "/models/lstm.onnx")
        result = registry.promote("lstm_btc", "1.0.0", ModelStatus.PRODUCTION)
        assert result is True
        prod = registry.get_production_model("lstm_btc")
        assert prod is not None
        assert prod.version == "1.0.0"

    def test_promote_demotes_previous(self, registry):
        registry.register("lstm_btc", "1.0.0", "/models/lstm_v1.onnx")
        registry.promote("lstm_btc", "1.0.0", ModelStatus.PRODUCTION)
        registry.register("lstm_btc", "2.0.0", "/models/lstm_v2.onnx")
        registry.promote("lstm_btc", "2.0.0", ModelStatus.PRODUCTION)
        prod = registry.get_production_model("lstm_btc")
        assert prod.version == "2.0.0"
        old = registry.get("lstm_btc", "1.0.0")
        assert old.status == ModelStatus.ARCHIVED

    def test_promote_nonexistent(self, registry):
        result = registry.promote("nonexistent", "1.0.0", ModelStatus.STAGING)
        assert result is False

    def test_rollback(self, registry):
        registry.register("lstm_btc", "1.0.0", "/models/lstm_v1.onnx")
        registry.promote("lstm_btc", "1.0.0", ModelStatus.PRODUCTION)
        registry.register("lstm_btc", "2.0.0", "/models/lstm_v2.onnx")
        registry.promote("lstm_btc", "2.0.0", ModelStatus.PRODUCTION)
        prev = registry.rollback("lstm_btc")
        assert prev is not None
        assert prev.version == "1.0.0"
        assert prev.status == ModelStatus.PRODUCTION

    def test_rollback_no_archived(self, registry):
        registry.register("lstm_btc", "1.0.0", "/models/lstm.onnx")
        result = registry.rollback("lstm_btc")
        assert result is None

    def test_list_versions(self, registry):
        registry.register("lstm_btc", "1.0.0", "/models/lstm_v1.onnx")
        registry.register("lstm_btc", "2.0.0", "/models/lstm_v2.onnx")
        versions = registry.list_versions("lstm_btc")
        assert len(versions) == 2

    def test_list_versions_empty(self, registry):
        assert registry.list_versions("nonexistent") == []

    def test_set_ab_test(self, registry):
        registry.register("lstm_btc", "1.0.0", "/models/lstm_v1.onnx")
        registry.register("lstm_btc", "2.0.0", "/models/lstm_v2.onnx")
        ab = registry.set_ab_test("lstm_btc", "1.0.0", "2.0.0", 0.3)
        assert ab.control_version == "1.0.0"
        assert ab.treatment_version == "2.0.0"
        assert ab.traffic_split == 0.3

    def test_set_ab_test_missing_version(self, registry):
        registry.register("lstm_btc", "1.0.0", "/models/lstm_v1.onnx")
        with pytest.raises(ValueError):
            registry.set_ab_test("lstm_btc", "1.0.0", "9.0.0")

    def test_persistence(self, registry):
        registry.register("lstm_btc", "1.0.0", "/models/lstm.onnx", metrics={"acc": 0.9})
        registry.promote("lstm_btc", "1.0.0", ModelStatus.PRODUCTION)
        storage_dir = registry.storage_dir

        r2 = ModelRegistry(storage_dir=storage_dir)
        mv = r2.get("lstm_btc", "1.0.0")
        assert mv is not None
        assert mv.metrics["acc"] == 0.9
        prod = r2.get_production_model("lstm_btc")
        assert prod is not None
        assert prod.version == "1.0.0"


# ─── AutoML ───


class TestAutoMLConfig:
    def test_defaults(self):
        cfg = AutoMLConfig()
        assert cfg.n_trials == 100
        assert cfg.timeout == 3600
        assert cfg.n_startup_trials == 10
        assert cfg.study_name == "hft_automl"

    def test_custom(self):
        cfg = AutoMLConfig(n_trials=50, timeout=600, study_name="test")
        assert cfg.n_trials == 50
        assert cfg.timeout == 600
        assert cfg.study_name == "test"


class TestAutoMLOptimizer:
    def test_init_defaults(self):
        opt = AutoMLOptimizer()
        assert opt.config.n_trials == 100
        assert opt.strategy == "trend_following"
        assert opt.best_params is None
        assert opt.best_value == float("-inf")
        assert opt.study is None

    def test_init_custom(self):
        cfg = AutoMLConfig(n_trials=10)
        opt = AutoMLOptimizer(config=cfg, strategy="mean_reversion")
        assert opt.config.n_trials == 10
        assert opt.strategy == "mean_reversion"

    def test_optimize_no_optuna(self):
        opt = AutoMLOptimizer()
        result = opt.optimize()
        # If optuna not available, returns empty dict
        # If available, this would run a real optimization
        assert isinstance(result, dict)

    def test_get_param_importances_no_study(self):
        opt = AutoMLOptimizer()
        assert opt.get_param_importances() == {}

    def test_get_trials_dataframe_no_study(self):
        opt = AutoMLOptimizer()
        assert opt.get_trials_dataframe() is None

    def test_save_best_params_none(self, tmp_path):
        opt = AutoMLOptimizer()
        path = str(tmp_path / "params.json")
        opt.save_best_params(path)
        # No best params, file should not be created
        assert not os.path.exists(path)


# ─── Feature Store ───


@pytest.fixture
def fs():
    return FeatureStore()  # Will use in-memory fallback (no Redis in tests)


class TestFeatureStore:
    def test_in_memory_fallback(self, fs):
        assert fs._redis is None
        assert hasattr(fs, "_memory")

    def test_update_features(self, fs):
        count = fs.update_features("BTC/USDT", {"rsi_14": 65.3, "ema_fast": 65100.0})
        assert count == 2

    def test_get_features(self, fs):
        fs.update_features("BTC/USDT", {"rsi_14": 65.3, "ema_fast": 65100.0})
        features = fs.get_features("BTC/USDT", ["rsi_14"])
        assert features["rsi_14"] == 65.3

    def test_get_features_all(self, fs):
        fs.update_features("BTC/USDT", {"rsi_14": 65.3, "ema_fast": 65100.0})
        features = fs.get_features("BTC/USDT")
        assert "rsi_14" in features
        assert "ema_fast" in features

    def test_get_features_empty(self, fs):
        features = fs.get_features("NONEXIST", ["rsi_14"])
        assert features == {}

    def test_get_features_batch(self, fs):
        fs.update_features("BTC/USDT", {"rsi_14": 65.3})
        fs.update_features("ETH/USDT", {"rsi_14": 45.2})
        batch = fs.get_features_batch(["BTC/USDT", "ETH/USDT"], ["rsi_14"])
        assert batch["BTC/USDT"]["rsi_14"] == 65.3
        assert batch["ETH/USDT"]["rsi_14"] == 45.2

    def test_get_feature_vector(self, fs):
        fs.update_features("BTC/USDT", {"rsi_14": 65.3, "ema_fast": 65100.0})
        vec = fs.get_feature_vector("BTC/USDT", ["rsi_14", "ema_fast", "missing"])
        assert vec[0] == 65.3
        assert vec[1] == 65100.0
        assert vec[2] == 0.0  # fill_missing default

    def test_get_feature_matrix(self, fs):
        fs.update_features("BTC/USDT", {"rsi_14": 65.3})
        fs.update_features("ETH/USDT", {"rsi_14": 45.2})
        matrix = fs.get_feature_matrix(["BTC/USDT", "ETH/USDT"], ["rsi_14"])
        assert len(matrix) == 2
        assert matrix[0][0] == 65.3
        assert matrix[1][0] == 45.2

    def test_list_features(self, fs):
        fs.update_features("BTC/USDT", {"rsi_14": 65.3, "ema_fast": 65100.0})
        features = fs.list_features()
        assert "rsi_14" in features
        assert "ema_fast" in features

    def test_list_symbols(self, fs):
        fs.update_features("BTC/USDT", {"rsi_14": 65.3})
        fs.update_features("ETH/USDT", {"rsi_14": 45.2})
        symbols = fs.list_symbols()
        assert "BTC/USDT" in symbols
        assert "ETH/USDT" in symbols

    def test_delete_features(self, fs):
        fs.update_features("BTC/USDT", {"rsi_14": 65.3})
        result = fs.delete_features("BTC/USDT")
        assert result is True
        assert fs.get_features("BTC/USDT") == {}

    def test_delete_features_nonexistent(self, fs):
        result = fs.delete_features("NONEXIST")
        assert result is False

    def test_get_feature_age(self, fs):
        fs.update_features("BTC/USDT", {"rsi_14": 65.3})
        age = fs.get_feature_age("BTC/USDT", "rsi_14")
        assert age is not None
        assert age >= 0.0

    def test_get_feature_age_nonexistent(self, fs):
        age = fs.get_feature_age("NONEXIST", "rsi_14")
        assert age is None

    def test_is_healthy(self, fs):
        assert fs.is_healthy() is True  # in-memory always works
