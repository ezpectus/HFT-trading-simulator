import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TaxReport from '../components/TaxReport'

describe('TaxReport', () => {
  it('renders summary with PnL, fees, and tax', () => {
    render(<TaxReport fills={null} addToast={vi.fn()} />)
    expect(screen.getByText('Tax Report')).toBeInTheDocument()
    expect(screen.getByText('Realized PnL')).toBeInTheDocument()
    expect(screen.getByText('Total Fees')).toBeInTheDocument()
    expect(screen.getByText('Est. Tax (25%)')).toBeInTheDocument()
  })

  it('shows trade history table', () => {
    render(<TaxReport fills={null} addToast={vi.fn()} />)
    expect(screen.getByText('Trade History')).toBeInTheDocument()
    expect(screen.getAllByText('BTC/USDT').length).toBeGreaterThanOrEqual(1)
  })

  it('handles null fills gracefully', () => {
    render(<TaxReport fills={null} addToast={null} />)
    expect(screen.getByText('Tax Report')).toBeInTheDocument()
  })

  it('uses provided fills when available', () => {
    const fills = [
      { id: 1, symbol: 'BTC/USDT', side: 'BUY', filled_quantity: 0.5, filled_price: 43000, timestamp: 1700000000, pnl: 100, fee: 4.3 },
    ]
    render(<TaxReport fills={fills} addToast={vi.fn()} />)
    expect(screen.getByText('Tax Report')).toBeInTheDocument()
  })
})
