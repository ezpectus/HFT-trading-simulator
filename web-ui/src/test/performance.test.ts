import { describe, it, expect } from 'vitest'
import { calcAggregateMetrics } from '../utils/performance'

describe('performance.ts', () => {
  it('returns zeros for empty accounts', () => {
    const result = calcAggregateMetrics({})
    expect(result.totalBalance).toBe(0)
    expect(result.totalEquity).toBe(0)
    expect(result.totalPnl).toBe(0)
    expect(result.totalTrades).toBe(0)
    expect(result.avgWinRate).toBe(0)
    expect(result.bestExchange).toBeNull()
    expect(result.worstExchange).toBeNull()
  })

  it('aggregates single account', () => {
    const result = calcAggregateMetrics({
      binance: { balance: 10000, equity: 10500, total_pnl: 500, total_fees: 50, total_trades: 100, winning_trades: 60, positions: [{ id: 1 }] },
    })
    expect(result.totalBalance).toBe(10000)
    expect(result.totalEquity).toBe(10500)
    expect(result.totalPnl).toBe(500)
    expect(result.totalFees).toBe(50)
    expect(result.totalTrades).toBe(100)
    expect(result.avgWinRate).toBe(60)
    expect(result.totalPositions).toBe(1)
  })

  it('aggregates multiple accounts', () => {
    const result = calcAggregateMetrics({
      binance: { balance: 10000, equity: 10500, total_pnl: 500, total_fees: 50, total_trades: 100, winning_trades: 60, positions: [] },
      okx: { balance: 8000, equity: 8200, total_pnl: 200, total_fees: 30, total_trades: 50, winning_trades: 25, positions: [{ id: 1 }, { id: 2 }] },
    })
    expect(result.totalBalance).toBe(18000)
    expect(result.totalEquity).toBe(18700)
    expect(result.totalPnl).toBe(700)
    expect(result.totalFees).toBe(80)
    expect(result.totalTrades).toBe(150)
    expect(result.totalPositions).toBe(2)
  })

  it('identifies best and worst exchange by PnL', () => {
    const result = calcAggregateMetrics({
      binance: { balance: 10000, total_pnl: 500, total_trades: 100, winning_trades: 60 },
      okx: { balance: 8000, total_pnl: -200, total_trades: 50, winning_trades: 20 },
    })
    expect(result.bestExchange!.id).toBe('binance')
    expect(result.bestExchange!.pnl).toBe(500)
    expect(result.worstExchange!.id).toBe('okx')
    expect(result.worstExchange!.pnl).toBe(-200)
  })

  it('handles accounts with missing fields', () => {
    const result = calcAggregateMetrics({
      binance: {},
    })
    expect(result.totalBalance).toBe(0)
    expect(result.totalTrades).toBe(0)
    expect(result.totalPositions).toBe(0)
  })
})
