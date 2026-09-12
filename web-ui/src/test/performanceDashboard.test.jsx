import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PerformanceDashboard from '../components/PerformanceDashboard'

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addAreaSeries: vi.fn(() => ({ setData: vi.fn() })),
    applyOptions: vi.fn(),
    remove: vi.fn(),
  })),
  ColorType: { Solid: 'solid' },
}))

describe('PerformanceDashboard', () => {
  it('renders the empty state without trades or accounts', () => {
    render(<PerformanceDashboard accounts={{}} fills={[]} signals={[]} />)
    expect(screen.getByText(/no performance data/i)).toBeInTheDocument()
  })

  it('renders metric cards with account data', () => {
    const accounts = {
      binance: { balance: 10000, equity: 10500, total_pnl: 500, total_fees: 5, total_trades: 4, winning_trades: 3, positions: [] },
    }
    const fills = [
      { symbol: 'BTC/USDT', exchange: 'binance', side: 'BUY', price: 100, quantity: 1, fee: 0.1, pnl: 50, received_at: 1000 },
    ]
    render(<PerformanceDashboard accounts={accounts} fills={fills} signals={[]} />)
    expect(screen.getByText(/total balance/i)).toBeInTheDocument()
    expect(screen.getByText(/equity curve/i)).toBeInTheDocument()
  })
})
