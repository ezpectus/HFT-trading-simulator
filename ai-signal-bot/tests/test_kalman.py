"""Tests for Kalman Filter implementations."""
import math

import pytest

from src.technical_analysis.kalman import (
    KalmanFilter1D,
    KalmanFilter2D,
    kalman_filter_1d,
    kalman_filter_2d,
)


class TestKalmanFilter1D:
    def test_empty_input_returns_empty(self):
        result = kalman_filter_1d([])
        assert result == []

    def test_single_element_returns_estimate(self):
        result = kalman_filter_1d([100.0])
        assert len(result) == 1
        assert isinstance(result[0], float)

    def test_constant_prices_converge_to_value(self):
        prices = [50.0] * 100
        result = kalman_filter_1d(prices)
        assert result[-1] == pytest.approx(50.0, abs=0.01)

    def test_noisy_prices_smooth_toward_true(self):
        true_price = 100.0
        noisy = [100.0, 98.0, 102.0, 99.0, 101.0, 97.0, 103.0, 100.0, 98.0, 102.0]
        result = kalman_filter_1d(noisy, process_noise=1e-5, measurement_noise=1e-3)
        assert len(result) == len(noisy)
        assert abs(result[-1] - true_price) < 5.0

    def test_filter_class_update_returns_float(self):
        kf = KalmanFilter1D(initial_estimate=50.0)
        result = kf.update(52.0)
        assert isinstance(result, float)
        assert 50.0 < result < 52.0

    def test_filter_class_gain_decreases_with_constant_input(self):
        kf = KalmanFilter1D(initial_estimate=100.0)
        gains = []
        for _ in range(50):
            kf.update(100.0)
            gains.append(kf.k)
        assert gains[-1] < gains[0]

    def test_nan_measurement_propagates(self):
        kf = KalmanFilter1D(initial_estimate=50.0)
        result = kf.update(float("nan"))
        assert math.isnan(result)

    def test_custom_parameters(self):
        kf = KalmanFilter1D(
            process_noise=0.1,
            measurement_noise=0.5,
            initial_estimate=30.0,
            initial_variance=2.0,
        )
        result = kf.update(35.0)
        assert 30.0 < result < 35.0


class TestKalmanFilter2D:
    def test_empty_input_returns_empty(self):
        result = kalman_filter_2d([])
        assert result == []

    def test_single_element_returns_tuple(self):
        result = kalman_filter_2d([100.0])
        assert len(result) == 1
        assert isinstance(result[0], tuple)
        assert len(result[0]) == 2

    def test_constant_prices_zero_velocity(self):
        prices = [50.0] * 100
        result = kalman_filter_2d(prices)
        estimate, velocity = result[-1]
        assert estimate == pytest.approx(50.0, abs=0.1)
        assert abs(velocity) < 1.0

    def test_trending_prices_positive_velocity(self):
        prices = [100.0 + i * 0.5 for i in range(50)]
        result = kalman_filter_2d(prices)
        estimate, velocity = result[-1]
        assert velocity > 0
        assert estimate > 100.0

    def test_filter_class_update_returns_tuple(self):
        kf = KalmanFilter2D()
        kf.x[0] = 50.0
        estimate, velocity = kf.update(52.0)
        assert isinstance(estimate, float)
        assert isinstance(velocity, float)

    def test_custom_parameters(self):
        kf = KalmanFilter2D(
            process_noise=0.01,
            measurement_noise=0.1,
            dt=2.0,
        )
        kf.x[0] = 100.0
        estimate, velocity = kf.update(105.0)
        assert 100.0 < estimate < 105.0

    def test_decreasing_prices_negative_velocity(self):
        prices = [100.0 - i * 0.5 for i in range(50)]
        result = kalman_filter_2d(prices)
        _, velocity = result[-1]
        assert velocity < 0
