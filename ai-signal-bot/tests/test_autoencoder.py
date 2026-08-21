"""Tests for Autoencoder anomaly detection model."""
import math

import pytest

from src.ml.autoencoder import (
    AutoencoderModel,
    AutoencoderResult,
    _dsigmoid,
    _sigmoid,
    autoencoder_analysis,
    autoencoder_signal,
    detect_anomalies,
    extract_ae_features,
    standardize,
    train_autoencoder,
)


def _candles(n=80, trend=0.0):
    """Synthetic candles with close/volume."""
    candles = []
    price = 100.0
    for i in range(n):
        price *= 1 + trend + 0.005 * (i % 5 - 2)
        candles.append({"close": price, "volume": 1000 + (i % 7) * 100})
    return candles


def _features(n=40, d=12):
    """Random standardized-like feature matrix."""
    return [[math.sin(i * 0.3 + j) * 0.5 for j in range(d)] for i in range(n)]


class TestActivations:
    def test_sigmoid_zero(self):
        assert _sigmoid(0.0) == pytest.approx(0.5)

    def test_sigmoid_positive(self):
        assert _sigmoid(5.0) == pytest.approx(1.0, abs=1e-2)

    def test_sigmoid_negative(self):
        assert _sigmoid(-5.0) == pytest.approx(0.0, abs=1e-2)

    def test_sigmoid_clamps_large(self):
        assert _sigmoid(1000.0) == pytest.approx(1.0)

    def test_dsigmoid(self):
        assert _dsigmoid(0.5) == pytest.approx(0.25)

    def test_dsigmoid_bounds(self):
        assert 0 <= _dsigmoid(0.9) <= 0.25


class TestExtractFeatures:
    def test_basic_extraction(self):
        features = extract_ae_features(_candles(80))
        assert len(features) == 60
        assert len(features[0]) == 12

    def test_insufficient_candles(self):
        assert extract_ae_features(_candles(10)) == []

    def test_volume_default(self):
        candles = [{"close": 100.0 + i} for i in range(25)]
        features = extract_ae_features(candles)
        assert len(features) == 5
        assert all(len(f) == 12 for f in features)

    def test_flat_prices_zero_vol(self):
        candles = [{"close": 100.0, "volume": 1000} for _ in range(30)]
        features = extract_ae_features(candles)
        assert len(features) == 10
        assert all(f[1] == pytest.approx(0.0) for f in features)


class TestStandardize:
    def test_zero_mean_unit_std(self):
        data, means, stds = standardize(_features(40))
        for j in range(12):
            col = [data[i][j] for i in range(40)]
            assert abs(sum(col) / 40) < 1e-9
            assert math.sqrt(sum(v * v for v in col) / 40) == pytest.approx(1.0, abs=1e-9)

    def test_constant_column_zero(self):
        features = [[1.0] * 12 for _ in range(10)]
        data, means, stds = standardize(features)
        assert all(v == 0.0 for row in data for v in row)

    def test_means_stds_lengths(self):
        data, means, stds = standardize(_features(40))
        assert len(means) == 12
        assert len(stds) == 12


class TestTrainAutoencoder:
    def test_basic_training(self):
        model = train_autoencoder(_features(40), 12, 4, epochs=50, seed=42)
        assert isinstance(model, AutoencoderModel)
        assert model.hidden_dim == 4

    def test_deterministic_with_seed(self):
        a = train_autoencoder(_features(40), 12, 4, epochs=50, seed=7)
        b = train_autoencoder(_features(40), 12, 4, epochs=50, seed=7)
        assert a.losses == b.losses
        assert a.recon_errors == b.recon_errors

    def test_loss_decreases(self):
        model = train_autoencoder(_features(40), 12, 4, epochs=100, seed=42)
        assert model.losses[-1] < model.losses[0]

    def test_invalid_input_returns_none(self):
        assert train_autoencoder([], 12, 4) is None

    def test_invalid_dims_returns_none(self):
        assert train_autoencoder(_features(40), 0, 4) is None

    def test_zero_epochs_returns_none(self):
        assert train_autoencoder(_features(40), 12, 4, epochs=0) is None

    def test_reconstruction_error_small(self):
        model = train_autoencoder(_features(40), 12, 4, epochs=200, seed=42)
        assert model.recon_errors[-1] < 1.0

    def test_latent_dim_matches(self):
        model = train_autoencoder(_features(40), 12, 4, epochs=50, seed=42)
        assert len(model.latent) == 40
        assert all(len(h) == 4 for h in model.latent)

    def test_losses_length(self):
        model = train_autoencoder(_features(40), 12, 4, epochs=30, seed=42)
        assert len(model.losses) == 30

    def test_weight_shapes(self):
        model = train_autoencoder(_features(40), 12, 4, epochs=50, seed=42)
        assert len(model.we) == 4
        assert len(model.we[0]) == 12
        assert len(model.wd) == 12
        assert len(model.wd[0]) == 4


class TestDetectAnomalies:
    def test_basic_detection(self):
        errors = [0.1, 0.12, 0.09, 0.11, 0.1, 0.5]
        detection = detect_anomalies(errors, threshold_sigma=2.0)
        assert detection["is_anomaly"] is True
        assert len(detection["anomalies"]) >= 1

    def test_no_anomalies(self):
        errors = [0.1, 0.11, 0.09, 0.1]
        detection = detect_anomalies(errors, threshold_sigma=2.0)
        assert detection["is_anomaly"] is False
        assert detection["anomalies"] == []

    def test_empty_returns_defaults(self):
        detection = detect_anomalies([])
        assert detection["mean_err"] == 0.0
        assert detection["is_anomaly"] is False

    def test_threshold_above_mean(self):
        errors = [0.1, 0.11, 0.09, 0.1]
        detection = detect_anomalies(errors, threshold_sigma=2.0)
        assert detection["threshold"] > detection["mean_err"]

    def test_constant_errors_zero_std(self):
        detection = detect_anomalies([0.1] * 10)
        assert detection["std_err"] == pytest.approx(0.0)
        assert detection["z_score"] == pytest.approx(0.0)


class TestAutoencoderSignal:
    def test_normal(self):
        assert autoencoder_signal(False, 1.0) == "NORMAL"

    def test_warning(self):
        assert autoencoder_signal(True, 2.5) == "WARNING"

    def test_anomaly(self):
        assert autoencoder_signal(True, 3.5) == "ANOMALY"

    def test_anomaly_boundary(self):
        assert autoencoder_signal(True, 3.0) == "WARNING"


class TestAutoencoderAnalysis:
    def test_basic_analysis(self):
        result = autoencoder_analysis(_candles(80), seed=42)
        assert isinstance(result, AutoencoderResult)
        assert result.input_dim == 12

    def test_insufficient_candles_returns_none(self):
        assert autoencoder_analysis(_candles(20)) is None

    def test_empty_returns_none(self):
        assert autoencoder_analysis([]) is None

    def test_signal_in_set(self):
        result = autoencoder_analysis(_candles(80), seed=42)
        assert result.signal in {"NORMAL", "WARNING", "ANOMALY"}

    def test_current_error_positive(self):
        result = autoencoder_analysis(_candles(80), seed=42)
        assert result.current_error > 0

    def test_anomaly_threshold_positive(self):
        result = autoencoder_analysis(_candles(80), seed=42)
        assert result.anomaly_threshold > 0

    def test_custom_hidden_dim(self):
        result = autoencoder_analysis(_candles(80), hidden_dim=6, seed=42)
        assert result.model.hidden_dim == 6

    def test_losses_decreasing(self):
        result = autoencoder_analysis(_candles(80), seed=42)
        assert result.model.losses[-1] < result.model.losses[0]
