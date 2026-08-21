"""Tests for Graph Theory MST model."""
import math

import pytest

from src.research.graph_mst import (
    GraphMSTResult,
    betweenness_centrality,
    clustering_coeff,
    correlation_matrix,
    eigenvector_centrality,
    graph_mst_analysis,
    graph_signal,
    kruskal_mst,
)


def _returns_list(n_assets=5, n=100):
    """Multiple return series with a common factor."""
    import random as _random

    rng = _random.Random(42)
    factor = [rng.gauss(0, 0.01) for _ in range(n)]
    series = []
    for _ in range(n_assets):
        series.append([factor[i] * 0.5 + rng.gauss(0, 0.01) * 0.5 for i in range(n)])
    return series


class TestCorrelationMatrix:
    def test_diagonal_one(self):
        corr = correlation_matrix(_returns_list(4, 100))
        assert all(corr[i][i] == pytest.approx(1.0) for i in range(4))

    def test_symmetric(self):
        corr = correlation_matrix(_returns_list(4, 100))
        for i in range(4):
            for j in range(4):
                assert corr[i][j] == pytest.approx(corr[j][i])


class TestKruskalMST:
    def test_mst_connects_all_nodes(self):
        edges = [
            {"a": 0, "b": 1, "weight": 1.0},
            {"a": 1, "b": 2, "weight": 1.0},
            {"a": 0, "b": 2, "weight": 3.0},
            {"a": 2, "b": 3, "weight": 1.0},
        ]
        mst = kruskal_mst(edges, 4)
        assert len(mst) == 3  # n-1 edges

    def test_mst_minimal_weight(self):
        edges = [
            {"a": 0, "b": 1, "weight": 1.0},
            {"a": 1, "b": 2, "weight": 1.0},
            {"a": 0, "b": 2, "weight": 10.0},
        ]
        mst = kruskal_mst(edges, 3)
        total = sum(e["weight"] for e in mst)
        assert total == pytest.approx(2.0)

    def test_mst_no_cycles(self):
        edges = [
            {"a": 0, "b": 1, "weight": 1.0},
            {"a": 1, "b": 2, "weight": 1.0},
            {"a": 2, "b": 3, "weight": 1.0},
            {"a": 0, "b": 3, "weight": 0.5},
        ]
        mst = kruskal_mst(edges, 4)
        assert len(mst) == 3


class TestCentralities:
    def test_eigenvector_centrality_positive(self):
        adj = [[0.0, 1.0, 1.0], [1.0, 0.0, 0.0], [1.0, 0.0, 0.0]]
        cent = eigenvector_centrality(adj)
        assert cent[0] > cent[1]
        assert cent[0] > cent[2]

    def test_betweenness_centrality(self):
        # Path graph: 0-1-2-3, node 1 and 2 are between
        edges = [
            {"a": 0, "b": 1, "weight": 1.0},
            {"a": 1, "b": 2, "weight": 1.0},
            {"a": 2, "b": 3, "weight": 1.0},
        ]
        cent = betweenness_centrality(edges, 4)
        assert cent[1] > 0
        assert cent[0] == pytest.approx(0.0)

    def test_clustering_coeff_zero_for_tree(self):
        edges = [
            {"a": 0, "b": 1, "weight": 1.0},
            {"a": 1, "b": 2, "weight": 1.0},
        ]
        coeffs = clustering_coeff(edges, 3)
        assert all(c == pytest.approx(0.0) for c in coeffs)


class TestGraphSignal:
    def test_hub(self):
        signal, reason = graph_signal([3, 1, 1, 1], 0)
        assert signal == "HUB"

    def test_no_hub(self):
        signal, reason = graph_signal([1, 1, 1], 0)
        assert signal == "NEUTRAL"

    def test_boundary_degree(self):
        signal, reason = graph_signal([2, 1, 1], 0)
        assert signal == "NEUTRAL"


class TestGraphMSTAnalysis:
    def test_basic_analysis(self):
        result = graph_mst_analysis(_returns_list(5, 100))
        assert isinstance(result, GraphMSTResult)
        assert result.n == 5

    def test_insufficient_series_returns_none(self):
        assert graph_mst_analysis(_returns_list(2, 100)) is None

    def test_empty_returns_none(self):
        assert graph_mst_analysis([]) is None

    def test_mst_edges_count(self):
        result = graph_mst_analysis(_returns_list(5, 100))
        assert len(result.mst) == 4  # n-1

    def test_degrees_sum(self):
        result = graph_mst_analysis(_returns_list(5, 100))
        assert sum(result.degrees) == 2 * len(result.mst)

    def test_signal_in_set(self):
        result = graph_mst_analysis(_returns_list(5, 100))
        assert result.signal in {"HUB", "NEUTRAL"}

    def test_avg_corr_bounded(self):
        result = graph_mst_analysis(_returns_list(5, 100))
        assert -1 <= result.avg_corr <= 1

    def test_mst_avg_dist_positive(self):
        result = graph_mst_analysis(_returns_list(5, 100))
        assert result.mst_avg_dist > 0

    def test_hub_in_symbols(self):
        result = graph_mst_analysis(_returns_list(5, 100))
        assert result.hub in result.symbols

    def test_filtered_edges_non_empty(self):
        result = graph_mst_analysis(_returns_list(5, 100), edge_threshold=0.1)
        assert len(result.filtered_edges) > 0

    def test_custom_symbols(self):
        result = graph_mst_analysis(_returns_list(5, 100), symbols=["A", "B", "C", "D", "E"])
        assert result.symbols == ["A", "B", "C", "D", "E"]

    def test_centralities_length(self):
        result = graph_mst_analysis(_returns_list(5, 100))
        assert len(result.eigen_cent) == 5
        assert len(result.betw_cent) == 5
        assert len(result.cluster_coeff) == 5

    def test_eigen_cent_normalized(self):
        result = graph_mst_analysis(_returns_list(5, 100))
        norm = math.sqrt(sum(v * v for v in result.eigen_cent))
        assert norm == pytest.approx(1.0, abs=1e-6)
