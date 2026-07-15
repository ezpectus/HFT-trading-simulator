export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Timeframe {
  label: string
  factor: number
  seconds: number
}

/**
 * Aggregate 1m candles into higher timeframes.
 * @param candles - array of Candle
 * @param factor - aggregation factor (e.g. 5 for 5m from 1m)
 * @returns aggregated candles
 */
export function aggregateCandles(candles: Candle[], factor: number): Candle[] {
  if (!candles.length || factor <= 1) return candles

  const result: Candle[] = []
  const baseTf = 300 // 5 minutes in seconds
  const bucketSize = baseTf * factor

  const buckets = new Map<number, Candle>()

  for (const c of candles) {
    const bucketTime = Math.floor(c.time / bucketSize) * bucketSize
    if (!buckets.has(bucketTime)) {
      buckets.set(bucketTime, {
        time: bucketTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })
    } else {
      const bucket = buckets.get(bucketTime)!
      bucket.high = Math.max(bucket.high, c.high)
      bucket.low = Math.min(bucket.low, c.low)
      bucket.close = c.close
      bucket.volume += c.volume
    }
  }

  for (const [, candle] of buckets) {
    result.push(candle)
  }
  result.sort((a, b) => a.time - b.time)

  return result
}

export const TIMEFRAMES: Timeframe[] = [
  { label: '5m', factor: 1, seconds: 300 },
  { label: '15m', factor: 3, seconds: 900 },
  { label: '1h', factor: 12, seconds: 3600 },
  { label: '4h', factor: 48, seconds: 14400 },
]
