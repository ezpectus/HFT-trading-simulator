// @vitest-environment node
/**
 * Tests for Kalman Filter (1D and 2D).
 * Exercises the production implementation in src/utils/kalmanMath.js
 * (imported by KalmanFilterPrice.jsx).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { KalmanFilter1D, KalmanFilter2D } from '../utils/kalmanMath'

// Seeded random for reproducible stochastic tests
let seed = 12345
function seededRandom() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}

beforeEach(() => { seed = 12345 })

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
      kf.update(100 + seededRandom())
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
      kf.update(trueValue + (seededRandom() - 0.5) * 2)
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
    const estimates = trueValues.map(v => kf.update(v + (seededRandom() - 0.5) * 2))
    const lastEstimate = estimates[estimates.length - 1]
    const lastTrue = trueValues[trueValues.length - 1]
    expect(Math.abs(lastEstimate - lastTrue)).toBeLessThan(5)
  })

  it('history is capped at 200 entries', () => {
    const kf = new KalmanFilter1D()
    for (let i = 0; i < 250; i++) kf.update(100)
    expect(kf.gainHistory.length).toBe(200)
    expect(kf.estimateHistory.length).toBe(200)
    expect(kf.varianceHistory.length).toBe(200)
  })

  it('residuals are approximately white (uncorrelated) for correct model', () => {
    const kf = new KalmanFilter1D({ initialEstimate: 100, processNoise: 0.01, measurementNoise: 1 })
    const measurements = Array.from({ length: 500 }, () => 100 + (seededRandom() - 0.5) * 2)
    const residuals = []
    for (const m of measurements) {
      const est = kf.update(m)
      residuals.push(m - est)
    }
    // Skip first 100 residuals (convergence transient) for autocorrelation check
    const stableResiduals = residuals.slice(100)
    // Check lag-1 autocorrelation is low (white noise)
    const mean = stableResiduals.reduce((s, r) => s + r, 0) / stableResiduals.length
    let num = 0, den = 0
    for (let i = 1; i < stableResiduals.length; i++) {
      num += (stableResiduals[i] - mean) * (stableResiduals[i - 1] - mean)
    }
    for (let i = 0; i < stableResiduals.length; i++) {
      den += (stableResiduals[i] - mean) ** 2
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
      kf.update(100 + i + (seededRandom() - 0.5) * 2)
    }
    expect(Math.abs(kf.x[0] - 199)).toBeLessThan(10) // Close to true position
  })

  it('estimates velocity for constant-velocity model', () => {
    const kf = new KalmanFilter2D({ processNoise: 0.1, measurementNoise: 1, dt: 1 })
    const velocity = 2
    for (let i = 0; i < 500; i++) {
      kf.update(100 + i * velocity + (seededRandom() - 0.5) * 2)
    }
    expect(Math.abs(kf.x[1] - velocity)).toBeLessThan(1) // Close to true velocity
  })

  it('returns { estimate, velocity } per update', () => {
    const kf = new KalmanFilter2D()
    const out = kf.update(100)
    expect(out).toHaveProperty('estimate')
    expect(out).toHaveProperty('velocity')
  })

  it('velocity history is capped at 200 entries', () => {
    const kf = new KalmanFilter2D()
    for (let i = 0; i < 250; i++) kf.update(i * 1.5)
    expect(kf.velocityHistory.length).toBe(200)
  })
})
