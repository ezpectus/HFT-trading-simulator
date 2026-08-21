"""Reproducing Kernel Hilbert Space (RKHS) kernel methods.

Maps financial time series into a high-dimensional feature space implicitly
via kernel functions, enabling non-linear analysis without explicit feature
engineering.

    Kernel: k(x, y) = <phi(x), phi(y)>_H
    RBF:       k(x,y) = exp(-||x-y||^2 / (2*sigma^2))
    Laplacian: k(x,y) = exp(-||x-y|| / sigma)

    Kernel PCA: eigendecomposition of centered kernel matrix K_c = H*K*H
    Projection: PC_i(x) = sum_j alpha_ij * k(x_j, x) / sqrt(lambda_i)

    MMD: MMD^2 = (1/n^2)sum k(x_i,x_j) + (1/m^2)sum k(y_i,y_j)
               - (2/(nm))sum k(x_i,y_j)

    Kernel Ridge: f(x) = sum alpha_i * k(x_i, x),  alpha = (K + lambda*I)^-1 * y

Ported from UI-only ReproducingKernelHilbertSpace.jsx into trading logic.
Reference: future_development.md §0.2 — medium priority model.
"""
from __future__ import annotations

import math

MIN_PRICES = 30
DEFAULT_KERNEL = "rbf"
DEFAULT_SIGMA = 0.5
DEFAULT_LAMBDA = 0.01
DEFAULT_LOOKBACK = 60
DEFAULT_N_COMPONENTS = 3
EMBED_DIM = 3
MMD_THRESHOLD = 0.3


class RKHSResult:
    """Container for RKHS analysis results."""

    def __init__(
        self,
        top_eigs: list[dict],
        projections: list[list[float]],
        mmd: float,
        predictions: list[float],
        actual_next: list[float],
        mse: float,
        r2: float,
        current_pred: float,
        signal: str,
        reason: str,
        n_samples: int,
    ) -> None:
        self.top_eigs = top_eigs
        self.projections = projections
        self.mmd = mmd
        self.predictions = predictions
        self.actual_next = actual_next
        self.mse = mse
        self.r2 = r2
        self.current_pred = current_pred
        self.signal = signal
        self.reason = reason
        self.n_samples = n_samples


def rbf_kernel(x: list[float], y: list[float], sigma: float) -> float:
    """RBF (Gaussian) kernel."""
    dist2 = sum((x[i] - y[i]) ** 2 for i in range(len(x)))
    return math.exp(-dist2 / (2 * sigma * sigma))


def laplacian_kernel(x: list[float], y: list[float], sigma: float) -> float:
    """Laplacian kernel."""
    dist = sum(abs(x[i] - y[i]) for i in range(len(x)))
    return math.exp(-dist / sigma)


def kernel_matrix(x: list[list[float]], kernel, sigma: float) -> list[list[float]]:
    """Symmetric kernel matrix."""
    n = len(x)
    k = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i, n):
            k[i][j] = kernel(x[i], x[j], sigma)
            k[j][i] = k[i][j]
    return k


def center_kernel(k: list[list[float]]) -> list[list[float]]:
    """Center kernel matrix: K_c = H*K*H."""
    n = len(k)
    row_means = [sum(row) / n for row in k]
    grand_mean = sum(row_means) / n
    return [
        [k[i][j] - row_means[i] - row_means[j] + grand_mean for j in range(n)]
        for i in range(n)
    ]


def jacobi_eig(a: list[list[float]], max_iter: int = 50, tol: float = 1e-8) -> dict:
    """Jacobi eigendecomposition for symmetric matrices."""
    n = len(a)
    v = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    d = [row[:] for row in a]

    for _ in range(max_iter):
        max_val = 0.0
        p = 0
        q = 0
        for i in range(n):
            for j in range(i + 1, n):
                if abs(d[i][j]) > max_val:
                    max_val = abs(d[i][j])
                    p = i
                    q = j
        if max_val < tol:
            break

        theta = (d[q][q] - d[p][p]) / (2 * d[p][q])
        t = math.copysign(1.0, theta) * (abs(theta) + math.sqrt(theta * theta + 1))
        c = 1 / math.sqrt(t * t + 1)
        s = t * c

        for i in range(n):
            dip = d[i][p]
            diq = d[i][q]
            d[i][p] = c * dip - s * diq
            d[i][q] = s * dip + c * diq
        for j in range(n):
            dpj = d[p][j]
            dqj = d[q][j]
            d[p][j] = c * dpj - s * dqj
            d[q][j] = s * dpj + c * dqj
        d[p][q] = 0.0
        d[q][p] = 0.0
        for i in range(n):
            vip = v[i][p]
            viq = v[i][q]
            v[i][p] = c * vip - s * viq
            v[i][q] = s * vip + c * viq

    eigenvalues = [d[i][i] for i in range(n)]
    eigenvectors = [[v[i][j] for i in range(n)] for j in range(n)]
    return {"eigenvalues": eigenvalues, "eigenvectors": eigenvectors}


def compute_mmd(x: list[list[float]], y: list[list[float]], kernel, sigma: float) -> float:
    """Maximum Mean Discrepancy between two sample sets."""
    n = len(x)
    m = len(y)
    sum_xx = sum(kernel(x[i], x[j], sigma) for i in range(n) for j in range(n))
    sum_yy = sum(kernel(y[i], y[j], sigma) for i in range(m) for j in range(m))
    sum_xy = sum(kernel(x[i], y[j], sigma) for i in range(n) for j in range(m))
    return math.sqrt(max(0.0, sum_xx / (n * n) + sum_yy / (m * m) - 2 * sum_xy / (n * m)))


def kernel_ridge_regression(
    x: list[list[float]],
    y: list[float],
    kernel,
    sigma: float,
    lambda_: float,
) -> list[float]:
    """Kernel ridge regression: alpha = (K + lambda*I)^-1 * y."""
    n = len(x)
    k = kernel_matrix(x, kernel, sigma)
    a = [[k[i][j] + (lambda_ if i == j else 0.0) for j in range(n)] for i in range(n)]
    aug = [a[i] + [y[i]] for i in range(n)]

    for col in range(n):
        max_row = col
        for r in range(col + 1, n):
            if abs(aug[r][col]) > abs(aug[max_row][col]):
                max_row = r
        aug[col], aug[max_row] = aug[max_row], aug[col]
        if abs(aug[col][col]) < 1e-10:
            continue
        for r in range(col + 1, n):
            factor = aug[r][col] / aug[col][col]
            for c in range(col, n + 1):
                aug[r][c] -= factor * aug[col][c]

    alpha = [0.0] * n
    for i in range(n - 1, -1, -1):
        alpha[i] = aug[i][n]
        for j in range(i + 1, n):
            alpha[i] -= aug[i][j] * alpha[j]
        alpha[i] /= aug[i][i] if abs(aug[i][i]) > 1e-10 else 1.0
    return alpha


def predict_krr(
    alpha: list[float],
    x_train: list[list[float]],
    x_new: list[float],
    kernel,
    sigma: float,
) -> float:
    """KRR prediction: f(x) = sum alpha_i * k(x_i, x)."""
    return sum(alpha[i] * kernel(x_train[i], x_new, sigma) for i in range(len(x_train)))


def rkhs_signal(current_pred: float, mmd: float) -> tuple[str, str]:
    """Signal from KRR prediction and MMD regime shift."""
    if mmd > MMD_THRESHOLD:
        return "REGIME_SHIFT", f"MMD = {mmd:.4f} (distribution shift detected)"
    if current_pred > 0.3:
        return "BUY", f"RKHS prediction = {current_pred:.4f} (positive)"
    if current_pred < -0.3:
        return "SELL", f"RKHS prediction = {current_pred:.4f} (negative)"
    return "NEUTRAL", f"RKHS prediction = {current_pred:.4f} (neutral)"


def rkhs_analysis(
    prices: list[float],
    kernel_type: str = DEFAULT_KERNEL,
    sigma: float = DEFAULT_SIGMA,
    lambda_: float = DEFAULT_LAMBDA,
    lookback: int = DEFAULT_LOOKBACK,
    n_components: int = DEFAULT_N_COMPONENTS,
) -> RKHSResult | None:
    """Full RKHS analysis of a price series. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]
    mean = sum(returns) / len(returns)
    std = math.sqrt(sum((r - mean) ** 2 for r in returns) / len(returns))
    norm_r = [(r - mean) / std if std > 0 else 0.0 for r in returns]

    x = [
        [norm_r[i], norm_r[i - 1], norm_r[i - 2]]
        for i in range(EMBED_DIM - 1, len(norm_r))
    ]
    if len(x) < 5:
        return None

    kernel = rbf_kernel if kernel_type == "rbf" else laplacian_kernel

    k = kernel_matrix(x, kernel, sigma)
    kc = center_kernel(k)
    eig = jacobi_eig(kc, 50)

    sorted_idx = sorted(range(len(eig["eigenvalues"])), key=lambda i: eig["eigenvalues"][i], reverse=True)
    top_eigs = [
        {"eigenvalue": eig["eigenvalues"][i], "eigenvector": eig["eigenvectors"][i]}
        for i in sorted_idx[:n_components]
    ]

    projections = []
    for i in range(len(x)):
        pcs = []
        for eig_comp in top_eigs:
            proj = sum(eig_comp["eigenvector"][j] * k[i][j] for j in range(len(x)))
            pcs.append(proj / math.sqrt(max(1e-10, eig_comp["eigenvalue"])))
        projections.append(pcs)

    half_idx = len(x) // 2
    mmd = compute_mmd(x[:half_idx], x[half_idx:], kernel, sigma)

    y_krr = norm_r[EMBED_DIM:]
    x_krr = x[:-1]
    if len(x_krr) < 5 or len(y_krr) < 5:
        return None

    alpha = kernel_ridge_regression(x_krr, y_krr, kernel, sigma, lambda_)
    predictions = [predict_krr(alpha, x_krr, x_val, kernel, sigma) for x_val in x_krr]
    actual_next = y_krr

    mse = sum((predictions[i] - actual_next[i]) ** 2 for i in range(len(predictions))) / len(predictions)
    y_var = sum((v - mean) ** 2 for v in y_krr) / len(y_krr)
    r2 = 1 - mse / (y_var + 1e-10)

    current_pred = predictions[-1]
    signal, reason = rkhs_signal(current_pred, mmd)

    return RKHSResult(
        top_eigs=top_eigs,
        projections=projections,
        mmd=mmd,
        predictions=predictions,
        actual_next=actual_next,
        mse=mse,
        r2=r2,
        current_pred=current_pred,
        signal=signal,
        reason=reason,
        n_samples=len(x),
    )
