"""Tests for Variational Autoencoder (VAE) model."""
import math

import pytest

from src.ml.vae import (
    VAE,
    VAEResult,
    _random_normal,
    _sigmoid,
    vae_analysis,
    vae_signal,
)


def _prices(n=80):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


class TestVAEInit:
    def test_weight_shapes(self):
        vae = VAE(8, 8, 2, seed=42)
        assert len(vae.w1) == 8
        assert len(vae.w1[0]) == 8
        assert len(vae.w_mu) == 2
        assert len(vae.w_mu[0]) == 8
        assert len(vae.w_out) == 8
        assert len(vae.w_out[0]) == 8

    def test_weights_within_init_bounds(self):
        vae = VAE(8, 8, 2, seed=42)
        limit_w1 = math.sqrt(6 / 16)  # sqrt(6/(in+out)) for 8->8
        limit_w_mu = math.sqrt(6 / 10)  # for 8->2
        assert all(abs(w) <= limit_w1 for row in vae.w1 for w in row)
        assert all(abs(w) <= limit_w_mu for row in vae.w_mu for w in row)
        assert any(w != 0.0 for row in vae.w1 for w in row)  # not all-zero init

    def test_deterministic_init_with_seed(self):
        a = VAE(8, 8, 2, seed=7)
        b = VAE(8, 8, 2, seed=7)
        assert a.w1 == b.w1
        assert a.w_mu == b.w_mu

    def test_different_seeds_differ(self):
        a = VAE(8, 8, 2, seed=7)
        b = VAE(8, 8, 2, seed=8)
        assert a.w1 != b.w1

    def test_biases_zero(self):
        vae = VAE(8, 8, 2, seed=42)
        assert vae.b1 == [0.0] * 8
        assert vae.b_mu == [0.0] * 2


class TestVAEOps:
    def test_encode_shapes(self):
        vae = VAE(8, 8, 2, seed=42)
        h, mu, logvar = vae.encode([0.1] * 8)
        assert len(h) == 8
        assert len(mu) == 2
        assert len(logvar) == 2

    def test_encode_hidden_is_sigmoid_bounded(self):
        vae = VAE(8, 8, 2, seed=42)
        h, mu, logvar = vae.encode([0.1] * 8)
        assert all(0.0 < v < 1.0 for v in h)
        assert all(math.isfinite(v) for v in mu + logvar)

    def test_decode_shapes(self):
        vae = VAE(8, 8, 2, seed=42)
        h2, x_hat = vae.decode([0.1, -0.1])
        assert len(h2) == 8
        assert len(x_hat) == 8

    def test_decode_hidden_is_sigmoid_bounded(self):
        vae = VAE(8, 8, 2, seed=42)
        h2, x_hat = vae.decode([0.1, -0.1])
        assert all(0.0 < v < 1.0 for v in h2)
        assert all(math.isfinite(v) for v in x_hat)

    def test_forward_returns_all(self):
        vae = VAE(8, 8, 2, seed=42)
        h, mu, logvar, z, h2, x_hat = vae.forward([0.1] * 8)
        assert len(z) == 2
        assert len(x_hat) == 8
        assert all(math.isfinite(v) for v in z + x_hat)

    def test_reparameterize_exact(self):
        vae = VAE(8, 8, 2, seed=42)
        # z = mu + exp(0.5*logvar) * eps — fully deterministic with injected eps
        z = vae.reparameterize([1.0, -1.0], [0.0, 0.0], eps=[0.5, -0.5])
        assert z == [1.5, -1.5]
        # logvar = ln(4) -> std = 2
        z2 = vae.reparameterize([0.0, 0.0], [math.log(4.0), math.log(4.0)], eps=[1.0, -0.5])
        assert z2 == pytest.approx([2.0, -1.0])

    def test_loss_components(self):
        vae = VAE(8, 8, 2, seed=42)
        loss = vae.loss([0.1] * 8, [0.2] * 8, [0.0, 0.0], [0.0, 0.0], beta=1.0)
        # recon = MSE = (0.2-0.1)^2 = 0.01; KL(mu=0,logvar=0) = 0 exactly
        assert loss["recon"] == pytest.approx(0.01)
        assert loss["kl"] == pytest.approx(0.0)
        assert loss["total"] == pytest.approx(loss["recon"] + loss["kl"])

    def test_loss_kl_nonzero_for_nonstandard_prior(self):
        vae = VAE(8, 8, 2, seed=42)
        loss = vae.loss([0.1] * 8, [0.1] * 8, [1.0, 0.0], [0.0, 0.0], beta=1.0)
        # KL for mu=[1,0]: -0.5*(1+0-1-1) + 0 = 0.5
        assert loss["kl"] == pytest.approx(0.5)

    def test_loss_zero_recon(self):
        vae = VAE(8, 8, 2, seed=42)
        loss = vae.loss([0.1] * 8, [0.1] * 8, [0.0, 0.0], [0.0, 0.0])
        assert loss["recon"] == pytest.approx(0.0)

    def test_generate_shape(self):
        vae = VAE(8, 8, 2, seed=42)
        generated = vae.generate(10)
        assert len(generated) == 10
        assert all(len(sample) == 8 for sample in generated)
        assert all(math.isfinite(v) for s in generated for v in s)

    def test_generate_deterministic_with_seed(self):
        a = VAE(8, 8, 2, seed=7).generate(5)
        b = VAE(8, 8, 2, seed=7).generate(5)
        assert a == b


class TestVAETraining:
    def test_training_reduces_recon_loss(self):
        vae = VAE(8, 8, 2, seed=42)
        windows = [[math.sin(i * 0.3 + j) * 0.5 for j in range(8)] for i in range(20)]
        losses = []
        for _ in range(100):
            total = 0.0
            for w in windows:
                total += vae.train_step(w, 0.01, 0.1)["recon"]
            losses.append(total / len(windows))
        assert losses[-1] < losses[0]

    def test_deterministic_training_with_seed(self):
        windows = [[math.sin(i * 0.3 + j) * 0.5 for j in range(8)] for i in range(20)]
        a = VAE(8, 8, 2, seed=7)
        b = VAE(8, 8, 2, seed=7)
        for _ in range(10):
            for w in windows:
                a.train_step(w, 0.01, 1.0)
                b.train_step(w, 0.01, 1.0)
        assert a.w1 == b.w1
        assert a.w_out == b.w_out

    def test_train_step_returns_loss(self):
        vae = VAE(8, 8, 2, seed=42)
        loss = vae.train_step([0.1] * 8, 0.01, 1.0)
        assert set(loss.keys()) == {"total", "recon", "kl"}


class TestHelpers:
    def test_sigmoid(self):
        assert _sigmoid(0.0) == pytest.approx(0.5)
        assert _sigmoid(10.0) == pytest.approx(1.0, abs=1e-4)
        assert _sigmoid(-10.0) == pytest.approx(0.0, abs=1e-4)
        # symmetry: sigmoid(x) + sigmoid(-x) == 1
        for x in (0.3, 1.7, 4.2):
            assert _sigmoid(x) + _sigmoid(-x) == pytest.approx(1.0)

    def test_random_normal_distribution(self):
        import random as _random

        rng = _random.Random(42)
        samples = [_random_normal(rng) for _ in range(2000)]
        mean = sum(samples) / len(samples)
        variance = sum((s - mean) ** 2 for s in samples) / len(samples)
        assert abs(mean) < 0.1
        assert variance == pytest.approx(1.0, abs=0.1)


class TestVaeAnalysis:
    def test_basic_analysis(self):
        result = vae_analysis(_prices(80), seed=42)
        assert isinstance(result, VAEResult)
        assert result.latent_dim == 2
        assert result.hidden_dim == 8

    def test_insufficient_prices_returns_none(self):
        assert vae_analysis(_prices(30)) is None

    def test_empty_returns_none(self):
        assert vae_analysis([]) is None

    def test_signal_in_set(self):
        result = vae_analysis(_prices(80), seed=42)
        assert result.signal in {"NORMAL", "ANOMALY"}

    def test_loss_history_length(self):
        result = vae_analysis(_prices(80), n_epochs=20, seed=42)
        assert len(result.loss_history) == 20
        assert len(result.kl_history) == 20
        assert len(result.recon_history) == 20
        assert all(math.isfinite(v) for v in result.loss_history)

    def test_n_windows_matches_formula(self):
        result = vae_analysis(_prices(80), seed=42)
        # windows = lookback-1 returns -> (60-1) - 8 + 1 = 52
        assert result.n_windows == 52

    def test_recon_errors_positive(self):
        result = vae_analysis(_prices(80), seed=42)
        assert all(e >= 0 for e in result.recon_errors)
        assert len(result.recon_errors) == result.n_windows

    def test_latent_points_shape(self):
        result = vae_analysis(_prices(80), seed=42)
        assert all(len(p) == 2 for p in result.latent_points)
        assert len(result.latent_points) == result.n_windows
        assert all(math.isfinite(v) for p in result.latent_points for v in p)

    def test_generated_shape(self):
        result = vae_analysis(_prices(80), seed=42)
        assert len(result.generated) == 100
        assert all(len(sample) == 8 for sample in result.generated)
        assert all(math.isfinite(v) for s in result.generated for v in s)

    def test_anomaly_threshold_formula(self):
        result = vae_analysis(_prices(80), seed=42)
        # threshold = mean(recon_errors) + 2*std(recon_errors)
        mean = sum(result.recon_errors) / len(result.recon_errors)
        std = math.sqrt(sum((e - mean) ** 2 for e in result.recon_errors) / len(result.recon_errors))
        assert result.mean_recon_error == pytest.approx(mean)
        assert result.anomaly_threshold == pytest.approx(mean + 2 * std)

    def test_anomalies_all_exceed_threshold(self):
        result = vae_analysis(_prices(80), seed=42)
        for a in result.anomalies:
            assert a["error"] > result.anomaly_threshold
            assert result.recon_errors[a["idx"]] == pytest.approx(a["error"])

    def test_current_recon_error_is_last(self):
        result = vae_analysis(_prices(80), seed=42)
        assert result.current_recon_error == pytest.approx(result.recon_errors[-1])
        assert result.is_current_anomaly == (result.current_recon_error > result.anomaly_threshold)
        assert result.signal == ("ANOMALY" if result.is_current_anomaly else "NORMAL")

    def test_deterministic_with_seed(self):
        a = vae_analysis(_prices(80), seed=7)
        b = vae_analysis(_prices(80), seed=7)
        assert a.loss_history == b.loss_history
        assert a.recon_errors == b.recon_errors

    def test_gen_stats_finite(self):
        result = vae_analysis(_prices(80), seed=42)
        assert math.isfinite(result.gen_mean)
        assert math.isfinite(result.gen_std)

    def test_custom_params(self):
        result = vae_analysis(_prices(80), latent_dim=3, hidden_dim=12, beta=0.5, seed=42)
        assert result.latent_dim == 3
        assert result.hidden_dim == 12
        assert all(len(p) == 3 for p in result.latent_points)

    def test_recon_history_decreases(self):
        result = vae_analysis(_prices(80), n_epochs=50, seed=42)
        assert result.recon_history[-1] < result.recon_history[0]


class TestVaeSignal:
    def test_normal(self):
        assert vae_signal(False) == "NORMAL"

    def test_anomaly(self):
        assert vae_signal(True) == "ANOMALY"
