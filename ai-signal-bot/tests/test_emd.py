"""Tests for Empirical Mode Decomposition (EMD) + HHT model."""
import math

import pytest

from src.technical_analysis.emd import (
    EMDResult,
    _find_maxima,
    _find_minima,
    cubic_spline,
    emd,
    emd_analysis,
    emd_signal,
    hilbert_transform,
    sift,
)


def _signal(n=64):
    """Synthetic signal with multiple frequency components."""
    return [math.sin(i * 0.3) * 2 + math.sin(i * 0.9) * 0.5 for i in range(n)]


class TestCubicSpline:
    def test_linear_case(self):
        assert cubic_spline([0, 1], [0, 2], 0.5) == pytest.approx(1.0)

    def test_interpolates_points(self):
        xs = [0.0, 1.0, 2.0, 3.0]
        ys = [0.0, 1.0, 0.0, 1.0]
        assert cubic_spline(xs, ys, 1.0) == pytest.approx(1.0, abs=1e-6)

    def test_single_point(self):
        assert cubic_spline([1.0], [5.0], 2.0) == pytest.approx(5.0)

    def test_smooth_curve(self):
        xs = [0.0, 1.0, 2.0, 3.0, 4.0]
        ys = [0.0, 1.0, 4.0, 9.0, 16.0]
        assert cubic_spline(xs, ys, 2.5) == pytest.approx(6.25, abs=0.5)


class TestExtrema:
    def test_find_maxima(self):
        maxima = _find_maxima([0.0, 1.0, 0.0, 1.0, 0.0])
        assert len(maxima) == 2
        assert all(m["value"] == 1.0 for m in maxima)

    def test_find_minima(self):
        minima = _find_minima([1.0, 0.0, 1.0, 0.0, 1.0])
        assert len(minima) == 2
        assert all(m["value"] == 0.0 for m in minima)

    def test_monotonic_no_internal_extrema(self):
        signal = [float(i) for i in range(10)]
        assert _find_maxima(signal) == []
        assert _find_minima(signal) == []


class TestSift:
    def test_basic_sift(self):
        imf = sift(_signal(64), max_iter=30)
        assert len(imf) == 64

    def test_imf_has_zero_mean(self):
        imf = sift(_signal(64), max_iter=50)
        assert abs(sum(imf) / len(imf)) < 0.5

    def test_constant_signal(self):
        imf = sift([1.0] * 32, max_iter=10)
        assert len(imf) == 32


class TestEMD:
    def test_basic_decomposition(self):
        result = emd(_signal(64), max_imfs=4, max_iter=30)
        assert len(result["imfs"]) >= 1
        assert len(result["residue"]) == 64

    def test_imfs_length(self):
        result = emd(_signal(64), max_imfs=4, max_iter=30)
        assert all(len(imf) == 64 for imf in result["imfs"])

    def test_reconstruction(self):
        signal = _signal(64)
        result = emd(signal, max_imfs=5, max_iter=50)
        reconstructed = [0.0] * 64
        for imf in result["imfs"]:
            for i in range(64):
                reconstructed[i] += imf[i]
        for i in range(64):
            reconstructed[i] += result["residue"][i]
        assert reconstructed == pytest.approx(signal, abs=1e-6)

    def test_deterministic(self):
        a = emd(_signal(64), max_imfs=4)
        b = emd(_signal(64), max_imfs=4)
        assert a["imfs"] == b["imfs"]


class TestHilbertTransform:
    def test_basic_transform(self):
        result = hilbert_transform(_signal(64))
        assert len(result["amplitude"]) == 64
        assert len(result["phase"]) == 64
        assert len(result["frequency"]) == 64

    def test_amplitude_positive(self):
        result = hilbert_transform(_signal(64))
        assert all(a >= 0 for a in result["amplitude"])

    def test_phase_in_range(self):
        result = hilbert_transform(_signal(64))
        assert all(-math.pi <= p <= math.pi for p in result["phase"])

    def test_zero_signal(self):
        result = hilbert_transform([0.0] * 32)
        assert all(a == pytest.approx(0.0) for a in result["amplitude"])


class TestEMDSignal:
    def test_buy(self):
        signal, reason = emd_signal(1.0, 1.0)
        assert signal == "BUY"

    def test_sell(self):
        signal, reason = emd_signal(-1.0, -1.0)
        assert signal == "SELL"

    def test_neutral_mixed(self):
        signal, reason = emd_signal(1.0, -1.0)
        assert signal == "NEUTRAL"


class TestEMDAnalysis:
    def test_basic_analysis(self):
        result = emd_analysis([100.0 + v for v in _signal(64)])
        assert isinstance(result, EMDResult)
        assert result.n == 64

    def test_insufficient_prices_returns_none(self):
        assert emd_analysis([100.0] * 16) is None

    def test_empty_returns_none(self):
        assert emd_analysis([]) is None

    def test_signal_in_set(self):
        result = emd_analysis([100.0 + v for v in _signal(64)])
        assert result.sig_dir in {"BUY", "SELL", "NEUTRAL"}

    def test_imfs_count(self):
        result = emd_analysis([100.0 + v for v in _signal(64)], max_imfs=4)
        assert len(result.imfs) <= 4

    def test_energy_pct_sums_to_100(self):
        result = emd_analysis([100.0 + v for v in _signal(64)])
        assert sum(result.energy_pct) == pytest.approx(100.0, abs=1.0)

    def test_dominant_idx_in_range(self):
        result = emd_analysis([100.0 + v for v in _signal(64)])
        assert 0 <= result.dominant_idx < len(result.imfs)

    def test_mean_freqs_non_negative(self):
        result = emd_analysis([100.0 + v for v in _signal(64)])
        assert all(f >= 0 for f in result.mean_freqs)

    def test_hht_length(self):
        result = emd_analysis([100.0 + v for v in _signal(64)])
        assert len(result.hht) == len(result.imfs)

    def test_residue_length(self):
        result = emd_analysis([100.0 + v for v in _signal(64)])
        assert len(result.residue) == 64
