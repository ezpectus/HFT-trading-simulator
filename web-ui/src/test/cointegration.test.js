/**
 * Tests for Cointegration (Engle-Granger, ADF, z-score).
 * Tests the core algorithms extracted from CointegrationScanner.jsx.
 */
import { describe, it, expect } from 'vitest'

// ADF test — extracted from CointegrationScanner.jsx
function calcADF(residuals) {
  if (residuals.length < 30) return null
  const n = residuals.length
  const lag = 1
  const deltaY = [], lagY = []
  for (let i = lag; i < n; i++) {
    deltaY.push(residuals[i] - residuals[i - 1])
    lagY.push(residuals[i - 1])
  }
  const m = deltaY.length
  const meanY = deltaY.reduce((s, v) => s + v, 0) / m
  const meanLag = lagY.reduce((s, v) => s + v, 0) / m
  let num = 0, den = 0
  for (let i = 0; i < m; i++) {
    num += (lagY[i] - meanLag) * (deltaY[i] - meanY)
    den += (lagY[i] - meanLag) ** 2
  }
  const rho = den > 0 ? num / den : 0
  const residuals2 = []
  for (let i = 0; i < m; i++) {
    residuals2.push(deltaY[i] - meanY - rho * (lagY[i] - meanLag))
  }
  const rss = residuals2.reduce((s, v) => s + v * v, 0)
  const se = den > 0 ? Math.sqrt(rss / (m - 2) / den) : 0
  const tStat = se > 0 ? rho / se : 0
  const criticalValues = { '1%': -3.43, '5%': -2.86, '10%': -2.57 }
  let isStationary = false, significance = 'none'
  if (tStat < criticalValues['1%']) { isStationary = true; significance = '99%' }
  else if (tStat < criticalValues['5%']) { isStationary = true; significance = '95%' }
  else if (tStat < criticalValues['10%']) { isStationary = true; significance = '90%' }
  return { tStat, criticalValues, isStationary, significance, rho }
}

// OLS regression (Engle-Granger step 1)
function ols(y, x) {
  const n = y.length
  const meanX = x.reduce((s, v) => s + v, 0) / n
  const meanY = y.reduce((s, v) => s + v, 0) / n
  let sxy = 0, sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - meanX) * (y[i] - meanY)
    sxx += (x[i] - meanX) ** 2
  }
  const beta = sxy / sxx
  const alpha = meanY - beta * meanX
  const residuals = y.map((yi, i) => yi - (alpha + beta * x[i]))
  return { alpha, beta, residuals }
}

// Z-score of residuals
function calcZScore(residuals) {
  const n = residuals.length
  const mean = residuals.reduce((s, v) => s + v, 0) / n
  const variance = residuals.reduce((s, v) => s + (v - mean) ** 2, 0) / n
  const std = Math.sqrt(variance)
  return { mean, std, zScore: std > 0 ? (residuals[n - 1] - mean) / std : 0 }
}

// Half-life of mean reversion
function calcHalfLife(residuals) {
  if (residuals.length < 20) return null
  const n = residuals.length
  const deltaY = [], lagY = []
  for (let i = 1; i < n; i++) {
    deltaY.push(residuals[i] - residuals[i - 1])
    lagY.push(residuals[i - 1])
  }
  const m = deltaY.length
  const meanY = deltaY.reduce((s, v) => s + v, 0) / m
  const meanLag = lagY.reduce((s, v) => s + v, 0) / m
  let num = 0, den = 0
  for (let i = 0; i < m; i++) {
    num += (lagY[i] - meanLag) * (deltaY[i] - meanY)
    den += (lagY[i] - meanLag) ** 2
  }
  const phi = den > 0 ? num / den : 0
  const halfLife = phi < 0 ? -Math.log(2) / Math.log(1 + phi) : Infinity
  return { phi, halfLife }
}

describe('OLS (Engle-Granger Step 1)', () => {
  it('estimates alpha and beta for linear relationship', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const y = x.map(xi => 2 * xi + 3) // y = 2x + 3
    const { alpha, beta } = ols(y, x)
    expect(beta).toBeCloseTo(2, 5)
    expect(alpha).toBeCloseTo(3, 5)
  })

  it('residuals are near zero for perfect linear fit', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const y = x.map(xi => 2 * xi + 3)
    const { residuals } = ols(y, x)
    residuals.forEach(r => expect(Math.abs(r)).toBeLessThan(1e-8))
  })
})

describe('ADF Test', () => {
  it('returns null for insufficient data', () => {
    expect(calcADF([1, 2, 3])).toBeNull()
  })

  it('detects stationarity in white noise', () => {
    // White noise is stationary
    const noise = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 2)
    const result = calcADF(noise)
    expect(result).not.toBeNull()
    expect(result.tStat).toBeLessThan(0) // Should be negative for stationary
  })

  it('does not reject unit root for random walk', () => {
    // Random walk has unit root
    const rw = [100]
    for (let i = 1; i < 100; i++) rw.push(rw[i - 1] + (Math.random() - 0.5))
    const result = calcADF(rw)
    expect(result).not.toBeNull()
    // Random walk typically has tStat > -2.57 (not stationary)
    // This is probabilistic but usually true
    expect(result.significance).toBe('none')
  })

  it('has correct critical values', () => {
    const noise = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 2)
    const result = calcADF(noise)
    expect(result.criticalValues['1%']).toBe(-3.43)
    expect(result.criticalValues['5%']).toBe(-2.86)
    expect(result.criticalValues['10%']).toBe(-2.57)
  })
})

describe('Z-Score', () => {
  it('calculates z-score of last residual', () => {
    const residuals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const { mean, std, zScore } = calcZScore(residuals)
    expect(mean).toBeCloseTo(5.5, 5)
    expect(std).toBeGreaterThan(0)
    expect(zScore).toBeTypeOf('number')
  })

  it('z-score is 0 when all residuals are equal', () => {
    const residuals = [5, 5, 5, 5, 5]
    const { zScore } = calcZScore(residuals)
    expect(zScore).toBe(0) // std=0, returns 0
  })

  it('z-score of last value above mean is positive', () => {
    const residuals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 20]
    const { mean, zScore } = calcZScore(residuals)
    expect(residuals[residuals.length - 1]).toBeGreaterThan(mean)
    expect(zScore).toBeGreaterThan(0)
  })
})

describe('Half-Life of Mean Reversion', () => {
  it('returns null for insufficient data', () => {
    expect(calcHalfLife([1, 2, 3])).toBeNull()
  })

  it('returns finite half-life for mean-reverting series', () => {
    // Generate mean-reverting series: x_t = 0.5 * x_{t-1} + noise
    const series = [0]
    for (let i = 1; i < 100; i++) {
      series.push(0.5 * series[i - 1] + (Math.random() - 0.5) * 0.5)
    }
    const result = calcHalfLife(series)
    expect(result).not.toBeNull()
    expect(result.phi).toBeLessThan(0) // Mean-reverting
    expect(result.halfLife).toBeGreaterThan(0)
    expect(result.halfLife).toBeLessThan(Infinity)
  })

  it('returns Infinity for non-mean-reverting series', () => {
    // Random walk: phi >= 0
    const rw = [100]
    for (let i = 1; i < 100; i++) rw.push(rw[i - 1] + (Math.random() - 0.5))
    const result = calcHalfLife(rw)
    expect(result).not.toBeNull()
    // For random walk, phi is typically >= 0
    if (result.phi >= 0) {
      expect(result.halfLife).toBe(Infinity)
    }
  })
})
