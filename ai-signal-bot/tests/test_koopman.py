"""Tests for Koopman Operator (EDMD) model."""
import math

import pytest

from src.research.koopman import (
    KoopmanResult,
    compute_returns,
    dictionary,
    edmd,
    koopman_analysis,
    koopman_signal,
    power_iteration,
)


def _prices(n=120):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


class TestDictionary:
    def test_constant_feature(self):
        features = dictionary(0.5, max_poly=2, n_fourier=3)
        assert features[0] == pytest.approx(1.0)

    def test_polynomial_features(self):
        features = dictionary(2.0, max_poly=2, n_fourier=0)
        assert features == pytest.approx([1.0, 2.0, 4.0])

    def test_fourier_features(self):
        features = dictionary(0.0, max_poly=1, n_fourier=1)
        assert features[2] == pytest.approx(0.0)  # sin(0)
        assert features[3] == pytest.approx(1.0)  # cos(0)

    def test_dimension(self):
        features = dictionary(0.5, max_poly=2, n_fourier=3)
        assert len(features) == 1 + 2 + 2 * 3


class TestEDMD:
    def test_linear_dynamics_recovery(self):
        # x_{t+1} = 0.5 * x_t (linear)
        states = [float(i) * 0.1 for i in range(50)]
        next_states = [0.5 * s for s in states]
        result = edmd(states, next_states, lambda x: dictionary(x, 1, 0))
        # K should map x -> 0.5x: K[1][1] ≈ 0.5
        assert result["K"][1][1] == pytest.approx(0.5, abs=0.05)

    def test_dim_matches(self):
        states = [float(i) * 0.1 for i in range(30)]
        next_states = states[1:] + [0.0]
        result = edmd(states, next_states, lambda x: dictionary(x, 2, 2))
        assert result["dim"] == 1 + 2 + 4

    def test_psi_length(self):
        states = [float(i) * 0.1 for i in range(30)]
        next_states = states[1:] + [0.0]
        result = edmd(states, next_states, lambda x: dictionary(x, 1, 0))
        assert len(result["Psi"]) == 30


class TestPowerIteration:
    def test_diagonal_matrix(self):
        m = [[3.0, 0.0], [0.0, 1.0]]
        result = power_iteration(m, seed=42)
        assert result["eigenvalue"] == pytest.approx(3.0, abs=0.1)

    def test_deterministic_with_seed(self):
        m = [[2.0, 1.0], [1.0, 2.0]]
        a = power_iteration(m, seed=7)
        b = power_iteration(m, seed=7)
        assert a["eigenvalue"] == b["eigenvalue"]

    def test_eigenvector_unit_norm(self):
        m = [[2.0, 1.0], [1.0, 2.0]]
        result = power_iteration(m, seed=42)
        norm = math.sqrt(sum(v * v for v in result["eigenvector"]))
        assert norm == pytest.approx(1.0)


class TestKoopmanSignal:
    def test_persistent(self):
        signal, reason = koopman_signal(0.98, 0.0)
        assert signal == "PERSISTENT_DYNAMICS"

    def test_fast_decay(self):
        signal, reason = koopman_signal(0.3, 0.0)
        assert signal == "FAST_DECAY"

    def test_moderate(self):
        signal, reason = koopman_signal(0.7, 0.0)
        assert signal == "NEUTRAL"

    def test_bullish(self):
        signal, reason = koopman_signal(0.7, 0.005)
        assert signal == "BULLISH"

    def test_bearish_persistent(self):
        signal, reason = koopman_signal(0.98, -0.005)
        assert signal == "BEARISH_PERSISTENT"

    def test_boundary_persistent(self):
        signal, reason = koopman_signal(0.95, 0.0)
        assert signal == "NEUTRAL"


class TestKoopmanAnalysis:
    def test_basic_analysis(self):
        result = koopman_analysis(_prices(120), seed=42)
        assert isinstance(result, KoopmanResult)
        assert result.dim > 0

    def test_insufficient_prices_returns_none(self):
        assert koopman_analysis(_prices(30)) is None

    def test_empty_returns_none(self):
        assert koopman_analysis([]) is None

    def test_eigenvalues_list(self):
        result = koopman_analysis(_prices(120), seed=42)
        assert len(result.eigenvalues) >= 1

    def test_forecasts_length(self):
        result = koopman_analysis(_prices(120), forecast_steps=10, seed=42)
        assert len(result.forecasts) == 10

    def test_recon_error_non_negative(self):
        result = koopman_analysis(_prices(120), seed=42)
        assert result.recon_error >= 0

    def test_dominant_modulus_bounded(self):
        result = koopman_analysis(_prices(120), seed=42)
        assert 0 <= result.dominant_modulus <= 1.5

    def test_signal_in_set(self):
        result = koopman_analysis(_prices(120), seed=42)
        assert result.signal in {
            "PERSISTENT_DYNAMICS", "FAST_DECAY", "NEUTRAL",
            "BULLISH", "BEARISH", "BULLISH_PERSISTENT", "BEARISH_PERSISTENT",
        }

    def test_deterministic_with_seed(self):
        a = koopman_analysis(_prices(120), seed=7)
        b = koopman_analysis(_prices(120), seed=7)
        assert a.forecasts == b.forecasts
        assert a.dominant_modulus == b.dominant_modulus

    def test_custom_dictionary(self):
        result = koopman_analysis(_prices(120), max_poly=3, n_fourier=4, seed=42)
        assert result.dim == 1 + 3 + 8

    def test_actual_returns_length(self):
        result = koopman_analysis(_prices(120), forecast_steps=5, seed=42)
        assert len(result.actual_returns) == 5

    def test_forecasts_finite(self):
        result = koopman_analysis(_prices(120), seed=42)
        assert all(math.isfinite(f) for f in result.forecasts)
