import { describe, it, expect } from 'vitest'
import { detectCandlePatterns } from '../utils/patterns'

function makeCandle(time, open, high, low, close, volume = 100) {
  return { time, open, high, low, close, volume }
}

describe('detectCandlePatterns', () => {
  it('returns empty array for empty input', () => {
    expect(detectCandlePatterns([])).toEqual([])
  })

  it('returns empty array for less than 3 candles', () => {
    const candles = [
      makeCandle(1, 100, 110, 90, 105),
      makeCandle(2, 105, 115, 95, 110),
    ]
    expect(detectCandlePatterns(candles)).toEqual([])
  })

  it('detects DOJI pattern', () => {
    const candles = [
      makeCandle(1, 100, 120, 80, 105),
      makeCandle(2, 105, 125, 85, 110),
      makeCandle(3, 100, 110, 90, 100.1), // very small body = DOJI
    ]
    const patterns = detectCandlePatterns(candles)
    const doji = patterns.find(p => p.type === 'DOJI')
    expect(doji).toBeDefined()
    expect(doji.direction).toBe('neutral')
  })

  it('detects HAMMER pattern', () => {
    const candles = [
      makeCandle(1, 100, 120, 80, 105),
      makeCandle(2, 105, 125, 85, 110),
      makeCandle(3, 100, 101, 80, 100.5), // small body, long lower wick
    ]
    const patterns = detectCandlePatterns(candles)
    const hammer = patterns.find(p => p.type === 'HAMMER')
    expect(hammer).toBeDefined()
    expect(hammer.direction).toBe('bullish')
  })

  it('detects SHOOTING_STAR pattern', () => {
    const candles = [
      makeCandle(1, 100, 120, 80, 105),
      makeCandle(2, 105, 125, 85, 110),
      makeCandle(3, 100, 120, 99, 100.5), // small body, long upper wick
    ]
    const patterns = detectCandlePatterns(candles)
    const star = patterns.find(p => p.type === 'SHOOTING_STAR')
    expect(star).toBeDefined()
    expect(star.direction).toBe('bearish')
  })

  it('detects BULLISH_ENGULFING pattern', () => {
    const candles = [
      makeCandle(1, 100, 120, 80, 105),
      makeCandle(2, 110, 115, 95, 100),  // bearish candle
      makeCandle(3, 95, 120, 90, 115),   // bullish candle that engulfs prev
    ]
    const patterns = detectCandlePatterns(candles)
    const engulfing = patterns.find(p => p.type === 'BULLISH_ENGULFING')
    expect(engulfing).toBeDefined()
    expect(engulfing.direction).toBe('bullish')
  })

  it('detects BEARISH_ENGULFING pattern', () => {
    const candles = [
      makeCandle(1, 100, 120, 80, 105),
      makeCandle(2, 100, 120, 95, 115),  // bullish candle
      makeCandle(3, 115, 120, 90, 95),   // bearish candle that engulfs prev
    ]
    const patterns = detectCandlePatterns(candles)
    const engulfing = patterns.find(p => p.type === 'BEARISH_ENGULFING')
    expect(engulfing).toBeDefined()
    expect(engulfing.direction).toBe('bearish')
  })

  it('detects THREE_SOLDIERS pattern', () => {
    const candles = [
      makeCandle(1, 100, 105, 95, 102),
      makeCandle(2, 102, 108, 100, 106),
      makeCandle(3, 106, 112, 104, 110),
      makeCandle(4, 100, 120, 80, 105),
      makeCandle(5, 105, 125, 85, 110),
    ]
    const patterns = detectCandlePatterns(candles)
    const soldiers = patterns.find(p => p.type === 'THREE_SOLDIERS')
    expect(soldiers).toBeDefined()
    expect(soldiers.direction).toBe('bullish')
  })

  it('detects THREE_CROWS pattern', () => {
    const candles = [
      makeCandle(1, 110, 115, 105, 108),
      makeCandle(2, 108, 110, 100, 102),
      makeCandle(3, 102, 104, 95, 96),
      makeCandle(4, 100, 120, 80, 105),
      makeCandle(5, 105, 125, 85, 110),
    ]
    const patterns = detectCandlePatterns(candles)
    const crows = patterns.find(p => p.type === 'THREE_CROWS')
    expect(crows).toBeDefined()
    expect(crows.direction).toBe('bearish')
  })

  it('deduplicates patterns with same time and type', () => {
    const candles = [
      makeCandle(1, 100, 120, 80, 105),
      makeCandle(2, 105, 125, 85, 110),
      makeCandle(3, 100, 101, 80, 100.1),
    ]
    const patterns = detectCandlePatterns(candles)
    const dojiCount = patterns.filter(p => p.type === 'DOJI' && p.time === 3).length
    expect(dojiCount).toBeLessThanOrEqual(1)
  })

  it('limits results to 20 patterns', () => {
    const candles = []
    for (let i = 0; i < 100; i++) {
      candles.push(makeCandle(i, 100, 101, 99, 100.01)) // all DOJI
    }
    const patterns = detectCandlePatterns(candles)
    expect(patterns.length).toBeLessThanOrEqual(20)
  })
})
