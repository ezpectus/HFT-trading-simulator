"""Tests for price predictor."""
import numpy as np
import pytest
from src.ml.price_predictor import PricePredictor


class TestPricePredictor:
    def test_creation_without_torch(self):
        predictor = PricePredictor(model_type="lstm", lookback=60)
        assert predictor is not None

    def test_predict_returns_array(self):
        predictor = PricePredictor(model_type="lstm", lookback=10)
        candles = np.random.randn(10, 5).tolist()
        result = predictor.predict(candles)
        assert result is not None
