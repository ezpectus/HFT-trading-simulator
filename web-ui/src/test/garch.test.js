/**
 * Tests for GARCH(1,1) volatility model.
 * Tests the core algorithm extracted from GARCHVolatility.jsx.
 */
import { describe, it, expect } from 'vitest'

// Extracted from GARCHVolatility.jsx
function calcLogReturns(closes) {
  const returns = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      returns.push(Math.log(closes[i] / closes[i - 1]))
    }
  }
  return returns
}

function calcGARCH(returns, maxIter = 100) {
  if (returns.length < 30) return null
  const n = returns.length
  const mean = returns.reduce((s, r) => s + r, 0) / n
  const centered = returns.map(r => r - mean)
  const variance0 = centered.reduce((s, r) => s + r * r, 0) / n

  let omega = variance0 * 0.1
  let alpha = 0.1
  let beta = 0.85
  const condVar = new Array(n).fill(variance0)

  for (let iter = 0; iter < maxIter; iter++) {
    for (let i = 1; i < n; i++) {
      const prevVar = condVar[i - 1]
      const prevRet2 = centered[i - 1] * centered[i - 1]
      condVar[i] = omega + alpha * prevRet2 + beta * prevVar
      if (condVar[i] < 1e-10) condVar[i] = 1e-10
    }
  }

  const forecast = omega + alpha * centered[n - 1] * centered[n - 1] + beta * condVar[n - 1]
  const persistence = alpha + beta
  const halfLife = persistence > 0 && persistence < 1
    ? Math.log(0.5) / Math.log(persistence) : Infinity
  const unconditionalVar = omega / (1 - alpha - beta)

  return { omega, alpha, beta, forecast, persistence, halfLife, unconditionalVar, condVar }
}

describe('GARCH(1,1)', () => {
  // Generate synthetic price data with known volatility
  function generatePrices(n, startPrice = 100, vol = 0.02) {
    const prices = [startPrice]
    for (let i = 1; i < n; i++) {
      const ret = (Math.random() - 0.5) * vol * 2
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

  it('forecast is positive (variance is always positive)', () => {
    const prices = generatePrices(200, 100, 0.02)
    const returns = calcLogReturns(prices)
    const result = calcGARCH(returns)
    expect(result.forecast).toBeGreaterThan(0)
  })

  it('unconditional variance is positive for stationary process', () => {
    const prices = generatePrices(200, 100, 0.01)
    const returns = calcLogReturns(prices)
    const result = calcGARCH(returns)
    expect(result.unconditionalVar).toBeGreaterThan(0)
  })

  it('conditional variance array has correct length', () => {
    const prices = generatePrices(100, 100, 0.02)
    const returns = calcLogReturns(prices)
    const result = calcGARCH(returns)
    expect(result.condVar.length).toBe(returns.length)
  })
})
