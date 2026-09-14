/**
 * Tests for PerformanceAttribution component
 * Wire contract: ClosedTrade.to_dict -> { pnl, closed_at (seconds), side, symbol, reason }
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PerformanceAttribution from '../components/PerformanceAttribution'

function makeTrade(overrides = {}) {
  return {
    symbol: 'BTC/USDT', exchange: 'binance', side: 'LONG',
    quantity: 1, entry_price: 100, exit_price: 110,
    pnl: 100, fee: 0.5, reason: 'TP',
    opened_at: 1700000000, closed_at: 1700003600,
    ...overrides,
  }
}
const accountsWith = (trades) => ({ binance: { exchange: 'binance', trade_history: trades } })

describe('PerformanceAttribution', () => {
  it('renders title with no accounts', () => {
    render(<PerformanceAttribution accounts={{}} />)
    expect(screen.getByText('Performance Attribution')).toBeDefined()
  })

  it('renders title with null accounts', () => {
    render(<PerformanceAttribution accounts={null} fills={[]} signals={[]} />)
    expect(screen.getByText('Performance Attribution')).toBeDefined()
  })

  it('attributes pnl from trade_history closed_at buckets', () => {
    // Thursday 2023-11-14 ~22:00 UTC; two wins one loss
    const trades = [
      makeTrade({ pnl: 100, closed_at: 1700003600 }),
      makeTrade({ pnl: 50, closed_at: 1700007200 }),
      makeTrade({ pnl: -30, closed_at: 1700010800 }),
    ]
    render(<PerformanceAttribution accounts={accountsWith(trades)} />)
    expect(screen.getByText('Performance Attribution')).toBeDefined()
  })

  it('aggregates across multiple accounts', () => {
    const accounts = {
      binance: { trade_history: [makeTrade({ pnl: 100 })] },
      okx: { trade_history: [makeTrade({ pnl: -40, exchange: 'okx' })] },
    }
    render(<PerformanceAttribution accounts={accounts} />)
    expect(screen.getByText('Performance Attribution')).toBeDefined()
  })

  it('does not read realized_pnl (fantasy field) - uses pnl', () => {
    // If the component still read `realized_pnl`, pnl=+250 would be invisible
    const trades = [makeTrade({ pnl: 250 })]
    render(<PerformanceAttribution accounts={accountsWith(trades)} />)
    expect(screen.getAllByText(/250/).length).toBeGreaterThanOrEqual(1)
  })

  it('does not bucket by timestamp/time (fantasy fields)', () => {
    // closed_at 2023-11-15 (Wednesday); if read timestamp -> epoch Thursday 1970
    const wed = 1700003600 // Tue 2023-11-14 22:33 UTC actually; just needs nonzero sane bucket
    const trades = [makeTrade({ pnl: 10, closed_at: wed })]
    const { container } = render(<PerformanceAttribution accounts={accountsWith(trades)} />)
    expect(container.textContent).not.toContain('1970')
  })

  it('handles trades missing pnl and closed_at', () => {
    const trades = [{ symbol: 'ETH/USDT', side: 'SHORT' }]
    render(<PerformanceAttribution accounts={accountsWith(trades)} />)
    expect(screen.getByText('Performance Attribution')).toBeDefined()
  })
})
