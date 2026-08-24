"""Tests for Wavelet Decomposition (MRA) model."""
import math

import pytest

from src.technical_analysis.wavelet import (
    WaveletResult,
    denoise,
    dwt,
    idwt,
    mra_reconstruct,
    reconstruct,
    wavelet_analysis,
    wavelet_decompose,
    wavelet_signal,
    wavelet_variance,
)


def _signal(n=64):
    """Smooth trend + noise test signal."""
    return [100.0 + i * 0.5 + math.sin(i * 0.3) for i in range(n)]


class TestDWT:
    def test_haar_halves_length(self):
        approx, detail = dwt(_signal(64))
        assert len(approx) == 32
        assert len(detail) == 32

    def test_db4_halves_length(self):
        approx, detail = dwt(_signal(64), wavelet="db4")
        assert len(approx) == 32
        assert len(detail) == 32

    def test_roundtrip_haar(self):
        signal = _signal(64)
        approx, detail = dwt(signal)
        recon = idwt(approx, detail)
        assert recon == pytest.approx(signal, abs=1e-9)

    def test_roundtrip_db4(self):
        signal = _signal(64)
        approx, detail = dwt(signal, wavelet="db4")
        recon = idwt(approx, detail, wavelet="db4")
        assert recon == pytest.approx(signal, abs=1e-9)

    def test_constant_signal_zero_detail(self):
        approx, detail = dwt([5.0] * 64)
        assert all(v == pytest.approx(0.0, abs=1e-9) for v in detail)
        assert all(v == pytest.approx(5.0 * math.sqrt(2), abs=1e-9) for v in approx)

    def test_empty_signal(self):
        approx, detail = dwt([])
        assert approx == []
        assert detail == []


class TestWaveletDecompose:
    def test_basic_decompose(self):
        decomp = wavelet_decompose(_signal(64), levels=4)
        assert decomp["levels"] == 4
        assert len(decomp["details"]) == 4
        assert len(decomp["approx"]) == 4

    def test_levels_capped_by_log2(self):
        decomp = wavelet_decompose(_signal(64), levels=10)
        assert decomp["levels"] == 6

    def test_short_signal(self):
        decomp = wavelet_decompose(_signal(8), levels=4)
        assert decomp["levels"] >= 1

    def test_db4_wavelet(self):
        decomp = wavelet_decompose(_signal(64), levels=3, wavelet="db4")
        assert decomp["levels"] == 3


class TestMRAReconstruct:
    def test_component_count(self):
        decomp = wavelet_decompose(_signal(64), levels=4)
        components = mra_reconstruct(decomp, 64)
        assert len(components) == 5  # Trend + 4 details

    def test_trend_length_matches_original(self):
        decomp = wavelet_decompose(_signal(64), levels=4)
        components = mra_reconstruct(decomp, 64)
        assert len(components[0]["data"]) == 64

    def test_components_sum_to_original(self):
        signal = _signal(64)
        decomp = wavelet_decompose(signal, levels=4)
        components = mra_reconstruct(decomp, 64)
        total = [0.0] * 64
        for comp in components:
            for i, v in enumerate(comp["data"]):
                total[i] += v
        assert total == pytest.approx(signal, abs=1e-6)

    def test_component_names(self):
        decomp = wavelet_decompose(_signal(64), levels=3)
        components = mra_reconstruct(decomp, 64)
        assert components[0]["name"] == "Trend"
        assert [c["name"] for c in components[1:]] == ["D1", "D2", "D3"]


class TestWaveletVariance:
    def test_variance_length(self):
        decomp = wavelet_decompose(_signal(64), levels=4)
        variances = wavelet_variance(decomp)
        assert len(variances) == 5

    def test_variance_non_negative(self):
        decomp = wavelet_decompose(_signal(64), levels=4)
        variances = wavelet_variance(decomp)
        assert all(v >= 0 for v in variances)

    def test_constant_signal_zero_variance(self):
        decomp = wavelet_decompose([5.0] * 64, levels=4)
        variances = wavelet_variance(decomp)
        assert all(v == pytest.approx(0.0, abs=1e-9) for v in variances)


class TestDenoise:
    def test_zero_threshold_no_change(self):
        decomp = wavelet_decompose(_signal(64), levels=3)
        result = denoise(decomp, 0.0)
        assert result["details"] == decomp["details"]

    def test_high_threshold_zeroes_details(self):
        decomp = wavelet_decompose(_signal(64), levels=3)
        result = denoise(decomp, 1e9)
        assert all(all(v == 0.0 for v in d) for d in result["details"])

    def test_soft_threshold_reduces_magnitude(self):
        decomp = wavelet_decompose(_signal(64), levels=3)
        result = denoise(decomp, 0.5)
        for orig, new in zip(decomp["details"][0], result["details"][0], strict=False):
            assert abs(new) <= abs(orig)


class TestReconstruct:
    def test_roundtrip(self):
        signal = _signal(64)
        decomp = wavelet_decompose(signal, levels=4)
        recon = reconstruct(decomp)
        assert recon == pytest.approx(signal, abs=1e-9)

    def test_denoised_reconstruction_smoother(self):
        noisy = [100.0 + i * 0.5 + (i % 3 - 1) * 2.0 for i in range(64)]
        decomp = wavelet_decompose(noisy, levels=3)
        clean = reconstruct(denoise(decomp, 1.0))
        noisy_recon = reconstruct(decomp)
        clean_vol = _volatility(clean)
        noisy_vol = _volatility(noisy_recon)
        assert clean_vol < noisy_vol


def _volatility(values):
    mean = sum(values) / len(values)
    return math.sqrt(sum((v - mean) ** 2 for v in values) / len(values))


class TestWaveletAnalysis:
    def test_basic_analysis(self):
        result = wavelet_analysis(_signal(64))
        assert isinstance(result, WaveletResult)
        assert result.levels == 4
        assert result.wavelet == "haar"

    def test_insufficient_data_returns_none(self):
        assert wavelet_analysis([100.0] * 10) is None

    def test_empty_returns_none(self):
        assert wavelet_analysis([]) is None

    def test_denoised_signal_length(self):
        result = wavelet_analysis(_signal(64))
        assert len(result.denoised_signal) == 64

    def test_snr_finite(self):
        result = wavelet_analysis(_signal(64))
        assert math.isfinite(result.snr)

    def test_energy_pct_sums_to_100(self):
        result = wavelet_analysis(_signal(64))
        assert sum(result.energy_pct) == pytest.approx(100.0, abs=1.0)

    def test_db4_wavelet(self):
        result = wavelet_analysis(_signal(64), wavelet="db4")
        assert result.wavelet == "db4"
        assert len(result.components) == 5

    def test_threshold_denoising(self):
        result = wavelet_analysis(_signal(64), threshold=1.0)
        assert len(result.denoised_signal) == 64

    def test_current_prices(self):
        signal = _signal(64)
        result = wavelet_analysis(signal)
        assert result.current_price == pytest.approx(signal[-1])


class TestWaveletSignal:
    def test_buy(self):
        signal, reason = wavelet_signal(1.0, 10.0)
        assert signal == "BUY"
        assert "SNR" in reason

    def test_sell(self):
        signal, reason = wavelet_signal(-1.0, 10.0)
        assert signal == "SELL"

    def test_hold_on_noise(self):
        signal, reason = wavelet_signal(1.0, 0.5)
        assert signal == "HOLD"

    def test_neutral_marginal(self):
        signal, reason = wavelet_signal(1.0, 2.0)
        assert signal == "NEUTRAL"

    def test_zero_slope_neutral(self):
        signal, reason = wavelet_signal(0.0, 5.0)
        assert signal == "NEUTRAL"
