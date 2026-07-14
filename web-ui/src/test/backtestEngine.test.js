import { describe, it, expect } from 'vitest'
import { runBacktest } from '../utils/backtestEngine'

function makeCandles(n, startPrice = 65000) {
  const candles = []
  let price = startPrice
  const baseTs = 1704067200
  for (let i = 0; i < n; i++) {
    const change = Math.sin(i / 10) * 100 + (Math.random() - 0.5) * 50
    const open = price
    const close = price + change
    const high = Math.max(open, close) + Math.abs(change) * 0.3
    const low = Math.min(open, close) - Math.abs(change) * 0.3
    candles.push({
      time: baseTs + i * 300,
      open,
      high,
      low,
      close,
      volume: 100 + Math.random() * 500,
    })
    price = close
  }
  return candles
}

describe('backtestEngine', () => {
  it('returns error for insufficient candles', () => {
    const result = runBacktest(makeCandles(10), [])
    expect(result.error).toBeDefined()
    expect(result.totalTrades).toBe(0)
  })

  it('runs with no rules and returns initial balance', () => {
    const candles = makeCandles(100)
    const result = runBacktest(candles, [], { initialBalance: 10000 })
    expect(result.error).toBeUndefined()
    expect(result.totalTrades).toBe(0)
    expect(result.finalBalance).toBe(10000)
    expect(result.equityCurve.length).toBe(100)
  })

  it('executes trades with rsi_below buy rule', () => {
    const candles = makeCandles(100)
    const rules = [
      { id: 1, condition: 'rsi_below', value: 50, action: 'buy', qty: 0.1 },
      { id: 2, condition: 'rsi_above', value: 50, action: 'close_all', qty: 0.1 },
    ]
    const result = runBacktest(candles, rules, { initialBalance: 10000 })
    expect(result.totalTrades).toBeGreaterThan(0)
    expect(result.equityCurve.length).toBe(100)
    expect(result.trades[0].side).toBe('LONG')
  })

  it('calculates P&L metrics correctly', () => {
    const candles = makeCandles(100)
    const rules = [
      { id: 1, condition: 'price_below', value: 999999, action: 'buy', qty: 0.1 },
      { id: 2, condition: 'price_above', value: 0, action: 'close_all', qty: 0.1 },
    ]
    const result = runBacktest(candles, rules, { initialBalance: 10000 })
    expect(result.totalTrades).toBeGreaterThan(0)
    expect(result.winRate).toBeGreaterThanOrEqual(0)
    expect(result.winRate).toBeLessThanOrEqual(100)
    expect(result.profitFactor).toBeGreaterThanOrEqual(0)
    expect(result.maxDrawdownPct).toBeGreaterThanOrEqual(0)
  })

  it('handles short positions', () => {
    const candles = makeCandles(100)
    const rules = [
      { id: 1, condition: 'price_above', value: 0, action: 'sell', qty: 0.1 },
      { id: 2, condition: 'price_below', value: 999999, action: 'close_all', qty: 0.1 },
    ]
    const result = runBacktest(candles, rules, { initialBalance: 10000 })
    expect(result.totalTrades).toBeGreaterThan(0)
    expect(result.trades[0].side).toBe('SHORT')
  })

  it('closes open position at end', () => {
    const candles = makeCandles(100)
    const rules = [
      { id: 1, condition: 'price_below', value: 999999, action: 'buy', qty: 0.1 },
    ]
    const result = runBacktest(candles, rules, { initialBalance: 10000 })
    expect(result.totalTrades).toBeGreaterThan(0)
    expect(result.trades[result.trades.length - 1].exitReason).toBe('END')
  })
})
