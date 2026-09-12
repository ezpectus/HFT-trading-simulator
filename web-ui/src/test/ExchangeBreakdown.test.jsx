import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ExchangeBreakdown from '../components/performance/ExchangeBreakdown'

const accounts = {
  binance: { balance: 1000, total_pnl: 50, total_trades: 10, winning_trades: 7 },
  bybit: { balance: 500, total_pnl: -20, total_trades: 5, winning_trades: 1 },
  okx: { balance: 2000, total_pnl: 10, total_trades: 4, winning_trades: 3 },
}

describe('ExchangeBreakdown', () => {
  it('renders nothing for empty accounts', () => {
    const { container } = render(<ExchangeBreakdown accounts={{}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for null accounts', () => {
    const { container } = render(<ExchangeBreakdown accounts={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('sorts by pnl descending by default', () => {
    render(<ExchangeBreakdown accounts={accounts} />)
    const rows = document.querySelectorAll('.capitalize')
    expect(rows[0].textContent).toBe('binance')  // pnl 50
    expect(rows[2].textContent).toBe('bybit')    // pnl -20
  })

  it('sort button cycles pnl → winRate → balance', () => {
    render(<ExchangeBreakdown accounts={accounts} />)
    const btn = screen.getByTitle(/Sort by/)
    fireEvent.click(btn)  // → winRate: okx 75%, binance 70%, bybit 20%
    let rows = document.querySelectorAll('.capitalize')
    expect(rows[0].textContent).toBe('okx')
    fireEvent.click(btn)  // → balance: okx 2000, binance 1000, bybit 500
    rows = document.querySelectorAll('.capitalize')
    expect(rows[0].textContent).toBe('okx')
    expect(rows[2].textContent).toBe('bybit')
  })

  it('shows balance, signed pnl, win rate per row', () => {
    render(<ExchangeBreakdown accounts={accounts} />)
    expect(screen.getByText('$1000.00')).toBeInTheDocument()
    expect(screen.getByText('+50.00')).toBeInTheDocument()
    expect(screen.getByText('-20.00')).toBeInTheDocument()
    expect(screen.getByText('70.0%')).toBeInTheDocument()
  })
})
