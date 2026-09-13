// Kalman filters: 1D (price smoothing) and 2D (position+velocity).
// Extracted from KalmanFilterPrice.jsx — shared by the component and its tests.

// 1D Kalman Filter — state = price, observation = price + noise
// Predict:  x̂⁻ = x̂,  P⁻ = P + Q
// Update:   K = P⁻ / (P⁻ + R),  x̂ = x̂⁻ + K·(z - x̂⁻),  P = (1 - K)·P⁻
// Q = process noise (model uncertainty), R = measurement noise (sensor uncertainty)
// K → 0: trust model, K → 1: trust measurement
// Posterior variance: P = (1-K)·P⁻ (always decreases after update)
export class KalmanFilter1D {
  constructor({ processNoise = 1e-5, measurementNoise = 1e-3, initialEstimate = 0, initialVariance = 1 } = {}) {
    this.x = initialEstimate
    this.p = initialVariance
    this.q = processNoise
    this.r = measurementNoise
    this.k = 0
    this.gainHistory = []
    this.estimateHistory = []
    this.varianceHistory = []
  }

  update(measurement) {
    this.p = this.p + this.q
    this.k = this.p / (this.p + this.r)
    this.x = this.x + this.k * (measurement - this.x)
    this.p = (1 - this.k) * this.p

    this.gainHistory.push(this.k)
    this.estimateHistory.push(this.x)
    this.varianceHistory.push(this.p)

    if (this.gainHistory.length > 200) {
      this.gainHistory.shift()
      this.estimateHistory.shift()
      this.varianceHistory.shift()
    }

    return this.x
  }
}

// 2D Kalman Filter — state = [position, velocity], constant velocity model
// State transition: F = [[1, dt], [0, 1]]  (x_{t+1} = x_t + v_t·dt)
// Observation: H = [[1, 0]]  (observe position only)
// Predict:  x̂⁻ = F·x̂,  P⁻ = F·P·Fᵀ + Q
// Update:   S = H·P⁻·Hᵀ + R,  K = P⁻·Hᵀ·S⁻¹
//           x̂ = x̂⁻ + K·(z - H·x̂⁻),  P = (I - K·H)·P⁻
export class KalmanFilter2D {
  constructor({ processNoise = 1e-5, measurementNoise = 1e-3, dt = 1 } = {}) {
    this.x = [0, 0]
    this.P = [[1, 0], [0, 1]]
    this.Q = [[processNoise * dt, 0], [0, processNoise * dt]]
    this.R = [[measurementNoise, 0], [0, measurementNoise]]
    this.F = [[1, dt], [0, 1]]
    this.H = [[1, 0]]
    this.estimateHistory = []
    this.velocityHistory = []
  }

  update(measurement) {
    this.x = [
      this.F[0][0] * this.x[0] + this.F[0][1] * this.x[1],
      this.F[1][0] * this.x[0] + this.F[1][1] * this.x[1],
    ]

    const dt = this.F[0][1]
    const p00 = this.P[0][0], p01 = this.P[0][1], p10 = this.P[1][0], p11 = this.P[1][1]
    this.P = [
      [p00 + dt*p10 + dt*(p01 + dt*p11) + this.Q[0][0], p01 + dt*p11 + this.Q[0][1]],
      [p10 + dt*p11 + this.Q[1][0], p11 + this.Q[1][1]],
    ]

    const S = this.H[0][0] * this.P[0][0] * this.H[0][0] + this.R[0][0]
    const K = [this.P[0][0] * this.H[0][0] / S, this.P[1][0] * this.H[0][0] / S]

    const y = measurement - (this.H[0][0] * this.x[0])

    this.x = [this.x[0] + K[0] * y, this.x[1] + K[1] * y]

    this.P = [
      [(1 - K[0] * this.H[0][0]) * this.P[0][0], (1 - K[0] * this.H[0][0]) * this.P[0][1]],
      [(1 - K[1] * this.H[0][0]) * this.P[1][0], (1 - K[1] * this.H[0][0]) * this.P[1][1]],
    ]

    this.estimateHistory.push(this.x[0])
    this.velocityHistory.push(this.x[1])

    if (this.estimateHistory.length > 200) {
      this.estimateHistory.shift()
      this.velocityHistory.shift()
    }

    return { estimate: this.x[0], velocity: this.x[1] }
  }
}
