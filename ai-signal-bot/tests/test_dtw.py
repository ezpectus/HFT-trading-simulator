"""Tests for Dynamic Time Warping implementation."""
import math

import pytest

from src.technical_analysis.dtw import (
    PATTERN_TEMPLATES,
    DTWResult,
    compute_returns,
    dtw,
    extract_windows,
    find_best_match,
    normalize,
)


class TestDTW:
    def test_empty_sequences_returns_inf(self):
        result = dtw([], [])
        assert result.distance == float("inf")
        assert result.path == []

    def test_single_element_identical(self):
        result = dtw([5.0], [5.0])
        assert result.distance == pytest.approx(0.0)
        assert result.path == [(0, 0)]

    def test_single_element_different(self):
        result = dtw([1.0], [3.0])
        assert result.distance == pytest.approx(2.0)

    def test_identical_sequences_zero_distance(self):
        x = [1.0, 2.0, 3.0, 4.0, 5.0]
        result = dtw(x, x)
        assert result.distance == pytest.approx(0.0)

    def test_shifted_sequence_low_distance(self):
        """A shifted version of a sequence should have low DTW distance."""
        x = [1.0, 2.0, 3.0, 4.0, 5.0]
        y = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0]
        result = dtw(x, y)
        assert result.distance <= 1.0

    def test_different_lengths(self):
        x = [1.0, 2.0, 3.0]
        y = [1.0, 2.0, 3.0, 4.0, 5.0]
        result = dtw(x, y)
        assert result.distance > 0
        assert len(result.path) > 0

    def test_warping_path_start_and_end(self):
        x = [1.0, 2.0, 3.0]
        y = [1.0, 2.0, 3.0]
        result = dtw(x, y)
        assert result.path[0] == (0, 0)
        assert result.path[-1] == (2, 2)

    def test_window_constraint(self):
        x = [1.0, 2.0, 3.0, 4.0, 5.0]
        y = [1.0, 2.0, 3.0, 4.0, 5.0]
        result = dtw(x, y, window=1)
        assert result.distance == pytest.approx(0.0)

    def test_cost_non_negative(self):
        x = [1.0, 5.0, 2.0]
        y = [3.0, 1.0, 4.0]
        result = dtw(x, y)
        assert result.cost >= 0.0

    def test_result_type(self):
        result = dtw([1.0], [2.0])
        assert isinstance(result, DTWResult)

    def test_symmetric_distance(self):
        """DTW distance should be symmetric."""
        x = [1.0, 3.0, 2.0, 5.0, 4.0]
        y = [2.0, 1.0, 4.0, 3.0, 5.0]
        r1 = dtw(x, y)
        r2 = dtw(y, x)
        assert r1.distance == pytest.approx(r2.distance)


class TestNormalize:
    def test_empty_returns_empty(self):
        assert normalize([]) == []

    def test_constant_returns_zeros(self):
        result = normalize([5.0, 5.0, 5.0])
        assert all(v == 0.0 for v in result)

    def test_z_score(self):
        result = normalize([1.0, 2.0, 3.0, 4.0, 5.0])
        assert sum(result) == pytest.approx(0.0, abs=1e-10)


class TestExtractWindows:
    def test_empty_returns_empty(self):
        assert extract_windows([], 5) == []

    def test_short_returns_empty(self):
        assert extract_windows([1.0, 2.0], 5) == []

    def test_correct_count(self):
        windows = extract_windows([1.0, 2.0, 3.0, 4.0, 5.0], 3)
        assert len(windows) == 3
        assert windows[0]["data"] == [1.0, 2.0, 3.0]
        assert windows[2]["data"] == [3.0, 4.0, 5.0]


class TestComputeReturns:
    def test_empty_returns_empty(self):
        assert compute_returns([]) == []

    def test_single_returns_empty(self):
        assert compute_returns([1.0]) == []

    def test_correct_returns(self):
        result = compute_returns([100.0, 110.0, 105.0])
        assert result[0] == pytest.approx(0.1)
        assert result[1] == pytest.approx(-5.0 / 110.0)


class TestFindBestMatch:
    def test_matches_template(self):
        template_name = "double_bottom"
        template = PATTERN_TEMPLATES[template_name]
        name, distance, _ = find_best_match(template)
        assert name == template_name
        assert distance == pytest.approx(0.0, abs=1e-6)

    def test_returns_valid_result(self):
        query = [1.0, 2.0, 3.0, 4.0, 5.0]
        name, distance, result = find_best_match(query)
        assert name in PATTERN_TEMPLATES
        assert isinstance(result, DTWResult)
        assert distance >= 0
