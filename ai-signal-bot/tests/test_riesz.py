"""Tests for Riesz Representation model."""
import math

import pytest

from src.research.riesz import (
    RieszResult,
    compute_returns,
    riesz_analysis,
    riesz_representer,
    riesz_signal,
)


def _prices(n=150):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + 0.005 * (i % 5 - 2)))
    return prices


def _identity_data(n_features=3):
    """X = identity, y = ones → K = I/n, L = 1/n."""
    x = [[1.0 if i == j else 0.0 for j in range(n_features)] for i in range(n_features)]
    y = [1.0] * n_features
    return x, y


class TestComputeReturns:
    def test_basic(self):
        returns = compute_returns([100.0, 110.0, 121.0])
        assert returns == pytest.approx([0.1, 0.1])

    def test_single_pair(self):
        returns = compute_returns([100.0, 105.0])
        assert returns == pytest.approx([0.05])

    def test_negative_returns(self):
        returns = compute_returns([100.0, 90.0])
        assert returns == pytest.approx([-0.1])


class TestRieszRepresenter:
    def test_length(self):
        x, y = _identity_data()
        u = riesz_representer(x, y, 0.1)
        assert len(u) == 3

    def test_identity_solution(self):
        # K = I/3, L = 1/3 → u_i = (1/3)/(1/3 + λ)
        x, y = _identity_data()
        u = riesz_representer(x, y, 0.1)
        expected = (1 / 3) / (1 / 3 + 0.1)
        assert u[0] == pytest.approx(expected)
        assert u[1] == pytest.approx(expected)
        assert u[2] == pytest.approx(expected)

    def test_zero_x_zero_u(self):
        x = [[0.0, 0.0], [0.0, 0.0]]
        y = [1.0, 1.0]
        u = riesz_representer(x, y, 0.1)
        assert u == pytest.approx([0.0, 0.0])

    def test_lambda_shrinkage(self):
        x, y = _identity_data()
        u_low = riesz_representer(x, y, 0.001)
        u_high = riesz_representer(x, y, 10.0)
        norm_low = math.sqrt(sum(v * v for v in u_low))
        norm_high = math.sqrt(sum(v * v for v in u_high))
        assert norm_high < norm_low

    def test_deterministic(self):
        x, y = _identity_data()
        assert riesz_representer(x, y, 0.1) == riesz_representer(x, y, 0.1)

    def test_finite(self):
        x, y = _identity_data()
        u = riesz_representer(x, y, 0.1)
        assert all(math.isfinite(v) for v in u)

    def test_zero_lambda_identity(self):
        # λ=0 with identity-like K: u = L/K_diag
        x = [[1.0, 0.0], [0.0, 2.0]]
        y = [2.0, 4.0]
        u = riesz_representer(x, y, 0.0)
        # K = [[1/2, 0], [0, 4/2=2]], L = [2/2, 8/2] = [1, 4]
        assert u[0] == pytest.approx(1.0 / 0.5)
        assert u[1] == pytest.approx(4.0 / 2.0)


class TestRieszSignal:
    def test_long(self):
        signal, reason = riesz_signal(0.005)
        assert signal == "RIESZ_LONG"

    def test_short(self):
        signal, reason = riesz_signal(-0.005)
        assert signal == "RIESZ_SHORT"

    def test_neutral(self):
        signal, reason = riesz_signal(0.0)
        assert signal == "NEUTRAL"

    def test_boundary_long(self):
        signal, reason = riesz_signal(0.002)
        assert signal == "NEUTRAL"

    def test_boundary_short(self):
        signal, reason = riesz_signal(-0.002)
        assert signal == "NEUTRAL"


class TestRieszAnalysis:
    def test_basic_analysis(self):
        result = riesz_analysis(_prices(150))
        assert isinstance(result, RieszResult)

    def test_insufficient_prices_returns_none(self):
        assert riesz_analysis(_prices(30)) is None

    def test_empty_returns_none(self):
        assert riesz_analysis([]) is None

    def test_signal_in_set(self):
        result = riesz_analysis(_prices(150))
        assert result.signal in {"RIESZ_LONG", "RIESZ_SHORT", "NEUTRAL"}

    def test_u_length(self):
        result = riesz_analysis(_prices(150))
        assert len(result.u) == 8

    def test_feature_importance_length(self):
        result = riesz_analysis(_prices(150))
        assert len(result.feature_importance) == 8

    def test_feature_importance_lags(self):
        result = riesz_analysis(_prices(150))
        lags = [f["lag"] for f in result.feature_importance]
        assert lags == [1, 2, 3, 4, 5, 6, 7, 8]

    def test_norm_sum_to_one(self):
        result = riesz_analysis(_prices(150))
        assert sum(f["norm"] for f in result.feature_importance) == pytest.approx(1.0)

    def test_riesz_norm_finite(self):
        result = riesz_analysis(_prices(150))
        assert math.isfinite(result.riesz_norm)

    def test_l_values_non_empty(self):
        result = riesz_analysis(_prices(150))
        assert len(result.l_values) > 0

    def test_l_values_length(self):
        result = riesz_analysis(_prices(150))
        assert len(result.l_values) == 119 - 8

    def test_correlation_in_range(self):
        result = riesz_analysis(_prices(150))
        assert -1.0 <= result.correlation <= 1.0

    def test_current_l_finite(self):
        result = riesz_analysis(_prices(150))
        assert math.isfinite(result.current_l)

    def test_dominant_lag_in_range(self):
        result = riesz_analysis(_prices(150))
        assert 1 <= result.dominant["lag"] <= 8

    def test_dominant_norm_positive(self):
        result = riesz_analysis(_prices(150))
        assert result.dominant["norm"] > 0

    def test_custom_n_features(self):
        result = riesz_analysis(_prices(150), n_features=5)
        assert len(result.u) == 5
        assert len(result.feature_importance) == 5

    def test_custom_lambda(self):
        result = riesz_analysis(_prices(150), lambda_=1.0)
        assert math.isfinite(result.riesz_norm)

    def test_deterministic(self):
        r1 = riesz_analysis(_prices(150))
        r2 = riesz_analysis(_prices(150))
        assert r1.u == pytest.approx(r2.u)
        assert r1.current_l == pytest.approx(r2.current_l)

    def test_weights_signed(self):
        result = riesz_analysis(_prices(150))
        assert any(f["weight"] != 0 for f in result.feature_importance)
