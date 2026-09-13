// @vitest-environment node
/**
 * Tests for GARCH(1,1) volatility model.
 * Exercises the production implementation in src/utils/garchMath.js
 * (imported by GARCHVolatility.jsx).
 */
import { describe, it, expect } from 'vitest'
import { calcLogReturns, calcGARCH, calcEWMAVol, calcParkinsonVol } from '../utils/garchMath'

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

describe('GARCH(1,1)', () => {
  // Generate synthetic price data with known volatility
  function generatePrices(n, startPrice = 100, vol = 0.02) {
    const prices = [startPrice]
    for (let i = 1; i < n; i++) {
      const ret = (rand() - 0.5) * vol * 2
      prices.push(prices[i - 1] * Math.exp(ret))
    }
    return prices
  }

  it('calculates log returns correctly', () => {
    const closes = [100, 110, 105]
    const returns = calcLogReturns(closes)
    expect(returns.length).toBe(2)
    expect(returns[0]).toBeCloseTo(Math.log(110 / 100), 8)
    expect(returns[1]).toBeCloseTo(Math.log(105 / 110), 8)
  })

  it('skips non-positive prices', () => {
    const returns = calcLogReturns([100, 0, 105, 110])
    // 0 → 105 and 100 → 0 transitions dropped
    expect(returns.length).toBe(1)
    expect(returns[0]).toBeCloseTo(Math.log(110 / 105), 8)
  })

  it('returns null for insufficient data (< 30)', () => {
    const returns = new Array(29).fill(0.01)
    expect(calcGARCH(returns)).toBeNull()
  })

  it('returns valid parameters for sufficient data', () => {
    const prices = generatePrices(200)
    const returns = calcLogReturns(prices)
    const result = calcGARCH(returns)
    expect(result).not.toBeNull()
    expect(result.omega).toBeGreaterThan(0)
    expect(result.alpha).toBeGreaterThan(0)
    expect(result.beta).toBeGreaterThan(0)
  })

  it('persistence (alpha + beta) is less than 1 for stationary process', () => {
    const prices = generatePrices(200, 100, 0.01)
    const returns = calcLogReturns(prices)
    const result = calcGARCH(returns)
    expect(result.persistence).toBeLessThan(1)
  })

  it('half-life is positive for mean-reverting variance', () => {
    const prices = generatePrices(200, 100, 0.01)
    const returns = calcLogReturns(prices)
    const result = calcGARCH(returns)
    expect(result.halfLife).toBeGreaterThan(0)
    expect(result.halfLife).toBeLessThan(Infinity)
  })

  it('forecast volatility is positive', () => {
    const prices = generatePrices(200, 100, 0.02)
    const returns = calcLogReturns(prices)
    const result = calcGARCH(returns)
    expect(result.forecastVol).toBeGreaterThan(0)
  })

  it('unconditional variance is positive for stationary process', () => {
    const prices = generatePrices(200, 100, 0.01)
    const returns = calcLogReturns(prices)
    const result = calcGARCH(returns)
    expect(result.unconditionalVar).toBeGreaterThan(0)
  })

  it('volatility series has correct length', () => {
    const prices = generatePrices(100, 100, 0.02)
    const returns = calcLogReturns(prices)
    const result = calcGARCH(returns)
    expect(result.volSeries.length).toBe(returns.length)
  })
})

describe('EWMA Volatility', () => {
  it('returns null for insufficient data', () => {
    expect(calcEWMAVol([0.01, 0.02, 0.01])).toBeNull()
  })

  it('produces a vol series matching input length', () => {
    const returns = Array.from({ length: 60 }, () => (rand() - 0.5) * 0.04)
    const result = calcEWMAVol(returns, 0.94)
    expect(result.volSeries.length).toBe(60)
    expect(result.currentVol).toBe(result.volSeries[59])
    expect(result.lambda).toBe(0.94)
  })

  it('volatility is always non-negative', () => {
    const returns = Array.from({ length: 60 }, () => (rand() - 0.5) * 0.06)
    const result = calcEWMAVol(returns)
    result.volSeries.forEach(v => expect(v).toBeGreaterThanOrEqual(0))
  })
})

describe('Parkinson Volatility', () => {
  it('returns null when fewer highs than period', () => {
    expect(calcParkinsonVol([1, 2, 3], [1, 2, 3], 20)).toBeNull()
  })

  it('produces n - period + 1 vol points', () => {
    const highs = Array.from({ length: 50 }, (_, i) => 100 + i + rand())
    const lows = highs.map(h => h - 1 - rand())
    const result = calcParkinsonVol(highs, lows, 20)
    expect(result.volSeries.length).toBe(50 - 20 + 1)
    expect(result.currentVol).toBeGreaterThan(0)
  })
})
