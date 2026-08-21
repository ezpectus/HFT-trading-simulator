"""Tests for Empirical Dynamic Modeling (EDM) / CCM model."""
import math

import pytest

from src.research.ccm import (
    EDMResult,
    ccm,
    edm_analysis,
    edm_ccm_analysis,
    edm_signal,
    embed,
    false_nearest_neighbors,
    mutual_info,
    simplex_forecast,
)


def _returns(n=100):
    """Synthetic return series."""
    return [math.sin(i * 0.3) * 0.01 + (i % 5 - 2) * 0.002 for i in range(n)]


def _coupled_returns(n=150, lag=1):
    """Y depends on X's past (causal link X -> Y)."""
    x = [math.sin(i * 0.2) * 0.01 for i in range(n)]
    y = [0.0] * n
    for i in range(lag, n):
        y[i] = 0.7 * x[i - lag] + 0.3 * math.cos(i * 0.4) * 0.01
    return x, y


class TestMutualInfo:
    def test_basic(self):
        result = mutual_info(_returns(100), max_tau=10)
        assert len(result["mis"]) == 10
        assert 1 <= result["opt_tau"] <= 10

    def test_constant_series_zero_mi(self):
        result = mutual_info([0.01] * 100, max_tau=5)
        assert all(mi == 0.0 for mi in result["mis"])

    def test_opt_tau_positive(self):
        result = mutual_info(_returns(100), max_tau=15)
        assert result["opt_tau"] >= 1


class TestFalseNearestNeighbors:
    def test_basic(self):
        result = false_nearest_neighbors(_returns(100), tau=2, max_e=8)
        assert len(result["fnn_ratios"]) == 8
        assert 1 <= result["opt_e"] <= 8

    def test_ratios_in_unit_interval(self):
        result = false_nearest_neighbors(_returns(100), tau=2, max_e=8)
        assert all(0 <= r <= 1 for r in result["fnn_ratios"])


class TestEmbed:
    def test_shape(self):
        embedded = embed(_returns(50), e=3, tau=2)
        assert len(embedded) == 50 - 2 * 2
        assert all(len(v) == 3 for v in embedded)

    def test_values_preserved(self):
        x = [float(i) for i in range(10)]
        embedded = embed(x, e=2, tau=1)
        assert embedded[0] == [0.0, 1.0]
        assert embedded[1] == [1.0, 2.0]


class TestSimplexForecast:
    def test_basic_forecast(self):
        x = _returns(100)
        pred = simplex_forecast(x, e=3, tau=2, t_pred=80, lib_size=70)
        assert pred is not None
        assert math.isfinite(pred)

    def test_invalid_t_pred_returns_none(self):
        x = _returns(100)
        assert simplex_forecast(x, e=3, tau=2, t_pred=200, lib_size=70) is None

    def test_forecast_reasonable(self):
        x = _returns(100)
        pred = simplex_forecast(x, e=3, tau=2, t_pred=85, lib_size=75)
        assert pred is not None
        assert abs(pred) < 0.1


class TestCCM:
    def test_basic_ccm(self):
        x, y = _coupled_returns(150)
        results = ccm(x, y, e=3, tau=2, lib_sizes=[30, 50, 70])
        assert len(results) > 0
        assert all("lib_size" in r and "rho" in r for r in results)

    def test_causal_link_positive_rho(self):
        x, y = _coupled_returns(150)
        results = ccm(x, y, e=3, tau=2, lib_sizes=[50, 70, 90])
        assert results[-1]["rho"] > 0

    def test_rho_bounded(self):
        x, y = _coupled_returns(150)
        results = ccm(x, y, e=3, tau=2, lib_sizes=[50, 70])
        assert all(-1 <= r["rho"] <= 1 for r in results)

    def test_convergence_with_library_size(self):
        x, y = _coupled_returns(200)
        results = ccm(x, y, e=3, tau=2, lib_sizes=[40, 80, 120])
        assert results[-1]["rho"] >= results[0]["rho"] - 0.2


class TestEDMSignal:
    def test_buy(self):
        signal, reason = edm_signal(0.005)
        assert signal == "BUY"

    def test_sell(self):
        signal, reason = edm_signal(-0.005)
        assert signal == "SELL"

    def test_neutral(self):
        signal, reason = edm_signal(0.001)
        assert signal == "NEUTRAL"

    def test_boundary_buy(self):
        signal, reason = edm_signal(0.002)
        assert signal == "NEUTRAL"


class TestEDMAnalysis:
    def test_basic_analysis(self):
        result = edm_analysis(_returns(100))
        assert isinstance(result, EDMResult)
        assert result.opt_tau >= 1
        assert result.opt_e >= 1

    def test_insufficient_returns_returns_none(self):
        assert edm_analysis(_returns(20)) is None

    def test_empty_returns_none(self):
        assert edm_analysis([]) is None

    def test_forecasts_length(self):
        result = edm_analysis(_returns(100), forecast_steps=5)
        assert len(result.forecasts) <= 5

    def test_forecast_rho_finite(self):
        result = edm_analysis(_returns(100))
        assert math.isfinite(result.forecast_rho)

    def test_signal_in_set(self):
        result = edm_analysis(_returns(100))
        assert result.signal in {"BUY", "SELL", "NEUTRAL"}

    def test_mis_length(self):
        result = edm_analysis(_returns(100), max_tau=10)
        assert len(result.mis) == 10

    def test_fnn_ratios_length(self):
        result = edm_analysis(_returns(100), max_e=6)
        assert len(result.fnn_ratios) == 6

    def test_ccm_none_by_default(self):
        result = edm_analysis(_returns(100))
        assert result.ccm_results is None


class TestEDMCCMAnalysis:
    def test_basic_ccm_analysis(self):
        x, y = _coupled_returns(150)
        result = edm_ccm_analysis(x, y)
        assert result is not None
        assert len(result["results"]) > 0
        assert result["opt_e"] >= 1
        assert result["opt_tau"] >= 1

    def test_insufficient_returns_none(self):
        assert edm_ccm_analysis(_returns(20), _returns(20)) is None

    def test_empty_returns_none(self):
        assert edm_ccm_analysis([], []) is None

    def test_custom_lib_sizes(self):
        x, y = _coupled_returns(150)
        result = edm_ccm_analysis(x, y, lib_sizes=[40, 60])
        assert len(result["results"]) == 2
