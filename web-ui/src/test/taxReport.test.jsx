import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TaxReport from '../components/TaxReport'

// ClosedTrade wire shape: pnl/fee/exit_price/closed_at — no `id`, no `timestamp`
const ACCOUNTS = {
  binance: {
    exchange: 'binance',
    trade_history: [
      { symbol: 'BTC/USDT', exchange: 'binance', side: 'SELL', quantity: 0.5, entry_price: 42000, exit_price: 43000, pnl: 150, fee: 21.5, reason: 'MANUAL', opened_at: 1699900000, closed_at: 1700000000 },
      { symbol: 'ETH/USDT', exchange: 'binance', side: 'SELL', quantity: 2, entry_price: 2600, exit_price: 2500, pnl: -40, fee: 5, reason: 'MANUAL', opened_at: 1700000000, closed_at: 1700100000 },
    ],
  },
}

describe('TaxReport', () => {
  it('computes summary from real closed trades', () => {
    render(<TaxReport accounts={ACCOUNTS} addToast={vi.fn()} />)
    expect(screen.getByText('Tax Report')).toBeInTheDocument()
    expect(screen.getByText('Realized PnL')).toBeInTheDocument()
    expect(screen.getByText('$110.00')).toBeInTheDocument()  // 150 + (-40)
    expect(screen.getByText('$26.50')).toBeInTheDocument()   // fees 21.5 + 5
    expect(screen.getByText('$83.50')).toBeInTheDocument()   // net = 110 - 26.5
  })

  it('lists real trade rows', () => {
    render(<TaxReport accounts={ACCOUNTS} addToast={vi.fn()} />)
    expect(screen.getByText('Trade History')).toBeInTheDocument()
    expect(screen.getByText('BTC/USDT')).toBeInTheDocument()
    expect(screen.getByText('ETH/USDT')).toBeInTheDocument()
  })

  it('shows honest empty state with no trades — no fabricated rows', () => {
    render(<TaxReport accounts={null} addToast={null} />)
    expect(screen.getByText('No closed trades yet')).toBeInTheDocument()
    // previously-mocked 2024 trades must not appear
    expect(screen.queryByText('2024-01-15')).not.toBeInTheDocument()
  })
})
