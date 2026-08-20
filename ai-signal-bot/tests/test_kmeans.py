"""Tests for K-Means clustering implementation."""
import pytest

from src.technical_analysis.kmeans import (
    KMeansResult,
    extract_features,
    kmeans,
)


class TestKMeans:
    def test_empty_data_returns_empty(self):
        result = kmeans([], k=3)
        assert result.labels == []
        assert result.centroids == []
        assert result.wcss == 0.0

    def test_k_zero_returns_empty(self):
        result = kmeans([[1, 2], [3, 4]], k=0)
        assert result.labels == []

    def test_fewer_points_than_k_returns_all_points(self):
        data = [[1.0, 2.0], [3.0, 4.0]]
        result = kmeans(data, k=5)
        assert len(result.labels) == 2
        assert len(result.centroids) == 2

    def test_two_well_separated_clusters(self):
        cluster_a = [[0.0, 0.0], [0.1, 0.1], [0.0, 0.1], [0.1, 0.0]]
        cluster_b = [[10.0, 10.0], [10.1, 10.1], [10.0, 10.1], [10.1, 10.0]]
        data = cluster_a + cluster_b
        result = kmeans(data, k=2, seed=42)
        assert len(result.labels) == 8
        # First 4 should be same cluster, last 4 same cluster
        assert len(set(result.labels[:4])) == 1
        assert len(set(result.labels[4:])) == 1
        assert result.labels[0] != result.labels[4]

    def test_wcss_is_non_negative(self):
        data = [[1.0], [2.0], [3.0], [10.0], [11.0], [12.0]]
        result = kmeans(data, k=2, seed=42)
        assert result.wcss >= 0.0

    def test_wcss_zero_for_identical_points(self):
        data = [[5.0, 5.0]] * 10
        result = kmeans(data, k=2, seed=42)
        assert result.wcss == pytest.approx(0.0, abs=1e-10)

    def test_deterministic_with_seed(self):
        data = [[1.0], [2.0], [10.0], [11.0], [20.0], [21.0]]
        r1 = kmeans(data, k=3, seed=42)
        r2 = kmeans(data, k=3, seed=42)
        assert r1.labels == r2.labels
        assert r1.centroids == r2.centroids

    def test_n_iter_positive(self):
        data = [[1.0], [2.0], [10.0], [11.0]]
        result = kmeans(data, k=2, seed=42)
        assert result.n_iter > 0

    def test_result_type(self):
        result = kmeans([[1.0], [2.0]], k=1, seed=42)
        assert isinstance(result, KMeansResult)

    def test_single_cluster_all_same_label(self):
        data = [[1.0], [2.0], [3.0], [4.0], [5.0]]
        result = kmeans(data, k=1, seed=42)
        assert all(label == 0 for label in result.labels)


class TestExtractFeatures:
    def test_empty_returns_empty(self):
        assert extract_features([]) == []

    def test_short_returns_empty(self):
        assert extract_features([1.0, 2.0, 3.0], window_size=20) == []

    def test_correct_number_of_features(self):
        returns = [0.01 * i for i in range(50)]
        features = extract_features(returns, window_size=20)
        assert len(features) == 30  # 50 - 20

    def test_feature_dimension_is_seven(self):
        returns = [0.01 * (i % 10) for i in range(50)]
        features = extract_features(returns, window_size=20)
        assert all(len(f) == 7 for f in features)
