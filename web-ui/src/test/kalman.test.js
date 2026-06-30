/**
 * Tests for Kalman Filter (1D and 2D).
 * Tests the core algorithm extracted from KalmanFilterPrice.jsx.
 */
import { describe, it, expect } from 'vitest'

// 1D Kalman Filter — extracted from KalmanFilterPrice.jsx
class KalmanFilter1D {
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
    return this.x
  }
}

// 2D Kalman Filter — extracted from KalmanFilterPrice.jsx
class KalmanFilter2D {
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
    this.P = [
      [this.F[0][0] * this.P[0][0] + this.F[0][1] * this.P[1][0] + this.Q[0][0],
       this.F[0][0] * this.P[0][1] + this.F[0][1] * this.P[1][1] + this.Q[0][1]],
      [this.F[1][0] * this.P[0][0] + this.F[1][1] * this.P[1][0] + this.Q[1][0],
       this.F[1][0] * this.P[0][1] + this.F[1][1] * this.P[1][1] + this.Q[1][1]],
    ]
    const S = this.H[0][0] * this.P[0][0] * this.H[0][0] + this.R[0][0]
    const K = [this.P[0][0] * this.H[0][0] / S, this.P[1][0] * this.H[0][0] / S]
    const innovation = measurement - (this.H[0][0] * this.x[0])
    this.x[0] += K[0] * innovation
    this.x[1] += K[1] * innovation
    this.P = [
      [this.P[0][0] - K[0] * this.H[0][0] * this.P[0][0],
       this.P[0][1] - K[0] * this.H[0][0] * this.P[0][1]],
      [this.P[1][0] - K[1] * this.H[0][0] * this.P[0][0],
       this.P[1][1] - K[1] * this.H[0][0] * this.P[0][1]],
    ]
    this.estimateHistory.push(this.x[0])
    this.velocityHistory.push(this.x[1])
    return this.x[0]
  }
}

describe('KalmanFilter1D', () => {
  it('initializes with given parameters', () => {
    const kf = new KalmanFilter1D({ initialEstimate: 100, initialVariance: 10 })
    expect(kf.x).toBe(100)
    expect(kf.p).toBe(10)
  })

  it('updates estimate towards measurement', () => {
    const kf = new KalmanFilter1D({ initialEstimate: 100, measurementNoise: 1 })
    kf.update(110)
    expect(kf.x).toBeGreaterThan(100)
    expect(kf.x).toBeLessThan(110)
  })

  it('gain is between 0 and 1', () => {
    const kf = new KalmanFilter1D()
    for (let i = 0; i < 10; i++) {
      kf.update(100 + Math.random())
      expect(kf.k).toBeGreaterThanOrEqual(0)
      expect(kf.k).toBeLessThanOrEqual(1)
    }
  })

  it('variance decreases after update (posterior < prior)', () => {
    const kf = new KalmanFilter1D({ processNoise: 1e-6, measurementNoise: 0.1 })
    const initialP = kf.p
    kf.update(100)
    expect(kf.p).toBeLessThan(initialP + kf.q) // P after update < P before update
  })

  it('converges to true value with noisy measurements', () => {
    const kf = new KalmanFilter1D({ processNoise: 1e-4, measurementNoise: 1, initialEstimate: 0 })
    const trueValue = 50
    for (let i = 0; i < 200; i++) {
      kf.update(trueValue + (Math.random() - 0.5) * 2)
    }
    expect(Math.abs(kf.x - trueValue)).toBeLessThan(2)
  })

  it('gain converges (stabilizes) for constant noise', () => {
    const kf = new KalmanFilter1D({ processNoise: 0.01, measurementNoise: 0.1 })
    for (let i = 0; i < 100; i++) kf.update(100)
    const lastGains = kf.gainHistory.slice(-10)
    const maxGain = Math.max(...lastGains)
    const minGain = Math.min(...lastGains)
    expect(maxGain - minGain).toBeLessThan(0.01) // Converged
  })

  it('tracks a moving value', () => {
    const kf = new KalmanFilter1D({ processNoise: 0.1, measurementNoise: 0.5 })
    const trueValues = Array.from({ length: 100 }, (_, i) => 100 + i * 0.5)
    const estimates = trueValues.map(v => kf.update(v + (Math.random() - 0.5) * 2))
    const lastEstimate = estimates[estimates.length - 1]
    const lastTrue = trueValues[trueValues.length - 1]
    expect(Math.abs(lastEstimate - lastTrue)).toBeLessThan(5)
  })

  it('residuals are approximately white (uncorrelated) for correct model', () => {
    const kf = new KalmanFilter1D({ processNoise: 0.01, measurementNoise: 1 })
    const measurements = Array.from({ length: 200 }, () => 100 + (Math.random() - 0.5) * 2)
    const residuals = []
    let prevEstimate = 100
    for (const m of measurements) {
      const est = kf.update(m)
      residuals.push(m - est)
      prevEstimate = est
    }
    // Check lag-1 autocorrelation is low (white noise)
    const mean = residuals.reduce((s, r) => s + r, 0) / residuals.length
    let num = 0, den = 0
    for (let i = 1; i < residuals.length; i++) {
      num += (residuals[i] - mean) * (residuals[i - 1] - mean)
    }
    for (let i = 0; i < residuals.length; i++) {
      den += (residuals[i] - mean) ** 2
    }
    const ac1 = den > 0 ? num / den : 0
    expect(Math.abs(ac1)).toBeLessThan(0.3) // Low autocorrelation
  })
})

describe('KalmanFilter2D', () => {
  it('initializes with zero state', () => {
    const kf = new KalmanFilter2D()
    expect(kf.x[0]).toBe(0)
    expect(kf.x[1]).toBe(0)
  })

  it('estimates position from noisy measurements', () => {
    const kf = new KalmanFilter2D({ processNoise: 0.01, measurementNoise: 1, dt: 1 })
    for (let i = 0; i < 100; i++) {
      kf.update(100 + i + (Math.random() - 0.5) * 2)
    }
    expect(Math.abs(kf.x[0] - 199)).toBeLessThan(10) // Close to true position
  })

  it('estimates velocity for constant-velocity model', () => {
    const kf = new KalmanFilter2D({ processNoise: 0.01, measurementNoise: 1, dt: 1 })
    const velocity = 2
    for (let i = 0; i < 200; i++) {
      kf.update(100 + i * velocity + (Math.random() - 0.5) * 2)
    }
    expect(Math.abs(kf.x[1] - velocity)).toBeLessThan(1) // Close to true velocity
  })

  it('velocity history has correct length', () => {
    const kf = new KalmanFilter2D()
    for (let i = 0; i < 50; i++) kf.update(i * 1.5)
    expect(kf.velocityHistory.length).toBe(50)
  })
})
