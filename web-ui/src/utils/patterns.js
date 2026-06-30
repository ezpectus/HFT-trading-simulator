/**
 * Candle pattern detection utilities.
 * Detects common patterns from candlestick data.
 */

/**
 * Detect patterns from last N candles.
 * @param {Array} candles - [{ time, open, high, low, close, volume }]
 * @param {number} lookback - How many recent candles to analyze
 * @returns {Array} Detected patterns [{ time, type, direction, confidence }]
 */
export function detectCandlePatterns(candles, lookback = 50) {
  if (!candles || candles.length < 3) return []

  const patterns = []
  const recent = candles.slice(-lookback)

  for (let i = 2; i < recent.length; i++) {
    const c = recent[i]
    const prev = recent[i - 1]
    const prev2 = recent[i - 2]

    const body = Math.abs(c.close - c.open)
    const upperWick = c.high - Math.max(c.open, c.close)
    const lowerWick = Math.min(c.open, c.close) - c.low
    const range = c.high - c.low || 0.0001
    const bodyRatio = body / range

    // Doji: very small body relative to range
    if (bodyRatio < 0.1 && range > 0) {
      patterns.push({
        time: c.time,
        type: 'DOJI',
        direction: 'neutral',
        confidence: Math.round((1 - bodyRatio) * 100),
        description: 'Indecision — small body, long wicks',
      })
    }

    // Hammer: small body, long lower wick, small upper wick
    if (bodyRatio < 0.35 && lowerWick > body * 2 && upperWick < body * 0.5) {
      patterns.push({
        time: c.time,
        type: 'HAMMER',
        direction: 'bullish',
        confidence: Math.round((lowerWick / range) * 100),
        description: 'Bullish reversal — long lower wick',
      })
    }

    // Shooting Star: small body, long upper wick, small lower wick
    if (bodyRatio < 0.35 && upperWick > body * 2 && lowerWick < body * 0.5) {
      patterns.push({
        time: c.time,
        type: 'SHOOTING_STAR',
        direction: 'bearish',
        confidence: Math.round((upperWick / range) * 100),
        description: 'Bearish reversal — long upper wick',
      })
    }

    // Bullish Engulfing: prev bearish, current bullish, current body engulfs prev
    if (prev.close < prev.open && c.close > c.open) {
      if (c.close >= prev.open && c.open <= prev.close) {
        patterns.push({
          time: c.time,
          type: 'BULLISH_ENGULFING',
          direction: 'bullish',
          confidence: Math.round(bodyRatio * 100),
          description: 'Bullish reversal — current candle engulfs previous',
        })
      }
    }

    // Bearish Engulfing: prev bullish, current bearish, current body engulfs prev
    if (prev.close > prev.open && c.close < c.open) {
      if (c.open >= prev.close && c.close <= prev.open) {
        patterns.push({
          time: c.time,
          type: 'BEARISH_ENGULFING',
          direction: 'bearish',
          confidence: Math.round(bodyRatio * 100),
          description: 'Bearish reversal — current candle engulfs previous',
        })
      }
    }

    // Three White Soldiers: 3 consecutive bullish candles with increasing closes
    if (i >= 2) {
      if (
        prev2.close > prev2.open &&
        prev.close > prev.open &&
        c.close > c.open &&
        c.close > prev.close &&
        prev.close > prev2.close
      ) {
        patterns.push({
          time: c.time,
          type: 'THREE_SOLDIERS',
          direction: 'bullish',
          confidence: 85,
          description: 'Strong bullish — 3 consecutive rising candles',
        })
      }

      // Three Black Crows: 3 consecutive bearish candles with decreasing closes
      if (
        prev2.close < prev2.open &&
        prev.close < prev.open &&
        c.close < c.open &&
        c.close < prev.close &&
        prev.close < prev2.close
      ) {
        patterns.push({
          time: c.time,
          type: 'THREE_CROWS',
          direction: 'bearish',
          confidence: 85,
          description: 'Strong bearish — 3 consecutive falling candles',
        })
      }
    }
  }

  // Deduplicate by time+type, keep highest confidence
  const seen = new Map()
  for (const p of patterns) {
    const key = p.time + '_' + p.type
    if (!seen.has(key) || seen.get(key).confidence < p.confidence) {
      seen.set(key, p)
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.time - b.time).slice(-20)
}
