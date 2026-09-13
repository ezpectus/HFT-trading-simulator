// @vitest-environment node
/**
 * Tests for Cointegration (Engle-Granger, ADF, z-score).
 * Exercises the production implementation in src/utils/cointegrationMath.js
 * (imported by CointegrationScanner.jsx).
 */
import { describe, it, expect } from 'vitest'
import { calcADF, calcHalfLife, linearRegression, calcCorrelation } from '../utils/cointegrationMath'

// Seeded PRNG for deterministic tests (mulberry32)
function seededRandom(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
const _rng = seededRandom(42)
const rand = () => _rng()

describe('OLS (Engle-Granger Step 1)', () => {
  it('estimates alpha and beta for linear relationship', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const y = x.map(xi => 2 * xi + 3) // y = 2x + 3
    const { alpha, beta } = linearRegression(y, x)
    expect(beta).toBeCloseTo(2, 5)
    expect(alpha).toBeCloseTo(3, 5)
  })

  it('residuals are near zero for perfect linear fit', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const y = x.map(xi => 2 * xi + 3)
    const { residuals } = linearRegression(y, x)
    residuals.forEach(r => expect(Math.abs(r)).toBeLessThan(1e-8))
  })

  it('returns null for fewer than 5 points', () => {
    expect(linearRegression([1, 2, 3], [1, 2, 3])).toBeNull()
  })
})

describe('ADF Test', () => {
  it('returns null for insufficient data', () => {
    expect(calcADF([1, 2, 3])).toBeNull()
  })

  it('detects stationarity in white noise', () => {
    // White noise is stationary
    const noise = Array.from({ length: 100 }, () => (rand() - 0.5) * 2)
    const result = calcADF(noise)
    expect(result).not.toBeNull()
    expect(result.tStat).toBeLessThan(0) // Should be negative for stationary
  })

  it('does not reject unit root for random walk', () => {
    // Random walk has unit root — use seeded PRNG for deterministic results
    const rw = [100]
    for (let i = 1; i < 100; i++) rw.push(rw[i - 1] + (rand() - 0.5))
    const result = calcADF(rw)
    expect(result).not.toBeNull()
    expect(result.significance).toBe('none')
  })

  it('has correct critical values', () => {
    const noise = Array.from({ length: 100 }, () => (rand() - 0.5) * 2)
    const result = calcADF(noise)
    expect(result.criticalValues['1%']).toBe(-3.43)
    expect(result.criticalValues['5%']).toBe(-2.86)
    expect(result.criticalValues['10%']).toBe(-2.57)
  })
})

describe('Z-Score (from linearRegression output)', () => {
  it('z-score is ~0 for a perfect linear fit', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const y = x.map(xi => 2 * xi + 3)
    const { zScore, stdResidual } = linearRegression(y, x)
    // Perfect fit → residuals ~0 → stdResidual 0 → z-score 0 (no NaN leak)
    expect(stdResidual).toBe(0)
    expect(zScore).toBe(0)
  })

  it('z-score flags a last-point outlier', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const y = x.map(xi => 2 * xi + 3)
    y[9] += 50 // last residual is a big outlier
    const { zScore, stdResidual } = linearRegression(y, x)
    expect(stdResidual).toBeGreaterThan(0)
    expect(zScore).toBeGreaterThan(1) // last residual / σ_ε is large
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
      series.push(0.5 * series[i - 1] + (rand() - 0.5) * 0.5)
    }
    const halfLife = calcHalfLife(series)
    expect(halfLife).not.toBeNull()
    expect(halfLife).toBeGreaterThan(0)
    expect(halfLife).toBeLessThan(Infinity)
  })

  it('returns Infinity or positive for non-mean-reverting series', () => {
    // Random walk: phi >= 0 → Infinity; noise can still land phi < 0
    const rw = [100]
    for (let i = 1; i < 100; i++) rw.push(rw[i - 1] + (rand() - 0.5))
    const halfLife = calcHalfLife(rw)
    expect(halfLife).not.toBeNull()
    expect(halfLife === Infinity || halfLife > 0).toBe(true)
  })
})

describe('Pearson Correlation', () => {
  it('returns 1 for identical series', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(calcCorrelation(a, a)).toBeCloseTo(1, 5)
  })

  it('returns -1 for inverted series', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const b = a.map(v => -v)
    expect(calcCorrelation(a, b)).toBeCloseTo(-1, 5)
  })

  it('returns 0 for insufficient data', () => {
    expect(calcCorrelation([1, 2], [1, 2])).toBe(0)
  })
})
