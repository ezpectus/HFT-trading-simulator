import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useChartCandles } from '../hooks/useChartCandles'

const mkExchange = (candles = [], prices = {}) => ({
  candles, prices,
})

const candle = (ex, sym, ts, close) => ({
  exchange: ex, symbol: sym, timestamp: ts,
  open: close - 1, high: close + 1, low: close - 2, close, volume: 10,
})

describe('useChartCandles', () => {
  const timeframe = { factor: 1 }

  it('filters candles by selected exchange + symbol', () => {
    const exchange = mkExchange([
      candle('sim', 'BTC/USDT', 0, 100),
      candle('sim', 'ETH/USDT', 0, 200),
      candle('other', 'BTC/USDT', 0, 300),
    ])
    const { result } = renderHook(() =>
      useChartCandles(exchange, 'sim', 'BTC/USDT', timeframe))
    expect(result.current.chartCandles.length).toBe(1)
    expect(result.current.chartCandles[0].close).toBe(100)
  })

  it('exposes currentPrice from prices map', () => {
    const exchange = mkExchange([], { sim: { 'BTC/USDT': 42000 } })
    const { result } = renderHook(() =>
      useChartCandles(exchange, 'sim', 'BTC/USDT', timeframe))
    expect(result.current.currentPrice).toBe(42000)
  })

  it('missing price → 0', () => {
    const { result } = renderHook(() =>
      useChartCandles(mkExchange(), 'sim', 'BTC/USDT', timeframe))
    expect(result.current.currentPrice).toBe(0)
  })
})
