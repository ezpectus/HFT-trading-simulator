"""Kalman Filter — 1D and 2D implementations for price filtering.

1D: state = price, observation = price + noise
2D: state = [position, velocity], constant velocity model

Ported from UI-only KalmanFilterPrice.jsx into trading logic.
Reference: future_development.md §0.1 — high priority model.
"""
from __future__ import annotations

try:
    import numpy as np
    _HAS_NUMPY = True
except ImportError:
    _HAS_NUMPY = False

NAN = float("nan")

DEFAULT_PROCESS_NOISE = 1e-5
DEFAULT_MEASUREMENT_NOISE = 1e-3
DEFAULT_INITIAL_VARIANCE = 1.0


class KalmanFilter1D:
    """1D Kalman filter for price estimation.

    Predict:  x_hat = x_hat, P = P + Q
    Update:   K = P / (P + R), x_hat += K * (z - x_hat), P = (1 - K) * P
    """

    def __init__(
        self,
        process_noise: float = DEFAULT_PROCESS_NOISE,
        measurement_noise: float = DEFAULT_MEASUREMENT_NOISE,
        initial_estimate: float = 0.0,
        initial_variance: float = DEFAULT_INITIAL_VARIANCE,
    ) -> None:
        self.x = initial_estimate
        self.p = initial_variance
        self.q = process_noise
        self.r = measurement_noise
        self.k = 0.0

    def update(self, measurement: float) -> float:
        """Process a new measurement and return the updated estimate."""
        self.p = self.p + self.q
        self.k = self.p / (self.p + self.r) if (self.p + self.r) != 0 else 0.0
        self.x = self.x + self.k * (measurement - self.x)
        self.p = (1 - self.k) * self.p
        return self.x

    def filter(self, measurements: list[float]) -> list[float]:
        """Run the filter over a list of measurements."""
        return [self.update(m) for m in measurements]


class KalmanFilter2D:
    """2D Kalman filter with constant velocity model.

    State: [position, velocity]
    Transition: F = [[1, dt], [0, 1]]
    Observation: H = [[1, 0]] (observe position only)
    """

    def __init__(
        self,
        process_noise: float = DEFAULT_PROCESS_NOISE,
        measurement_noise: float = DEFAULT_MEASUREMENT_NOISE,
        dt: float = 1.0,
    ) -> None:
        self.x = [0.0, 0.0]
        self.P = [[1.0, 0.0], [0.0, 1.0]]
        self.Q = [[process_noise * dt, 0.0], [0.0, process_noise * dt]]
        self.R = measurement_noise
        self.F = [[1.0, dt], [0.0, 1.0]]

    def update(self, measurement: float) -> tuple[float, float]:
        """Process a new measurement, return (estimate, velocity)."""
        # Predict
        x0 = self.F[0][0] * self.x[0] + self.F[0][1] * self.x[1]
        x1 = self.F[1][0] * self.x[0] + self.F[1][1] * self.x[1]
        self.x = [x0, x1]

        dt = self.F[0][1]
        p00, p01 = self.P[0][0], self.P[0][1]
        p10, p11 = self.P[1][0], self.P[1][1]
        self.P = [
            [p00 + dt * p10 + dt * (p01 + dt * p11) + self.Q[0][0], p01 + dt * p11 + self.Q[0][1]],
            [p10 + dt * p11 + self.Q[1][0], p11 + self.Q[1][1]],
        ]

        # Update
        s = self.P[0][0] + self.R
        k0 = self.P[0][0] / s if s != 0 else 0.0
        k1 = self.P[1][0] / s if s != 0 else 0.0
        y = measurement - self.x[0]
        self.x = [self.x[0] + k0 * y, self.x[1] + k1 * y]
        self.P = [
            [(1 - k0) * self.P[0][0], (1 - k0) * self.P[0][1]],
            [(1 - k1) * self.P[1][0], (1 - k1) * self.P[1][1]],
        ]
        return self.x[0], self.x[1]

    def filter(self, measurements: list[float]) -> list[tuple[float, float]]:
        """Run the filter over a list of measurements."""
        return [self.update(m) for m in measurements]


def kalman_filter_1d(
    prices: list[float],
    process_noise: float = DEFAULT_PROCESS_NOISE,
    measurement_noise: float = DEFAULT_MEASUREMENT_NOISE,
) -> list[float]:
    """Apply 1D Kalman filter to a price list."""
    if not prices:
        return []
    kf = KalmanFilter1D(
        process_noise=process_noise,
        measurement_noise=measurement_noise,
        initial_estimate=prices[0],
    )
    return kf.filter(prices)


def kalman_filter_2d(
    prices: list[float],
    process_noise: float = DEFAULT_PROCESS_NOISE,
    measurement_noise: float = DEFAULT_MEASUREMENT_NOISE,
    dt: float = 1.0,
) -> list[tuple[float, float]]:
    """Apply 2D Kalman filter to a price list, return (estimate, velocity) pairs."""
    if not prices:
        return []
    kf = KalmanFilter2D(
        process_noise=process_noise,
        measurement_noise=measurement_noise,
        dt=dt,
    )
    kf.x[0] = prices[0]
    return kf.filter(prices)
