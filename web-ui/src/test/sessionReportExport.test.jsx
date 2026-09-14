/**
 * Tests for SessionReportExport component
 * Wire contract: Account.to_dict -> { total_pnl, trade_history, equity, balance }
 *                ClosedTrade.to_dict -> { pnl, closed_at (seconds) }
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SessionReportExport from '../components/SessionReportExport'

function makeTrade(overrides = {}) {
  return {
    symbol: 'BTC/USDT', exchange: 'binance', side: 'BUY',
    quantity: 1, entry_price: 100, exit_price: 110,
    pnl: 100, fee: 0.5, reason: 'TP',
    opened_at: 1700000000, closed_at: 1700003600,
    ...overrides,
  }
}
const acct = (over = {}) => ({
  exchange: 'binance', balance: 10000, equity: 10100, currency: 'USDT',
  positions: [], trade_history: [], total_pnl: 100, total_trades: 1, ...over,
})

describe('SessionReportExport', () => {
  it('renders title with empty accounts', () => {
    render(<SessionReportExport accounts={{}} fills={[]} candles={{}} />)
    expect(screen.getByText('Session Report Export')).toBeDefined()
  })

  it('sums PnL from total_pnl (not realized_pnl fantasy field)', () => {
    const accounts = { binance: acct({ total_pnl: 250 }) }
    render(<SessionReportExport accounts={accounts} fills={[]} candles={{}} />)
    expect(screen.getByText('+$250.00')).toBeDefined()
  })

  it('counts trades from trade_history length', () => {
    const accounts = {
      binance: acct({ trade_history: [makeTrade(), makeTrade({ pnl: -20 })] }),
    }
    render(<SessionReportExport accounts={accounts} fills={[]} candles={{}} />)
    expect(screen.getByText('2')).toBeDefined()
  })

  it('renders zero PnL when account has no total_pnl', () => {
    const accounts = { binance: { exchange: 'binance', trade_history: [] } }
    render(<SessionReportExport accounts={accounts} fills={[]} candles={{}} />)
    expect(screen.getByText('+$0.00')).toBeDefined()
  })

  it('shows negative PnL with minus styling', () => {
    const accounts = { binance: acct({ total_pnl: -150 }) }
    render(<SessionReportExport accounts={accounts} fills={[]} candles={{}} />)
    expect(screen.getByText('$-150.00')).toBeDefined()
  })

  it('renders export button', () => {
    render(<SessionReportExport accounts={{}} fills={[]} candles={{}} />)
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(1)
  })
})
