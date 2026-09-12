import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TaxReport from '../components/TaxReport'

const REAL_FILLS = [
  { id: 1, symbol: 'BTC/USDT', side: 'SELL', filled_quantity: 0.5, filled_price: 43000, timestamp: 1700000000, pnl: 150, fee: 21.5 },
  { id: 2, symbol: 'ETH/USDT', side: 'SELL', filled_quantity: 2, filled_price: 2500, timestamp: 1700100000, pnl: -40, fee: 5 },
]

describe('TaxReport', () => {
  it('computes summary from real fills', () => {
    render(<TaxReport fills={REAL_FILLS} addToast={vi.fn()} />)
    expect(screen.getByText('Tax Report')).toBeInTheDocument()
    expect(screen.getByText('Realized PnL')).toBeInTheDocument()
    expect(screen.getByText('$110.00')).toBeInTheDocument()  // 150 + (-40)
    expect(screen.getByText('$26.50')).toBeInTheDocument()   // fees 21.5 + 5
    expect(screen.getByText('$83.50')).toBeInTheDocument()   // net = 110 - 26.5
  })

  it('lists real fill rows', () => {
    render(<TaxReport fills={REAL_FILLS} addToast={vi.fn()} />)
    expect(screen.getByText('Trade History')).toBeInTheDocument()
    expect(screen.getByText('BTC/USDT')).toBeInTheDocument()
    expect(screen.getByText('ETH/USDT')).toBeInTheDocument()
  })

  it('shows honest empty state with no fills — no fabricated trades', () => {
    render(<TaxReport fills={null} addToast={null} />)
    expect(screen.getByText('No fills yet')).toBeInTheDocument()
    // previously-mocked 2024 trades must not appear
    expect(screen.queryByText('2024-01-15')).not.toBeInTheDocument()
  })
})
