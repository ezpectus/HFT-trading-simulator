"""Tests for Bayesian Price Predictor model."""
import math

import pytest

from src.technical_analysis.bayesian_price import (
    BayesianPriceResult,
    bayesian_price_analysis,
    bayesian_ridge,
    bayesian_signal,
    beta_cdf_inv,
    beta_pdf,
    bocpd,
    log_gamma,
    normal_pdf,
)


def _prices(n=60, trend=0.0):
    """Synthetic price series."""
    prices = [100.0]
    for i in range(1, n):
        prices.append(prices[-1] * (1 + trend + 0.005 * (i % 5 - 2)))
    return prices


class TestDistributions:
    def test_log_gamma_positive(self):
        assert log_gamma(5.0) == pytest.approx(math.log(24.0), rel=1e-6)

    def test_log_gamma_one(self):
        assert log_gamma(1.0) == pytest.approx(0.0, abs=1e-8)

    def test_beta_pdf_peak(self):
        pdf_mid = beta_pdf(0.5, 5.0, 5.0)
        pdf_edge = beta_pdf(0.1, 5.0, 5.0)
        assert pdf_mid > pdf_edge

    def test_beta_pdf_bounds(self):
        assert beta_pdf(0.0, 2.0, 2.0) == 0.0
        assert beta_pdf(1.0, 2.0, 2.0) == 0.0

    def test_beta_cdf_inv_median(self):
        value = beta_cdf_inv(0.5, 5.0, 5.0)
        assert value == pytest.approx(0.5, abs=0.02)

    def test_beta_cdf_inv_bounds(self):
        assert beta_cdf_inv(0.0, 2.0, 2.0) == 0.0
        assert beta_cdf_inv(1.0, 2.0, 2.0) == 1.0

    def test_normal_pdf_peak(self):
        assert normal_pdf(0.0, 0.0, 1.0) == pytest.approx(1 / math.sqrt(2 * math.pi))

    def test_normal_pdf_zero_sigma(self):
        assert normal_pdf(0.0, 0.0, 0.0) == 0.0


class TestBOCPD:
    def test_insufficient_data(self):
        result = bocpd([0.01] * 4)
        assert result["changepoints"] == []

    def test_flat_returns_no_changepoints(self):
        result = bocpd([0.001] * 50)
        assert result["changepoints"] == []

    def test_volatility_shift_detects_changepoint(self):
        returns = [0.001] * 30 + [0.05, -0.04, 0.06, -0.05, 0.04, -0.06, 0.05, -0.04]
        result = bocpd(returns, hazard=0.01)
        assert len(result["changepoints"]) >= 1

    def test_run_lengths_length(self):
        result = bocpd([0.001] * 30, hazard=0.01)
        assert len(result["run_lengths"]) == 30


class TestBayesianRidge:
    def test_insufficient_data(self):
        result = bayesian_ridge([[1.0, 0.1]] * 3, [0.1] * 3)
        assert result["weights"] == [0.0, 0.0]

    def test_basic_fit(self):
        x = [[1.0, float(i)] for i in range(20)]
        y = [2.0 + 3.0 * i for i in range(20)]
        result = bayesian_ridge(x, y, n_iter=50)
        assert result["weights"][1] == pytest.approx(3.0, abs=0.5)

    def test_predictions_length(self):
        x = [[1.0, float(i)] for i in range(20)]
        y = [2.0 + 3.0 * i for i in range(20)]
        result = bayesian_ridge(x, y)
        assert len(result["predictions"]) == 20

    def test_sigma_positive(self):
        x = [[1.0, float(i)] for i in range(20)]
        y = [2.0 + 3.0 * i for i in range(20)]
        result = bayesian_ridge(x, y)
        assert result["sigma"] > 0

    def test_weights_finite(self):
        x = [[1.0, float(i)] for i in range(20)]
        y = [2.0 + 3.0 * i for i in range(20)]
        result = bayesian_ridge(x, y)
        assert all(math.isfinite(w) for w in result["weights"])


class TestBayesianSignal:
    def test_buy(self):
        signal, reason = bayesian_signal(0.7, 0.3, 0.001)
        assert signal == "BUY"

    def test_sell(self):
        signal, reason = bayesian_signal(0.3, 0.7, -0.001)
        assert signal == "SELL"

    def test_neutral_uncertain(self):
        signal, reason = bayesian_signal(0.5, 0.5, 0.001)
        assert signal == "NEUTRAL"

    def test_buy_requires_positive_pred(self):
        signal, reason = bayesian_signal(0.7, 0.3, -0.001)
        assert signal == "NEUTRAL"


class TestBayesianPriceAnalysis:
    def test_basic_analysis(self):
        result = bayesian_price_analysis(_prices(60))
        assert isinstance(result, BayesianPriceResult)

    def test_insufficient_prices_returns_none(self):
        assert bayesian_price_analysis(_prices(20)) is None

    def test_empty_returns_none(self):
        assert bayesian_price_analysis([]) is None

    def test_p_up_in_unit_interval(self):
        result = bayesian_price_analysis(_prices(60))
        assert 0 < result.p_up < 1
        assert result.p_up + result.p_down == pytest.approx(1.0)

    def test_ci_bounds(self):
        result = bayesian_price_analysis(_prices(60))
        assert 0 < result.ci_low < result.ci_high < 1

    def test_post_mean_finite(self):
        result = bayesian_price_analysis(_prices(60))
        assert math.isfinite(result.post_mean)
        assert result.post_std >= 0

    def test_signal_in_set(self):
        result = bayesian_price_analysis(_prices(60))
        assert result.signal in {"BUY", "SELL", "NEUTRAL"}

    def test_next_pred_finite(self):
        result = bayesian_price_analysis(_prices(60))
        assert math.isfinite(result.next_pred)

    def test_predicted_price_positive(self):
        result = bayesian_price_analysis(_prices(60))
        assert result.predicted_price > 0
        assert result.predicted_low < result.predicted_high

    def test_r_squared_bounded(self):
        result = bayesian_price_analysis(_prices(60))
        assert result.r_squared <= 1.0

    def test_weights_length(self):
        result = bayesian_price_analysis(_prices(60))
        assert len(result.weights) == 5

    def test_changepoints_list(self):
        result = bayesian_price_analysis(_prices(60))
        assert isinstance(result.changepoints, list)

    def test_trending_prices_buy_signal(self):
        result = bayesian_price_analysis(_prices(60, trend=0.01))
        assert result.p_up > 0.5

    def test_custom_params(self):
        result = bayesian_price_analysis(_prices(60), prior_strength=5, lookback=10, hazard_rate=50)
        assert result.alpha > 0
        assert result.beta > 0
