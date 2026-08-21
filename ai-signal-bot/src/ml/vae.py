"""Variational Autoencoder (VAE) for generative modeling of return distributions.

Learns a latent representation of return windows and generates synthetic
scenarios; high reconstruction error indicates anomalies.

    Encoder: q_phi(z|x) ~ N(mu_phi(x), sigma^2_phi(x))
    Decoder: p_theta(x|z) ~ N(mu_theta(z), sigma^2_theta(x))
    Prior:   p(z) = N(0, I)

    ELBO: L = E_q[log p(x|z)] - beta * KL[q(z|x) || p(z)]
        = reconstruction loss - regularization
    Reparameterization: z = mu + sigma * eps,  eps ~ N(0, I)
    KL (closed form): KL = -0.5 * sum(1 + logvar - mu^2 - exp(logvar))

Note: the UI's backprop was simplified/buggy (transposed decoder indices,
encoder never updated); this port implements correct backpropagation through
both encoder and decoder with the reparameterization trick.

Ported from UI-only VariationalAutoencoder.jsx into trading logic.
Reference: future_development.md §0.1 — low priority model.
"""
from __future__ import annotations

import math
import random

DEFAULT_LATENT_DIM = 2
DEFAULT_HIDDEN_DIM = 8
DEFAULT_BETA = 1.0
DEFAULT_LR = 0.001
DEFAULT_EPOCHS = 50
DEFAULT_LOOKBACK = 60
DEFAULT_WINDOW = 8
MIN_WINDOWS = 5
N_GENERATED = 100


class VAE:
    """Variational autoencoder with 2-layer encoder/decoder."""

    def __init__(
        self,
        input_dim: int,
        hidden_dim: int,
        latent_dim: int,
        seed: int | None = None,
    ) -> None:
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.latent_dim = latent_dim
        self.rng = random.Random(seed)

        self.w1 = _init_weights(hidden_dim, input_dim, self.rng)
        self.b1 = _init_bias(hidden_dim)
        self.w_mu = _init_weights(latent_dim, hidden_dim, self.rng)
        self.b_mu = _init_bias(latent_dim)
        self.w_logvar = _init_weights(latent_dim, hidden_dim, self.rng)
        self.b_logvar = _init_bias(latent_dim)
        self.w2 = _init_weights(hidden_dim, latent_dim, self.rng)
        self.b2 = _init_bias(hidden_dim)
        self.w_out = _init_weights(input_dim, hidden_dim, self.rng)
        self.b_out = _init_bias(input_dim)

    def encode(self, x: list[float]) -> tuple[list[float], list[float], list[float]]:
        """Encode input: returns (hidden, mu, logvar)."""
        h = [
            _sigmoid(sum(self.w1[k][j] * x[j] for j in range(self.input_dim)) + self.b1[k])
            for k in range(self.hidden_dim)
        ]
        mu = [
            sum(self.w_mu[i][k] * h[k] for k in range(self.hidden_dim)) + self.b_mu[i]
            for i in range(self.latent_dim)
        ]
        logvar = [
            sum(self.w_logvar[i][k] * h[k] for k in range(self.hidden_dim)) + self.b_logvar[i]
            for i in range(self.latent_dim)
        ]
        return h, mu, logvar

    def reparameterize(
        self,
        mu: list[float],
        logvar: list[float],
        eps: list[float] | None = None,
    ) -> list[float]:
        """Reparameterization trick: z = mu + exp(0.5*logvar) * eps."""
        if eps is None:
            eps = [_random_normal(self.rng) for _ in range(self.latent_dim)]
        return [mu[i] + math.exp(0.5 * logvar[i]) * eps[i] for i in range(self.latent_dim)]

    def decode(self, z: list[float]) -> tuple[list[float], list[float]]:
        """Decode latent: returns (hidden, reconstruction)."""
        h2 = [
            _sigmoid(sum(self.w2[k][l] * z[l] for l in range(self.latent_dim)) + self.b2[k])
            for k in range(self.hidden_dim)
        ]
        x_hat = [
            sum(self.w_out[j][k] * h2[k] for k in range(self.hidden_dim)) + self.b_out[j]
            for j in range(self.input_dim)
        ]
        return h2, x_hat

    def forward(self, x: list[float]) -> tuple:
        """Full forward pass: (h, mu, logvar, z, h2, x_hat)."""
        h, mu, logvar = self.encode(x)
        z = self.reparameterize(mu, logvar)
        h2, x_hat = self.decode(z)
        return h, mu, logvar, z, h2, x_hat

    def loss(
        self,
        x: list[float],
        x_hat: list[float],
        mu: list[float],
        logvar: list[float],
        beta: float = DEFAULT_BETA,
    ) -> dict:
        """ELBO loss: reconstruction (MSE) + beta * KL divergence."""
        recon = sum((x[i] - x_hat[i]) ** 2 for i in range(self.input_dim)) / self.input_dim
        kl = sum(
            -0.5 * (1 + logvar[i] - mu[i] * mu[i] - math.exp(logvar[i]))
            for i in range(self.latent_dim)
        )
        return {"total": recon + beta * kl, "recon": recon, "kl": kl}

    def train_step(self, x: list[float], lr: float, beta: float) -> dict:
        """One gradient-descent step with full backpropagation."""
        h, mu, logvar = self.encode(x)
        eps = [_random_normal(self.rng) for _ in range(self.latent_dim)]
        z = self.reparameterize(mu, logvar, eps)
        h2, x_hat = self.decode(z)
        loss = self.loss(x, x_hat, mu, logvar, beta)

        dx_hat = [2 * (x_hat[i] - x[i]) / self.input_dim for i in range(self.input_dim)]

        d_w_out = [[dx_hat[j] * h2[k] for k in range(self.hidden_dim)] for j in range(self.input_dim)]
        d_b_out = dx_hat[:]
        d_h2 = [sum(dx_hat[j] * self.w_out[j][k] for j in range(self.input_dim)) for k in range(self.hidden_dim)]
        d_h2_pre = [d_h2[k] * _dsigmoid(h2[k]) for k in range(self.hidden_dim)]
        d_w2 = [[d_h2_pre[k] * z[l] for l in range(self.latent_dim)] for k in range(self.hidden_dim)]
        d_b2 = d_h2_pre[:]
        d_z = [sum(d_h2_pre[k] * self.w2[k][l] for k in range(self.hidden_dim)) for l in range(self.latent_dim)]

        d_mu = [d_z[i] + beta * mu[i] for i in range(self.latent_dim)]
        d_logvar = [
            d_z[i] * 0.5 * math.exp(0.5 * logvar[i]) * eps[i]
            + beta * 0.5 * (math.exp(logvar[i]) - 1)
            for i in range(self.latent_dim)
        ]

        d_h_pre = [
            (
                sum(d_mu[i] * self.w_mu[i][k] for i in range(self.latent_dim))
                + sum(d_logvar[i] * self.w_logvar[i][k] for i in range(self.latent_dim))
            )
            * _dsigmoid(h[k])
            for k in range(self.hidden_dim)
        ]
        d_w1 = [[d_h_pre[k] * x[j] for j in range(self.input_dim)] for k in range(self.hidden_dim)]
        d_b1 = d_h_pre[:]

        for j in range(self.input_dim):
            self.b_out[j] -= lr * d_b_out[j]
            for k in range(self.hidden_dim):
                self.w_out[j][k] -= lr * d_w_out[j][k]
        for k in range(self.hidden_dim):
            self.b2[k] -= lr * d_b2[k]
            for l in range(self.latent_dim):
                self.w2[k][l] -= lr * d_w2[k][l]
        for i in range(self.latent_dim):
            self.b_mu[i] -= lr * d_mu[i]
            self.b_logvar[i] -= lr * d_logvar[i]
            for k in range(self.hidden_dim):
                self.w_mu[i][k] -= lr * d_mu[i] * h[k]
                self.w_logvar[i][k] -= lr * d_logvar[i] * h[k]
        for k in range(self.hidden_dim):
            self.b1[k] -= lr * d_b1[k]
            for j in range(self.input_dim):
                self.w1[k][j] -= lr * d_w1[k][j]

        return loss

    def generate(self, n_samples: int = N_GENERATED) -> list[list[float]]:
        """Generate synthetic samples from the prior p(z) = N(0, I)."""
        generated: list[list[float]] = []
        for _ in range(n_samples):
            z = [_random_normal(self.rng) for _ in range(self.latent_dim)]
            _h2, x_hat = self.decode(z)
            generated.append(x_hat)
        return generated


class VAEResult:
    """Container for VAE analysis results."""

    def __init__(
        self,
        loss_history: list[float],
        kl_history: list[float],
        recon_history: list[float],
        latent_points: list[list[float]],
        generated: list[list[float]],
        recon_errors: list[float],
        mean_recon_error: float,
        anomaly_threshold: float,
        anomalies: list[dict],
        current_recon_error: float,
        is_current_anomaly: bool,
        signal: str,
        gen_mean: float,
        gen_std: float,
        n_windows: int,
        mean: float,
        std: float,
        latent_dim: int,
        hidden_dim: int,
    ) -> None:
        self.loss_history = loss_history
        self.kl_history = kl_history
        self.recon_history = recon_history
        self.latent_points = latent_points
        self.generated = generated
        self.recon_errors = recon_errors
        self.mean_recon_error = mean_recon_error
        self.anomaly_threshold = anomaly_threshold
        self.anomalies = anomalies
        self.current_recon_error = current_recon_error
        self.is_current_anomaly = is_current_anomaly
        self.signal = signal
        self.gen_mean = gen_mean
        self.gen_std = gen_std
        self.n_windows = n_windows
        self.mean = mean
        self.std = std
        self.latent_dim = latent_dim
        self.hidden_dim = hidden_dim


def _random_normal(rng: random.Random) -> float:
    """Box-Muller standard normal sample."""
    u = rng.random()
    while u == 0:
        u = rng.random()
    v = rng.random()
    while v == 0:
        v = rng.random()
    return math.sqrt(-2 * math.log(u)) * math.cos(2 * math.pi * v)


def _sigmoid(x: float) -> float:
    """Sigmoid activation."""
    return 1 / (1 + math.exp(-x))


def _dsigmoid(y: float) -> float:
    """Derivative of sigmoid: y * (1 - y)."""
    return y * (1 - y)


def _init_weights(in_dim: int, out_dim: int, rng: random.Random) -> list[list[float]]:
    """Uniform weight init with limit sqrt(6/(in+out))."""
    limit = math.sqrt(6 / (in_dim + out_dim))
    return [[(rng.random() * 2 - 1) * limit for _ in range(in_dim)] for _ in range(out_dim)]


def _init_bias(size: int) -> list[float]:
    """Zero bias vector."""
    return [0.0] * size


def vae_signal(is_anomaly: bool) -> str:
    """Signal: NORMAL or ANOMALY based on reconstruction error."""
    return "ANOMALY" if is_anomaly else "NORMAL"


def vae_analysis(
    prices: list[float],
    latent_dim: int = DEFAULT_LATENT_DIM,
    hidden_dim: int = DEFAULT_HIDDEN_DIM,
    beta: float = DEFAULT_BETA,
    lr: float = DEFAULT_LR,
    n_epochs: int = DEFAULT_EPOCHS,
    lookback: int = DEFAULT_LOOKBACK,
    window_size: int = DEFAULT_WINDOW,
    seed: int | None = None,
) -> VAEResult | None:
    """Full VAE analysis of a price series. None if insufficient data."""
    if not prices or len(prices) < lookback + 1:
        return None

    prices = prices[-lookback:]
    returns = [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]
    mean = sum(returns) / len(returns)
    std = math.sqrt(sum((r - mean) ** 2 for r in returns) / len(returns))
    norm_r = [(r - mean) / std if std > 0 else 0.0 for r in returns]

    windows = [norm_r[i : i + window_size] for i in range(0, len(norm_r) - window_size + 1)]
    if len(windows) < MIN_WINDOWS:
        return None

    vae = VAE(window_size, hidden_dim, latent_dim, seed=seed)

    loss_history: list[float] = []
    kl_history: list[float] = []
    recon_history: list[float] = []
    for _ in range(n_epochs):
        total_loss = 0.0
        total_kl = 0.0
        total_recon = 0.0
        for w in windows:
            loss = vae.train_step(w, lr, beta)
            total_loss += loss["total"]
            total_kl += loss["kl"]
            total_recon += loss["recon"]
        loss_history.append(total_loss / len(windows))
        kl_history.append(total_kl / len(windows))
        recon_history.append(total_recon / len(windows))

    latent_points = [vae.encode(w)[1] for w in windows]

    recon_errors: list[float] = []
    for w in windows:
        _h, _mu, _logvar, _z, _h2, x_hat = vae.forward(w)
        recon_errors.append(
            math.sqrt(sum((x_hat[i] - w[i]) ** 2 for i in range(window_size)) / window_size)
        )

    mean_recon_error = sum(recon_errors) / len(recon_errors)
    recon_std = math.sqrt(sum((e - mean_recon_error) ** 2 for e in recon_errors) / len(recon_errors))
    anomaly_threshold = mean_recon_error + 2 * recon_std
    anomalies = [
        {"idx": i, "error": e} for i, e in enumerate(recon_errors) if e > anomaly_threshold
    ]

    current_recon_error = recon_errors[-1]
    is_current_anomaly = current_recon_error > anomaly_threshold
    signal = vae_signal(is_current_anomaly)

    generated = vae.generate(N_GENERATED)
    gen_flat = [v for sample in generated for v in sample]
    gen_mean = sum(gen_flat) / len(gen_flat)
    gen_std = math.sqrt(sum((v - gen_mean) ** 2 for v in gen_flat) / len(gen_flat))

    return VAEResult(
        loss_history=loss_history,
        kl_history=kl_history,
        recon_history=recon_history,
        latent_points=latent_points,
        generated=generated,
        recon_errors=recon_errors,
        mean_recon_error=mean_recon_error,
        anomaly_threshold=anomaly_threshold,
        anomalies=anomalies,
        current_recon_error=current_recon_error,
        is_current_anomaly=is_current_anomaly,
        signal=signal,
        gen_mean=gen_mean,
        gen_std=gen_std,
        n_windows=len(windows),
        mean=mean,
        std=std,
        latent_dim=latent_dim,
        hidden_dim=hidden_dim,
    )
