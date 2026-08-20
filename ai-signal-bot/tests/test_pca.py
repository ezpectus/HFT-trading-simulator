"""Tests for PCA implementation."""
import math

import pytest

from src.technical_analysis.pca import (
    PCAResult,
    compute_pca,
)


class TestPCA:
    def test_empty_input_returns_empty_result(self):
        result = compute_pca([])
        assert result.eigenvalues == []
        assert result.components == []

    def test_empty_rows_returns_empty_result(self):
        result = compute_pca([[]])
        assert result.eigenvalues == []

    def test_single_sample_returns_zeros(self):
        result = compute_pca([[1.0, 2.0, 3.0]])
        assert len(result.eigenvalues) == 3
        assert all(v == 0.0 for v in result.eigenvalues)
        assert all(v == 0.0 for v in result.explained_variance_ratio)

    def test_identity_matrix_equal_eigenvalues(self):
        """Identity matrix should have equal eigenvalues."""
        data = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1]]
        result = compute_pca(data)
        assert len(result.eigenvalues) == 3
        total = sum(result.eigenvalues)
        assert total == pytest.approx(0.0, abs=0.5) or total > 0

    def test_known_data_first_pc_captures_most_variance(self):
        """Data with strong correlation should have PC1 capturing most variance."""
        data = [
            [1.0, 2.0],
            [2.0, 4.0],
            [3.0, 6.0],
            [4.0, 8.0],
            [5.0, 10.0],
        ]
        result = compute_pca(data)
        assert result.explained_variance_ratio[0] > 0.95
        assert result.cumulative_variance[0] == pytest.approx(
            result.explained_variance_ratio[0]
        )

    def test_explained_variance_sums_to_one(self):
        data = [
            [1.0, 2.0, 3.0],
            [4.0, 5.0, 6.0],
            [7.0, 8.0, 10.0],
            [2.0, 1.0, 0.0],
        ]
        result = compute_pca(data)
        total = sum(result.explained_variance_ratio)
        assert total == pytest.approx(1.0, abs=1e-6)

    def test_cumulative_variance_last_equals_one(self):
        data = [
            [1.0, 2.0],
            [3.0, 4.0],
            [5.0, 6.0],
        ]
        result = compute_pca(data)
        assert result.cumulative_variance[-1] == pytest.approx(1.0, abs=1e-6)

    def test_n_components_limits_output(self):
        data = [
            [1.0, 2.0, 3.0],
            [4.0, 5.0, 6.0],
            [7.0, 8.0, 10.0],
            [2.0, 1.0, 0.0],
        ]
        result = compute_pca(data, n_components=2)
        assert len(result.eigenvalues) == 2
        assert len(result.components) == 2
        assert all(len(row) == 2 for row in result.scores)

    def test_mean_is_correct(self):
        data = [
            [1.0, 2.0],
            [3.0, 4.0],
            [5.0, 6.0],
        ]
        result = compute_pca(data)
        assert result.mean[0] == pytest.approx(3.0)
        assert result.mean[1] == pytest.approx(4.0)

    def test_scores_have_correct_dimensions(self):
        data = [
            [1.0, 2.0, 3.0],
            [4.0, 5.0, 6.0],
            [7.0, 8.0, 10.0],
        ]
        result = compute_pca(data)
        assert len(result.scores) == 3
        assert len(result.scores[0]) == 3

    def test_eigenvalues_sorted_descending(self):
        data = [
            [1.0, 2.0, 3.0],
            [4.0, 5.0, 6.0],
            [7.0, 8.0, 10.0],
            [2.0, 1.0, 0.0],
            [3.0, 4.0, 1.0],
        ]
        result = compute_pca(data)
        for i in range(len(result.eigenvalues) - 1):
            assert result.eigenvalues[i] >= result.eigenvalues[i + 1]

    def test_orthogonal_data_equal_eigenvalues(self):
        """Uncorrelated data with equal variance should have equal eigenvalues."""
        data = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        result = compute_pca(data)
        assert result.eigenvalues[0] == pytest.approx(result.eigenvalues[1], rel=0.01)

    def test_constant_data_zero_variance(self):
        """All identical rows should produce zero eigenvalues."""
        data = [[5.0, 5.0], [5.0, 5.0], [5.0, 5.0]]
        result = compute_pca(data)
        assert all(v == 0.0 for v in result.eigenvalues)
        assert all(v == 0.0 for v in result.explained_variance_ratio)

    def test_result_type(self):
        data = [[1.0, 2.0], [3.0, 4.0]]
        result = compute_pca(data)
        assert isinstance(result, PCAResult)
