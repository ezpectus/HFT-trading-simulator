"""Tests for model registry."""
import tempfile
import pytest
from src.ml.model_registry import ModelRegistry


class TestModelRegistry:
    def test_creation(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            registry = ModelRegistry(storage_dir=tmpdir)
            assert registry is not None

    def test_register_and_get_model(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            registry = ModelRegistry(storage_dir=tmpdir)
            registry.register(
                name="lstm_btc",
                version="1.0.0",
                path="models/lstm_btc_v1.onnx",
                metrics={"accuracy": 0.62},
                metadata={"lookback": 60},
            )
            model = registry.get_production_model("lstm_btc")
            assert model is not None
            assert model.version == "1.0.0"
