"""Tests for Variational Mode Decomposition (VMD) model."""
import math

import pytest

from src.technical_analysis.vmd import (
    VMDResult,
    _fft,
    _ifft,
    vmd,
    vmd_analysis,
    vmd_signal,
)


def _prices(n=64):
    """Synthetic price series with multiple frequency components."""
    return [100.0 + math.sin(i * 0.2) * 5 + math.sin(i * 0.7) * 2 + i * 0.05 for i in range(n)]


class TestFFT:
    def test_fft_length_power_of_two(self):
        result = _fft([1.0, 2.0, 3.0])
        assert len(result) == 4

    def test_fft_dc_component(self):
        result = _fft([1.0, 1.0, 1.0, 1.0])
        assert result[0].real == pytest.approx(4.0)

    def test_ifft_roundtrip(self):
        signal = [math.sin(i * 0.3) for i in range(16)]
        spectrum = _fft(signal)
        recon = _ifft(spectrum[: len(signal)])
        assert recon == pytest.approx(signal, abs=1e-6)


class TestVMD:
    def test_basic_decomposition(self):
        result = vmd(_prices(64), k=3, max_iter=30)
        assert len(result["modes"]) == 3
        assert len(result["energies"]) == 3
        assert len(result["center_freqs"]) == 3

    def test_modes_length(self):
        result = vmd(_prices(64), k=3, max_iter=30)
        assert all(len(m["signal"]) == 64 for m in result["modes"])

    def test_residual_length(self):
        result = vmd(_prices(64), k=3, max_iter=30)
        assert len(result["residual"]) == 64

    def test_energy_pct_sums_to_100(self):
        result = vmd(_prices(64), k=3, max_iter=30)
        assert sum(result["energy_pct"]) == pytest.approx(100.0, abs=1.0)

    def test_center_freqs_in_unit_interval(self):
        result = vmd(_prices(64), k=3, max_iter=30)
        assert all(0 <= f <= 0.5 for f in result["center_freqs"])

    def test_omega_history(self):
        result = vmd(_prices(64), k=3, max_iter=30)
        assert len(result["omega_history"]) >= 1
        assert len(result["omega_history"][0]) == 3

    def test_n_iter_positive(self):
        result = vmd(_prices(64), k=3, max_iter=30)
        assert result["n_iter"] > 0

    def test_reconstruction_approximates_signal(self):
        result = vmd(_prices(64), k=4, max_iter=50)
        reconstructed = [0.0] * 64
        for mode in result["modes"]:
            for i in range(64):
                reconstructed[i] += mode["signal"][i]
        residual_energy = sum((_prices(64)[i] - reconstructed[i]) ** 2 for i in range(64)) / 64
        assert residual_energy < 10.0

    def test_deterministic(self):
        a = vmd(_prices(64), k=3, max_iter=20)
        b = vmd(_prices(64), k=3, max_iter=20)
        assert a["center_freqs"] == b["center_freqs"]
        assert a["energies"] == b["energies"]


class TestVMDSignal:
    def test_buy(self):
        signal, reason = vmd_signal(1.0, 1.0)
        assert signal == "BUY"

    def test_sell(self):
        signal, reason = vmd_signal(-1.0, -1.0)
        assert signal == "SELL"

    def test_neutral_mixed(self):
        signal, reason = vmd_signal(1.0, -1.0)
        assert signal == "NEUTRAL"

    def test_neutral_flat(self):
        signal, reason = vmd_signal(0.0, 0.0)
        assert signal == "NEUTRAL"


class TestVMDAnalysis:
    def test_basic_analysis(self):
        result = vmd_analysis(_prices(64))
        assert isinstance(result, VMDResult)
        assert result.n == 64

    def test_insufficient_prices_returns_none(self):
        assert vmd_analysis(_prices(16)) is None

    def test_empty_returns_none(self):
        assert vmd_analysis([]) is None

    def test_signal_in_set(self):
        result = vmd_analysis(_prices(64))
        assert result.sig_dir in {"BUY", "SELL", "NEUTRAL"}

    def test_dominant_mode_in_range(self):
        result = vmd_analysis(_prices(64), k=4)
        assert 0 <= result.dominant_mode < 4

    def test_trend_idx_in_range(self):
        result = vmd_analysis(_prices(64), k=4)
        assert 0 <= result.trend_idx < 4

    def test_modes_count(self):
        result = vmd_analysis(_prices(64), k=5)
        assert len(result.modes) == 5

    def test_center_freqs_length(self):
        result = vmd_analysis(_prices(64), k=4)
        assert len(result.center_freqs) == 4

    def test_residual_finite(self):
        result = vmd_analysis(_prices(64))
        assert all(math.isfinite(v) for v in result.residual)

    def test_custom_alpha(self):
        result = vmd_analysis(_prices(64), alpha=5000, max_iter=30)
        assert len(result.modes) == 4

    def test_energy_pct_positive(self):
        result = vmd_analysis(_prices(64))
        assert all(e >= 0 for e in result.energy_pct)
