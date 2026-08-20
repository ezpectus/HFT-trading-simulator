"""Tests for SVM signal implementation."""
import pytest

from src.ml.svm_signal import (
    SVMResult,
    extract_svm_features,
    linear_svm,
    predict,
    standardize,
)


class TestLinearSVM:
    def test_empty_data_returns_empty(self):
        result = linear_svm([], [], seed=42)
        assert result.weights == []
        assert result.accuracy == 0.0

    def test_linearly_separable_data(self):
        """Data that is clearly separable should achieve high accuracy."""
        X = [[0.0, 0.0], [0.1, 0.1], [0.0, 0.1], [10.0, 10.0], [10.1, 10.0], [9.9, 10.1]]
        y = [-1, -1, -1, 1, 1, 1]
        result = linear_svm(X, y, C=1.0, epochs=100, seed=42)
        assert result.accuracy > 0.8

    def test_deterministic_with_seed(self):
        X = [[0.0, 0.0], [1.0, 1.0], [5.0, 5.0], [6.0, 6.0]]
        y = [-1, -1, 1, 1]
        r1 = linear_svm(X, y, seed=42)
        r2 = linear_svm(X, y, seed=42)
        assert r1.weights == r2.weights
        assert r1.bias == r2.bias

    def test_predictions_length_matches_input(self):
        X = [[0.0], [1.0], [2.0], [3.0]]
        y = [-1, -1, 1, 1]
        result = linear_svm(X, y, seed=42)
        assert len(result.predictions) == 4

    def test_predictions_are_plus_minus_one(self):
        X = [[0.0], [1.0], [2.0], [3.0]]
        y = [-1, -1, 1, 1]
        result = linear_svm(X, y, seed=42)
        assert all(p in (-1, 1) for p in result.predictions)

    def test_accuracy_between_zero_and_one(self):
        X = [[0.0], [1.0], [2.0], [3.0]]
        y = [-1, -1, 1, 1]
        result = linear_svm(X, y, seed=42)
        assert 0.0 <= result.accuracy <= 1.0

    def test_result_type(self):
        result = linear_svm([[1.0]], [1], seed=42)
        assert isinstance(result, SVMResult)

    def test_weights_dimension_matches_features(self):
        X = [[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]]
        y = [-1, 1]
        result = linear_svm(X, y, seed=42)
        assert len(result.weights) == 3


class TestPredict:
    def test_predict_positive(self):
        model = SVMResult(weights=[1.0, 1.0], bias=10.0, accuracy=1.0, predictions=[1])
        assert predict(model, [1.0, 1.0]) == 1

    def test_predict_negative(self):
        model = SVMResult(weights=[1.0, 1.0], bias=-10.0, accuracy=1.0, predictions=[-1])
        assert predict(model, [1.0, 1.0]) == -1


class TestStandardize:
    def test_empty_returns_empty(self):
        data, means, stds = standardize([])
        assert data == []
        assert means == []

    def test_mean_zero_std_one(self):
        data = [[1.0, 10.0], [2.0, 20.0], [3.0, 30.0]]
        standardized, means, stds = standardize(data)
        assert means[0] == pytest.approx(2.0)
        assert means[1] == pytest.approx(20.0)
        # Standardized values should have zero mean
        col0_mean = sum(row[0] for row in standardized) / len(standardized)
        assert col0_mean == pytest.approx(0.0, abs=1e-10)

    def test_constant_column_returns_zeros(self):
        data = [[5.0, 1.0], [5.0, 2.0], [5.0, 3.0]]
        standardized, _, _ = standardize(data)
        assert all(row[0] == 0.0 for row in standardized)


class TestExtractSVMFeatures:
    def test_empty_returns_empty(self):
        features, labels = extract_svm_features([])
        assert features == []
        assert labels == []

    def test_short_returns_empty(self):
        features, labels = extract_svm_features([0.01, 0.02, 0.03], window_size=20)
        assert features == []
        assert labels == []

    def test_correct_feature_dimension(self):
        returns = [0.01 * (i % 10 - 5) for i in range(50)]
        features, labels = extract_svm_features(returns, window_size=20)
        assert all(len(f) == 8 for f in features)

    def test_labels_are_plus_minus_one(self):
        returns = [0.01 * (i % 10 - 5) for i in range(50)]
        _, labels = extract_svm_features(returns, window_size=20)
        assert all(l in (-1, 1) for l in labels)

    def test_features_and_labels_same_length(self):
        returns = [0.01 * (i % 10 - 5) for i in range(50)]
        features, labels = extract_svm_features(returns, window_size=20)
        assert len(features) == len(labels)
