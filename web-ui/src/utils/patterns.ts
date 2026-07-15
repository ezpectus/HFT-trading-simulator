import type { Candle } from './timeframes'

export type PatternDirection = 'bullish' | 'bearish' | 'neutral'

export interface DetectedPattern {
  time: number
  type: string
  direction: PatternDirection
  confidence: number
  description: string
}

/**
 * Detect patterns from last N candles.
 * @param candles - Array of Candle
 * @param lookback - How many recent candles to analyze
 * @returns Detected patterns
 */
export function detectCandlePatterns(candles: Candle[], lookback: number = 50): DetectedPattern[] {
  if (!candles || candles.length < 3) return []

  const patterns: DetectedPattern[] = []
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

    if (bodyRatio < 0.1 && range > 0) {
      patterns.push({
        time: c.time,
        type: 'DOJI',
        direction: 'neutral',
        confidence: Math.round((1 - bodyRatio) * 100),
        description: 'Indecision — small body, long wicks',
      })
    }

    if (bodyRatio < 0.35 && lowerWick > body * 2 && upperWick < body * 0.5) {
      patterns.push({
        time: c.time,
        type: 'HAMMER',
        direction: 'bullish',
        confidence: Math.round((lowerWick / range) * 100),
        description: 'Bullish reversal — long lower wick',
      })
    }

    if (bodyRatio < 0.35 && upperWick > body * 2 && lowerWick < body * 0.5) {
      patterns.push({
        time: c.time,
        type: 'SHOOTING_STAR',
        direction: 'bearish',
        confidence: Math.round((upperWick / range) * 100),
        description: 'Bearish reversal — long upper wick',
      })
    }

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

  const seen = new Map<string, DetectedPattern>()
  for (const p of patterns) {
    const key = p.time + '_' + p.type
    if (!seen.has(key) || seen.get(key)!.confidence < p.confidence) {
      seen.set(key, p)
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.time - b.time).slice(-20)
}
