"""Principal Component Analysis (PCA) for multi-asset return decomposition.

Covariance-based PCA with SVD eigendecomposition. Extracts latent factors
from multi-asset return matrices for factor analysis, risk decomposition,
and eigenportfolio construction.

Ported from UI-only PrincipalComponentAnalysis.jsx into trading logic.
Reference: future_development.md §0.1 — medium priority model.
"""
from __future__ import annotations

try:
    import numpy as np
    _HAS_NUMPY = True
except ImportError:
    _HAS_NUMPY = False

NAN = float("nan")
DEFAULT_N_COMPONENTS: int | None = None


class PCAResult:
    """Container for PCA computation results."""

    def __init__(
        self,
        eigenvalues: list[float],
        explained_variance_ratio: list[float],
        cumulative_variance: list[float],
        components: list[list[float]],
        scores: list[list[float]],
        mean: list[float],
    ) -> None:
        self.eigenvalues = eigenvalues
        self.explained_variance_ratio = explained_variance_ratio
        self.cumulative_variance = cumulative_variance
        self.components = components
        self.scores = scores
        self.mean = mean


def compute_pca(
    returns: list[list[float]],
    n_components: int | None = DEFAULT_N_COMPONENTS,
) -> PCAResult:
    """Compute PCA on a returns matrix (n_samples x n_features).

    Returns eigenvalues, explained variance ratios, components, and scores
    sorted by descending eigenvalue.
    """
    if not returns or not returns[0]:
        return PCAResult([], [], [], [], [], [])

    n = len(returns)
    m = len(returns[0])

    if n < 2:
        return PCAResult([0.0] * m, [0.0] * m, [0.0] * m, [], [], [0.0] * m)

    if _HAS_NUMPY:
        return _compute_pca_numpy(returns, n, m, n_components)
    return _compute_pca_pure(returns, n, m, n_components)


def _compute_pca_numpy(
    returns: list[list[float]],
    n: int,
    m: int,
    n_components: int | None,
) -> PCAResult:
    """PCA via numpy SVD — numerically stable and efficient."""
    X = np.array(returns, dtype=np.float64)
    mean = X.mean(axis=0)
    Xc = X - mean

    # SVD: Xc = U * S * V^T
    # Eigenvalues of covariance = S^2 / (n-1)
    U, S, Vt = np.linalg.svd(Xc, full_matrices=False)
    eigenvalues = (S ** 2) / (n - 1)
    eigenvectors = Vt  # rows are principal components

    total_var = eigenvalues.sum()
    if total_var == 0:
        explained_ratio = [0.0] * len(eigenvalues)
    else:
        explained_ratio = (eigenvalues / total_var).tolist()

    cumulative = []
    cum_sum = 0.0
    for r in explained_ratio:
        cum_sum += r
        cumulative.append(cum_sum)

    scores = (Xc @ eigenvectors.T).tolist()
    components = eigenvectors.tolist()
    mean_list = mean.tolist()

    if n_components is not None:
        k = min(n_components, len(eigenvalues))
        eigenvalues = eigenvalues[:k].tolist()
        explained_ratio = explained_ratio[:k]
        cumulative = cumulative[:k]
        components = components[:k]
        scores = [row[:k] for row in scores]
    else:
        eigenvalues = eigenvalues.tolist()

    return PCAResult(
        eigenvalues=eigenvalues,
        explained_variance_ratio=explained_ratio,
        cumulative_variance=cumulative,
        components=components,
        scores=scores,
        mean=mean_list,
    )


def _compute_pca_pure(
    returns: list[list[float]],
    n: int,
    m: int,
    n_components: int | None,
) -> PCAResult:
    """PCA via covariance + Jacobi eigendecomposition (no numpy)."""
    # Center
    mean = [0.0] * m
    for row in returns:
        for j in range(m):
            mean[j] += row[j]
    mean = [v / n for v in mean]

    centered = [[row[j] - mean[j] for j in range(m)] for row in returns]

    # Covariance matrix
    cov = [[0.0] * m for _ in range(m)]
    for i in range(m):
        for j in range(i, m):
            s = 0.0
            for k in range(n):
                s += centered[k][i] * centered[k][j]
            cov[i][j] = s / (n - 1)
            cov[j][i] = cov[i][j]

    # Jacobi eigendecomposition
    eigenvalues, eigenvectors = _jacobi_eigendecomposition(cov)

    # Sort descending
    indices = sorted(range(len(eigenvalues)), key=lambda i: -eigenvalues[i])
    sorted_values = [eigenvalues[i] for i in indices]
    sorted_vectors = [[eigenvectors[r][i] for r in range(m)] for i in indices]

    # Explained variance
    total_var = sum(sorted_values)
    if total_var == 0:
        explained_ratio = [0.0] * m
    else:
        explained_ratio = [v / total_var for v in sorted_values]

    cumulative = []
    cum_sum = 0.0
    for r in explained_ratio:
        cum_sum += r
        cumulative.append(cum_sum)

    # Scores
    scores = []
    for row in centered:
        scores.append([sum(row[j] * vec[j] for j in range(m)) for vec in sorted_vectors])

    k = n_components if n_components is not None else m
    k = min(k, m)

    return PCAResult(
        eigenvalues=sorted_values[:k],
        explained_variance_ratio=explained_ratio[:k],
        cumulative_variance=cumulative[:k],
        components=sorted_vectors[:k],
        scores=[row[:k] for row in scores],
        mean=mean,
    )


def _jacobi_eigendecomposition(
    A: list[list[float]],
    max_iter: int = 100,
    tol: float = 1e-10,
) -> tuple[list[float], list[list[float]]]:
    """Jacobi eigenvalue algorithm for symmetric matrices."""
    n = len(A)
    D = [row[:] for row in A]
    V = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]

    for _ in range(max_iter):
        # Find largest off-diagonal
        max_val = 0.0
        p, q = 0, 0
        for i in range(n):
            for j in range(i + 1, n):
                if abs(D[i][j]) > max_val:
                    max_val = abs(D[i][j])
                    p, q = i, j

        if max_val < tol:
            break

        # Rotation angle
        if D[p][p] == D[q][q]:
            theta = 1.0
        else:
            theta = (D[q][q] - D[p][p]) / (2.0 * D[p][q])
        t = (1.0 if theta >= 0 else -1.0) * (abs(theta) + (theta * theta + 1.0) ** 0.5)
        c = 1.0 / (t * t + 1.0) ** 0.5
        s = t * c

        # Apply rotation to D
        for i in range(n):
            dip, diq = D[i][p], D[i][q]
            D[i][p] = c * dip - s * diq
            D[i][q] = s * dip + c * diq
        for j in range(n):
            dpj, dqj = D[p][j], D[q][j]
            D[p][j] = c * dpj - s * dqj
            D[q][j] = s * dpj + c * dqj
        D[p][q] = 0.0
        D[q][p] = 0.0

        # Update eigenvectors
        for i in range(n):
            vip, viq = V[i][p], V[i][q]
            V[i][p] = c * vip - s * viq
            V[i][q] = s * vip + c * viq

    eigenvalues = [D[i][i] for i in range(n)]
    return eigenvalues, V
