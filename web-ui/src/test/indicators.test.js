/**
 * Tests for technical indicators (utils/indicators.js)
 */
import { describe, it, expect } from 'vitest'
import {
  calcEMA, calcRSI, calcSMA, calcBollingerBands, calcOBV,
  calcMACD, calcATR, calcADX, calcCCI, calcStochastic,
  calcParabolicSAR, calcMFI, calcWilliamsR, calcIchimoku,
  calcAwesomeOscillator, calcVWAPMACD, toHeikinAshi,
} from '../utils/indicators'

describe('calcEMA', () => {
  it('returns NaN for first period-1 values', () => {
    const closes = [10, 11, 12, 13, 14]
    const ema = calcEMA(closes, 3)
    expect(ema[0]).toBeNaN()
    expect(ema[1]).toBeNaN()
    expect(ema[2]).not.toBeNaN()
  })

  it('seeds with SMA', () => {
    const closes = [10, 20, 30]
    const ema = calcEMA(closes, 3)
    expect(ema[2]).toBeCloseTo(20, 5) // (10+20+30)/3 = 20
  })

  it('updates with EMA formula', () => {
    const closes = [10, 20, 30, 40]
    const ema = calcEMA(closes, 3)
    const k = 2 / (3 + 1) // 0.5
    const expected = 40 * k + 20 * (1 - k) // 30
    expect(ema[3]).toBeCloseTo(expected, 5)
  })

  it('returns all NaN for insufficient data', () => {
    const closes = [10, 20]
    const ema = calcEMA(closes, 5)
    expect(ema.every(v => isNaN(v))).toBe(true)
  })
})

describe('calcRSI', () => {
  it('returns NaN for first period values', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i)
    const rsi = calcRSI(closes, 14)
    for (let i = 0; i < 14; i++) {
      expect(rsi[i]).toBeNaN()
    }
    expect(rsi[14]).not.toBeNaN()
  })

  it('returns 100 for all-gains (no losses)', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i)
    const rsi = calcRSI(closes, 14)
    expect(rsi[14]).toBeCloseTo(100, 0)
  })

  it('returns 0 for all-losses', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i)
    const rsi = calcRSI(closes, 14)
    expect(rsi[14]).toBeCloseTo(0, 0)
  })

  it('returns values between 0 and 100', () => {
    const closes = [50, 52, 48, 51, 49, 53, 47, 50, 52, 48, 51, 49, 53, 47, 50, 52, 48]
    const rsi = calcRSI(closes, 14)
    for (const v of rsi) {
      if (!isNaN(v)) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
  })
})

describe('calcSMA', () => {
  it('calculates simple moving average', () => {
    const closes = [1, 2, 3, 4, 5]
    const sma = calcSMA(closes, 3)
    expect(sma[2]).toBeCloseTo(2, 5) // (1+2+3)/3
    expect(sma[3]).toBeCloseTo(3, 5) // (2+3+4)/3
    expect(sma[4]).toBeCloseTo(4, 5) // (3+4+5)/3
  })

  it('returns NaN for insufficient data', () => {
    const closes = [1, 2]
    const sma = calcSMA(closes, 5)
    expect(sma.every(v => isNaN(v))).toBe(true)
  })
})

describe('calcBollingerBands', () => {
  it('returns upper, middle, lower arrays', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i) * 5)
    const bb = calcBollingerBands(closes, 20, 2)
    expect(bb.upper.length).toBe(closes.length)
    expect(bb.middle.length).toBe(closes.length)
    expect(bb.lower.length).toBe(closes.length)
  })

  it('upper >= middle >= lower', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i) * 5)
    const bb = calcBollingerBands(closes, 20, 2)
    for (let i = 19; i < closes.length; i++) {
      expect(bb.upper[i]).toBeGreaterThanOrEqual(bb.middle[i])
      expect(bb.middle[i]).toBeGreaterThanOrEqual(bb.lower[i])
    }
  })
})

describe('calcMACD', () => {
  it('returns macd, signal, histogram arrays', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10)
    const result = calcMACD(closes, 12, 26, 9)
    expect(result.macd.length).toBe(closes.length)
    expect(result.signal.length).toBe(closes.length)
    expect(result.histogram.length).toBe(closes.length)
  })

  it('histogram = macd - signal', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10)
    const result = calcMACD(closes, 12, 26, 9)
    for (let i = 0; i < closes.length; i++) {
      if (!isNaN(result.macd[i]) && !isNaN(result.signal[i])) {
        expect(result.histogram[i]).toBeCloseTo(result.macd[i] - result.signal[i], 8)
      }
    }
  })
})

describe('calcATR', () => {
  it('calculates average true range', () => {
    const highs = [110, 115, 112, 118, 120]
    const lows = [100, 105, 102, 108, 110]
    const closes = [105, 110, 107, 113, 115]
    const atr = calcATR(highs, lows, closes, 3)
    expect(atr.length).toBe(closes.length)
    expect(atr[2]).not.toBeNaN()
  })
})

describe('calcADX', () => {
  it('returns adx, pdi, mdi arrays', () => {
    const n = 30
    const highs = Array.from({ length: n }, (_, i) => 100 + i * 0.5 + Math.sin(i))
    const lows = Array.from({ length: n }, (_, i) => 95 + i * 0.5 + Math.sin(i))
    const closes = Array.from({ length: n }, (_, i) => 97 + i * 0.5 + Math.sin(i))
    const result = calcADX(highs, lows, closes, 14)
    expect(result.adx.length).toBe(n)
    expect(result.pdi.length).toBe(n)
    expect(result.mdi.length).toBe(n)
  })
})

describe('calcOBV', () => {
  it('accumulates volume based on price direction', () => {
    const closes = [10, 12, 11, 13]
    const volumes = [100, 200, 150, 300]
    const obv = calcOBV(closes, volumes)
    expect(obv[0]).toBe(100)
    expect(obv[1]).toBe(300)  // 100 + 200 (price up)
    expect(obv[2]).toBe(150)  // 300 - 150 (price down)
    expect(obv[3]).toBe(450)  // 150 + 300 (price up)
  })
})

describe('calcCCI', () => {
  it('calculates commodity channel index', () => {
    const n = 25
    const highs = Array.from({ length: n }, (_, i) => 100 + Math.sin(i) * 5)
    const lows = Array.from({ length: n }, (_, i) => 95 + Math.sin(i) * 5)
    const closes = Array.from({ length: n }, (_, i) => 97 + Math.sin(i) * 5)
    const cci = calcCCI(highs, lows, closes, 20)
    expect(cci.length).toBe(n)
    expect(cci[19]).not.toBeNaN()
  })
})

describe('calcStochastic', () => {
  it('returns k and d arrays', () => {
    const n = 20
    const highs = Array.from({ length: n }, (_, i) => 100 + i)
    const lows = Array.from({ length: n }, (_, i) => 90 + i)
    const closes = Array.from({ length: n }, (_, i) => 95 + i)
    const result = calcStochastic(highs, lows, closes, 14, 3)
    expect(result.k.length).toBe(n)
    expect(result.d.length).toBe(n)
  })

  it('k is between 0 and 100', () => {
    const n = 20
    const highs = Array.from({ length: n }, (_, i) => 100 + Math.sin(i) * 10)
    const lows = Array.from({ length: n }, (_, i) => 90 + Math.sin(i) * 10)
    const closes = Array.from({ length: n }, (_, i) => 95 + Math.sin(i) * 10)
    const result = calcStochastic(highs, lows, closes, 14, 3)
    for (const v of result.k) {
      if (!isNaN(v)) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
  })
})

describe('toHeikinAshi', () => {
  it('converts candles to Heikin-Ashi format', () => {
    const candles = [
      { open: 100, high: 110, low: 95, close: 105, volume: 1000, time: 1 },
      { open: 105, high: 115, low: 100, close: 110, volume: 2000, time: 2 },
    ]
    const ha = toHeikinAshi(candles)
    expect(ha.length).toBe(2)
    expect(ha[0].close).toBeCloseTo((100 + 110 + 95 + 105) / 4, 5)
    expect(ha[0].open).toBeCloseTo((100 + 105) / 2, 5)
  })
})
