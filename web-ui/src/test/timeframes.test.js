import { describe, it, expect } from 'vitest'
import { aggregateCandles, TIMEFRAMES } from '../utils/timeframes'

function makeCandle(time, open, high, low, close, volume = 100) {
  return { time, open, high, low, close, volume }
}

describe('aggregateCandles', () => {
  it('returns candles unchanged for factor <= 1', () => {
    const candles = [
      makeCandle(300, 100, 110, 90, 105),
      makeCandle(600, 105, 115, 95, 110),
    ]
    expect(aggregateCandles(candles, 1)).toEqual(candles)
  })

  it('returns empty array for empty input', () => {
    expect(aggregateCandles([], 5)).toEqual([])
  })

  it('aggregates with factor 3 correctly', () => {
    const candles = [
      makeCandle(0, 100, 110, 90, 105, 50),
      makeCandle(300, 105, 120, 95, 115, 60),
      makeCandle(600, 115, 125, 100, 110, 70),
      makeCandle(900, 110, 130, 85, 120, 80), // new bucket
    ]
    const result = aggregateCandles(candles, 3)
    expect(result).toHaveLength(2)
    // First bucket: open=100, high=125, low=90, close=110, volume=180
    expect(result[0].open).toBe(100)
    expect(result[0].high).toBe(125)
    expect(result[0].low).toBe(90)
    expect(result[0].close).toBe(110)
    expect(result[0].volume).toBe(180)
    // Second bucket
    expect(result[1].open).toBe(110)
    expect(result[1].close).toBe(120)
  })

  it('sorts output by time', () => {
    const candles = [
      makeCandle(900, 110, 130, 85, 120),
      makeCandle(0, 100, 110, 90, 105),
      makeCandle(300, 105, 120, 95, 115),
    ]
    const result = aggregateCandles(candles, 3)
    expect(result[0].time).toBeLessThan(result[1].time)
  })

  it('handles candles on bucket boundaries', () => {
    const candles = [
      makeCandle(0, 100, 110, 90, 105),
      makeCandle(599, 105, 115, 95, 110),
      makeCandle(600, 110, 120, 100, 115), // new bucket starts
    ]
    const result = aggregateCandles(candles, 2)
    expect(result).toHaveLength(2)
    expect(result[0].time).toBe(0)
    expect(result[1].time).toBe(600)
  })

  it('preserves OHLCV correctly for single candle in bucket', () => {
    const candles = [
      makeCandle(0, 100, 110, 90, 105, 200),
    ]
    const result = aggregateCandles(candles, 5)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(candles[0])
  })
})

describe('TIMEFRAMES', () => {
  it('has 4 timeframes', () => {
    expect(TIMEFRAMES).toHaveLength(4)
  })

  it('includes 5m, 15m, 1h, 4h', () => {
    const labels = TIMEFRAMES.map(t => t.label)
    expect(labels).toEqual(['5m', '15m', '1h', '4h'])
  })

  it('has correct factors', () => {
    expect(TIMEFRAMES[0].factor).toBe(1)
    expect(TIMEFRAMES[1].factor).toBe(3)
    expect(TIMEFRAMES[2].factor).toBe(12)
    expect(TIMEFRAMES[3].factor).toBe(48)
  })

  it('has correct seconds', () => {
    expect(TIMEFRAMES[0].seconds).toBe(300)
    expect(TIMEFRAMES[3].seconds).toBe(14400)
  })
})
