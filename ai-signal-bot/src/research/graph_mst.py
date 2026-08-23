"""Graph Theory: Correlation Networks & Minimum Spanning Tree (MST).

Constructs financial networks from return correlations and extracts
the minimum spanning tree backbone (Mantegna).
"""
from __future__ import annotations

import math


MIN_SYMBOLS = 3
DEFAULT_EDGE_THRESHOLD = 0.3


class GraphMSTResult:
    """Container for graph/MST analysis results."""

    def __init__(
        self,
        symbols: list[str],
        corr: list[list[float]],
        edges: list[dict],
        mst: list[dict],
        filtered_edges: list[dict],
        eigen_cent: list[float],
        betw_cent: list[float],
        cluster_coeff: list[float],
        degrees: list[int],
        avg_corr: float,
        mst_avg_dist: float,
        mst_avg_corr: float,
        hub: str,
        hub_idx: int,
        signal: str,
        reason: str,
        n: int,
    ) -> None:
        self.symbols = symbols
        self.corr = corr
        self.edges = edges
        self.mst = mst
        self.filtered_edges = filtered_edges
        self.eigen_cent = eigen_cent
        self.betw_cent = betw_cent
        self.cluster_coeff = cluster_coeff
        self.degrees = degrees
        self.avg_corr = avg_corr
        self.mst_avg_dist = mst_avg_dist
        self.mst_avg_corr = mst_avg_corr
        self.hub = hub
        self.hub_idx = hub_idx
        self.signal = signal
        self.reason = reason
        self.n = n


def correlation_matrix(returns_list: list[list[float]]) -> list[list[float]]:
    """Pearson correlation matrix from multiple return series."""
    n = len(returns_list)
    t = len(returns_list[0])
    corr = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            mi = sum(returns_list[i]) / t
            mj = sum(returns_list[j]) / t
            cov = 0.0
            vi = 0.0
            vj = 0.0
            for k in range(t):
                di = returns_list[i][k] - mi
                dj = returns_list[j][k] - mj
                cov += di * dj
                vi += di * di
                vj += dj * dj
            corr[i][j] = cov / math.sqrt(vi * vj) if vi > 0 and vj > 0 else 0.0
    return corr


def kruskal_mst(edges: list[dict], n: int) -> list[dict]:
    """Kruskal's minimum spanning tree."""
    sorted_edges = sorted(edges, key=lambda e: e["weight"])
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    mst: list[dict] = []
    for e in sorted_edges:
        ra = find(e["a"])
        rb = find(e["b"])
        if ra != rb:
            parent[ra] = rb
            mst.append(e)
    return mst


def eigenvector_centrality(adj_matrix: list[list[float]], max_iter: int = 100) -> list[float]:
    """Eigenvector centrality via power iteration."""
    n = len(adj_matrix)
    v = [1 / n] * n
    for _ in range(max_iter):
        new_v = [sum(adj_matrix[i][j] * v[j] for j in range(n)) for i in range(n)]
        norm = math.sqrt(sum(x * x for x in new_v)) or 1.0
        v = [x / norm for x in new_v]
    return v


def betweenness_centrality(mst_edges: list[dict], n: int) -> list[float]:
    """Betweenness centrality via BFS shortest-path counting."""
    adj: list[list[int]] = [[] for _ in range(n)]
    for e in mst_edges:
        adj[e["a"]].append(e["b"])
        adj[e["b"]].append(e["a"])

    centrality = [0.0] * n
    for s in range(n):
        for t in range(s + 1, n):
            visited = [False] * n
            parent = [-1] * n
            visited[s] = True
            queue = [s]
            while queue:
                u = queue.pop(0)
                if u == t:
                    break
                for v in adj[u]:
                    if not visited[v]:
                        visited[v] = True
                        parent[v] = u
                        queue.append(v)
            u = t
            while u != s and u != -1:
                if u != t:
                    centrality[u] += 1
                u = parent[u]

    norm = (n - 1) * (n - 2) / 2
    return [c / norm if norm > 0 else 0.0 for c in centrality]


def clustering_coeff(mst_edges: list[dict], n: int) -> list[float]:
    """Local clustering coefficient."""
    adj: list[set] = [set() for _ in range(n)]
    for e in mst_edges:
        adj[e["a"]].add(e["b"])
        adj[e["b"]].add(e["a"])

    coeffs = []
    for i in range(n):
        neighbors = list(adj[i])
        k = len(neighbors)
        if k < 2:
            coeffs.append(0.0)
            continue
        links = 0
        for a in range(k):
            for b in range(a + 1, k):
                if neighbors[b] in adj[neighbors[a]]:
                    links += 1
        coeffs.append(2 * links / (k * (k - 1)))
    return coeffs


def graph_signal(degrees: list[int], hub_idx: int) -> tuple[str, str]:
    """Signal from hub node degree."""
    if degrees[hub_idx] > 2:
        return "HUB", f"Network hub detected (degree={degrees[hub_idx]})"
    return "NEUTRAL", f"No dominant hub (max degree={max(degrees)})"


def graph_mst_analysis(
    returns_list: list[list[float]],
    symbols: list[str] | None = None,
    edge_threshold: float = DEFAULT_EDGE_THRESHOLD,
) -> GraphMSTResult | None:
    """Full graph/MST analysis. None if fewer than 3 series."""
    if not returns_list or len(returns_list) < MIN_SYMBOLS:
        return None

    n = len(returns_list)
    if symbols is None:
        symbols = [f"asset_{i}" for i in range(n)]

    corr = correlation_matrix(returns_list)

    edges: list[dict] = []
    for i in range(n):
        for j in range(i + 1, n):
            dist = math.sqrt(max(0.0, 2 * (1 - corr[i][j])))
            edges.append({"a": i, "b": j, "weight": dist, "corr": corr[i][j]})

    mst = kruskal_mst(edges, n)

    adj_matrix = [[0.0] * n for _ in range(n)]
    for e in mst:
        adj_matrix[e["a"]][e["b"]] = 1.0
        adj_matrix[e["b"]][e["a"]] = 1.0

    eigen_cent = eigenvector_centrality(adj_matrix)
    betw_cent = betweenness_centrality(mst, n)
    cluster_coeff = clustering_coeff(mst, n)
    degrees = [int(sum(row)) for row in adj_matrix]

    filtered_edges = [e for e in edges if abs(e["corr"]) > edge_threshold]

    avg_corr = sum(e["corr"] for e in edges) / len(edges)
    mst_avg_dist = sum(e["weight"] for e in mst) / len(mst)
    mst_avg_corr = sum(e["corr"] for e in mst) / len(mst)

    hub_idx = max(range(n), key=lambda i: degrees[i])
    hub = symbols[hub_idx]
    signal, reason = graph_signal(degrees, hub_idx)

    return GraphMSTResult(
        symbols=symbols,
        corr=corr,
        edges=edges,
        mst=mst,
        filtered_edges=filtered_edges,
        eigen_cent=eigen_cent,
        betw_cent=betw_cent,
        cluster_coeff=cluster_coeff,
        degrees=degrees,
        avg_corr=avg_corr,
        mst_avg_dist=mst_avg_dist,
        mst_avg_corr=mst_avg_corr,
        hub=hub,
        hub_idx=hub_idx,
        signal=signal,
        reason=reason,
        n=n,
    )
