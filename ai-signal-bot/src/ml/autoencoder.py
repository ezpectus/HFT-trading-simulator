"""Autoencoder for unsupervised feature learning and anomaly detection.

A shallow autoencoder with tied weights compresses input into a lower-
dimensional latent space and reconstructs it; high reconstruction error
indicates anomalies.
"""
from __future__ import annotations

import math
import random

DEFAULT_WINDOW = 20
DEFAULT_HIDDEN_DIM = 4
DEFAULT_EPOCHS = 200
DEFAULT_LR = 0.01
DEFAULT_L2 = 0.001
DEFAULT_THRESHOLD_SIGMA = 2.0
MIN_CANDLES = 40
MIN_FEATURES = 20
N_FEATURES = 12


class AutoencoderModel:
    """Container for a trained autoencoder."""

    def __init__(
        self,
        we: list[list[float]],
        be: list[float],
        wd: list[list[float]],
        bd: list[float],
        losses: list[float],
        recon_errors: list[float],
        latent: list[list[float]],
        hidden_dim: int,
    ) -> None:
        self.we = we
        self.be = be
        self.wd = wd
        self.bd = bd
        self.losses = losses
        self.recon_errors = recon_errors
        self.latent = latent
        self.hidden_dim = hidden_dim


class AutoencoderResult:
    """Container for autoencoder anomaly detection results."""

    def __init__(
        self,
        model: AutoencoderModel,
        anomalies: list[dict],
        mean_err: float,
        std_err: float,
        anomaly_threshold: float,
        current_error: float,
        is_anomaly: bool,
        z_score: float,
        signal: str,
        input_dim: int,
    ) -> None:
        self.model = model
        self.anomalies = anomalies
        self.mean_err = mean_err
        self.std_err = std_err
        self.anomaly_threshold = anomaly_threshold
        self.current_error = current_error
        self.is_anomaly = is_anomaly
        self.z_score = z_score
        self.signal = signal
        self.input_dim = input_dim


def _sigmoid(x: float) -> float:
    """Stable sigmoid with input clamping."""
    return 1 / (1 + math.exp(-max(-500.0, min(500.0, x))))


def _dsigmoid(y: float) -> float:
    """Derivative of sigmoid: y * (1 - y)."""
    return y * (1 - y)


def _xavier(fan_in: int, fan_out: int, rng: random.Random) -> float:
    """Xavier weight initialization."""
    return (rng.random() * 2 - 1) * math.sqrt(2 / (fan_in + fan_out))


def _init_weights(rows: int, cols: int, rng: random.Random) -> list[list[float]]:
    """Initialize a weight matrix with Xavier scaling."""
    return [[_xavier(cols, rows, rng) for _ in range(cols)] for _ in range(rows)]


def _init_bias(size: int) -> list[float]:
    """Initialize a bias vector to zeros."""
    return [0.0] * size


def _forward(
    x: list[float],
    we: list[list[float]],
    be: list[float],
    wd: list[list[float]],
    bd: list[float],
    input_dim: int,
    hidden_dim: int,
) -> tuple[list[float], list[float]]:
    """Forward pass: returns (hidden, reconstruction)."""
    h = [0.0] * hidden_dim
    for k in range(hidden_dim):
        total = be[k]
        for j in range(input_dim):
            total += we[k][j] * x[j]
        h[k] = _sigmoid(total)

    x_hat = [0.0] * input_dim
    for j in range(input_dim):
        total = bd[j]
        for k in range(hidden_dim):
            total += wd[j][k] * h[k]
        x_hat[j] = _sigmoid(total)
    return h, x_hat


def _train_epoch(
    x_data: list[list[float]],
    we: list[list[float]],
    be: list[float],
    wd: list[list[float]],
    bd: list[float],
    input_dim: int,
    hidden_dim: int,
    lr: float,
    lambda_: float,
) -> float:
    """One training epoch: forward, loss, backprop, weight update."""
    total_loss = 0.0
    for x in x_data:
        h, x_hat = _forward(x, we, be, wd, bd, input_dim, hidden_dim)

        loss = 0.0
        dx_hat = [0.0] * input_dim
        for j in range(input_dim):
            diff = x_hat[j] - x[j]
            loss += diff * diff
            dx_hat[j] = 2 * diff * _dsigmoid(x_hat[j])
        total_loss += loss / input_dim

        d_wd = [[0.0] * hidden_dim for _ in range(input_dim)]
        d_bd = [0.0] * input_dim
        d_h = [0.0] * hidden_dim
        for j in range(input_dim):
            d_bd[j] = dx_hat[j]
            for k in range(hidden_dim):
                d_wd[j][k] = dx_hat[j] * h[k]
                d_h[k] += dx_hat[j] * wd[j][k]

        d_we = [[0.0] * input_dim for _ in range(hidden_dim)]
        d_be = [0.0] * hidden_dim
        for k in range(hidden_dim):
            dhk = d_h[k] * _dsigmoid(h[k])
            d_be[k] = dhk
            for j in range(input_dim):
                d_we[k][j] = dhk * x[j]

        for j in range(input_dim):
            bd[j] -= lr * d_bd[j]
            for k in range(hidden_dim):
                wd[j][k] -= lr * (d_wd[j][k] + lambda_ * wd[j][k])
        for k in range(hidden_dim):
            be[k] -= lr * d_be[k]
            for j in range(input_dim):
                we[k][j] -= lr * (d_we[k][j] + lambda_ * we[k][j])

    return total_loss / len(x_data)


def _reconstruction(
    x_data: list[list[float]],
    we: list[list[float]],
    be: list[float],
    wd: list[list[float]],
    bd: list[float],
    input_dim: int,
    hidden_dim: int,
) -> tuple[list[float], list[list[float]]]:
    """Reconstruction errors and latent codes for all samples."""
    recon_errors: list[float] = []
    latent: list[list[float]] = []
    for x in x_data:
        h, x_hat = _forward(x, we, be, wd, bd, input_dim, hidden_dim)
        err = sum((x[j] - x_hat[j]) ** 2 for j in range(input_dim))
        recon_errors.append(math.sqrt(err / input_dim))
        latent.append(h)
    return recon_errors, latent


def extract_ae_features(candles: list[dict], window_size: int = DEFAULT_WINDOW) -> list[list[float]]:
    """Extract 12 technical features from candle windows."""
    features: list[list[float]] = []
    for i in range(window_size, len(candles)):
        window = candles[i - window_size : i]
        prices = [c["close"] for c in window]
        volumes = [c.get("volume", 1) or 1 for c in window]

        mean = sum(prices) / window_size
        std = math.sqrt(sum((p - mean) ** 2 for p in prices) / window_size)

        ret = (prices[-1] - prices[-2]) / prices[-2]
        vol = std / mean
        price_range = (max(prices) - min(prices)) / mean
        skew = sum(((p - mean) / std) ** 3 for p in prices) / window_size if std > 0 else 0.0
        kurt = sum(((p - mean) / std) ** 4 for p in prices) / window_size - 3 if std > 0 else 0.0

        gains = 0.0
        losses = 0.0
        for j in range(1, window_size):
            change = prices[j] - prices[j - 1]
            if change > 0:
                gains += change
            else:
                losses -= change
        rsi = 50 + 50 * (gains - losses) / (gains + losses) if gains + losses > 0 else 50.0

        mean_v = sum(volumes) / window_size
        std_v = math.sqrt(sum((v - mean_v) ** 2 for v in volumes) / window_size)
        vol_z = (volumes[-1] - mean_v) / std_v if std_v > 0 else 0.0

        momentum = (prices[-1] - prices[0]) / prices[0]
        sma = mean
        price_dev = (prices[-1] - sma) / sma

        rets = [(prices[j] - prices[j - 1]) / prices[j - 1] for j in range(1, window_size)]
        mean_r = sum(rets) / len(rets)
        ac1 = 0.0
        ac1_den = 0.0
        for j in range(1, len(rets)):
            ac1 += (rets[j] - mean_r) * (rets[j - 1] - mean_r)
            ac1_den += (rets[j] - mean_r) ** 2
        ac1 = ac1 / ac1_den if ac1_den > 0 else 0.0

        features.append(
            [
                ret * 100, vol * 100, price_range * 100, skew, kurt, rsi / 100,
                vol_z, momentum * 100, price_dev * 100, ac1, std / mean * 100,
                (prices[-1] - mean) / std if std > 0 else 0.0,
            ]
        )
    return features


def standardize(features: list[list[float]]) -> tuple[list[list[float]], list[float], list[float]]:
    """Z-score standardization: returns (data, means, stds)."""
    n = len(features)
    d = len(features[0])
    means = [0.0] * d
    stds = [0.0] * d
    for i in range(n):
        for j in range(d):
            means[j] += features[i][j]
    for j in range(d):
        means[j] /= n
    for i in range(n):
        for j in range(d):
            stds[j] += (features[i][j] - means[j]) ** 2
    for j in range(d):
        stds[j] = math.sqrt(stds[j] / n)
    data = [
        [0.0 if stds[j] <= 0 else (f[j] - means[j]) / stds[j] for j in range(d)]
        for f in features
    ]
    return data, means, stds


def train_autoencoder(
    x_data: list[list[float]],
    input_dim: int,
    hidden_dim: int,
    epochs: int = DEFAULT_EPOCHS,
    lr: float = DEFAULT_LR,
    lambda_: float = DEFAULT_L2,
    seed: int | None = None,
) -> AutoencoderModel | None:
    """Train a shallow autoencoder via gradient descent. None if invalid params."""
    if not x_data or input_dim <= 0 or hidden_dim <= 0 or epochs <= 0 or lr <= 0:
        return None

    rng = random.Random(seed)
    we = _init_weights(hidden_dim, input_dim, rng)
    be = _init_bias(hidden_dim)
    wd = _init_weights(input_dim, hidden_dim, rng)
    bd = _init_bias(input_dim)

    losses = [
        _train_epoch(x_data, we, be, wd, bd, input_dim, hidden_dim, lr, lambda_)
        for _ in range(epochs)
    ]
    recon_errors, latent = _reconstruction(x_data, we, be, wd, bd, input_dim, hidden_dim)

    return AutoencoderModel(
        we=we, be=be, wd=wd, bd=bd,
        losses=losses, recon_errors=recon_errors, latent=latent, hidden_dim=hidden_dim,
    )


def detect_anomalies(
    recon_errors: list[float],
    threshold_sigma: float = DEFAULT_THRESHOLD_SIGMA,
) -> dict:
    """Detect anomalies: errors above mean + k*std."""
    if not recon_errors:
        return {
            "mean_err": 0.0, "std_err": 0.0, "threshold": 0.0, "anomalies": [],
            "current_error": 0.0, "is_anomaly": False, "z_score": 0.0,
        }
    mean_err = sum(recon_errors) / len(recon_errors)
    std_err = math.sqrt(sum((e - mean_err) ** 2 for e in recon_errors) / len(recon_errors))
    threshold = mean_err + threshold_sigma * std_err
    anomalies = [{"index": i, "error": e} for i, e in enumerate(recon_errors) if e > threshold]
    current_error = recon_errors[-1]
    is_anomaly = current_error > threshold
    z_score = (current_error - mean_err) / std_err if std_err > 0 else 0.0
    return {
        "mean_err": mean_err, "std_err": std_err, "threshold": threshold,
        "anomalies": anomalies, "current_error": current_error,
        "is_anomaly": is_anomaly, "z_score": z_score,
    }


def autoencoder_signal(is_anomaly: bool, z_score: float) -> str:
    """Signal: NORMAL / WARNING / ANOMALY based on anomaly state and z-score."""
    if not is_anomaly:
        return "NORMAL"
    return "ANOMALY" if z_score > 3 else "WARNING"


def autoencoder_analysis(
    candles: list[dict],
    hidden_dim: int = DEFAULT_HIDDEN_DIM,
    epochs: int = DEFAULT_EPOCHS,
    lr: float = DEFAULT_LR,
    threshold: float = DEFAULT_THRESHOLD_SIGMA,
    window_size: int = DEFAULT_WINDOW,
    seed: int | None = None,
) -> AutoencoderResult | None:
    """Full autoencoder anomaly analysis of candles. None if insufficient data."""
    if not candles or len(candles) < MIN_CANDLES:
        return None

    raw_features = extract_ae_features(candles, window_size)
    if len(raw_features) < MIN_FEATURES:
        return None

    std_features, _means, _stds = standardize(raw_features)
    input_dim = len(std_features[0])
    model = train_autoencoder(std_features, input_dim, hidden_dim, epochs, lr, DEFAULT_L2, seed)
    if model is None:
        return None

    detection = detect_anomalies(model.recon_errors, threshold)
    signal = autoencoder_signal(detection["is_anomaly"], detection["z_score"])

    return AutoencoderResult(
        model=model,
        anomalies=detection["anomalies"],
        mean_err=detection["mean_err"],
        std_err=detection["std_err"],
        anomaly_threshold=detection["threshold"],
        current_error=detection["current_error"],
        is_anomaly=detection["is_anomaly"],
        z_score=detection["z_score"],
        signal=signal,
        input_dim=input_dim,
    )
