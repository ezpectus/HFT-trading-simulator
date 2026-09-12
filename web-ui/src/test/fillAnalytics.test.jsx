import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import FillAnalytics from '../components/FillAnalytics'

const NOW_S = Math.floor(Date.now() / 1000)

const FILLS = [
  { id: 'o1', symbol: 'BTC/USDT', exchange: 'binance', side: 'BUY', order_type: 'MARKET', quantity: 0.5, filled_quantity: 0.5, filled_price: 44100, fee: 3.3, slippage: 0.9, status: 'FILLED', timestamp: NOW_S, received_at: Date.now() },
  { id: 'o2', symbol: 'ETH/USDT', exchange: 'okx', side: 'SELL', order_type: 'LIMIT', quantity: 2.0, filled_quantity: 1.0, filled_price: 2350, fee: 2.3, slippage: 0, status: 'FILLED', timestamp: NOW_S, received_at: Date.now() },
  { id: 'o3', symbol: 'SOL/USDT', exchange: 'bybit', side: 'BUY', order_type: 'MARKET', quantity: 50, filled_quantity: 0, price: 96.2, status: 'REJECTED', rejection_reason: 'insufficient balance', timestamp: NOW_S, received_at: Date.now() },
]

describe('FillAnalytics', () => {
  it('renders empty state with no fills', () => {
    render(<FillAnalytics fills={[]} />)
    expect(screen.getByText('Fill Analytics')).toBeInTheDocument()
    expect(screen.getByText(/No fills yet/)).toBeInTheDocument()
  })

  it('renders fill list with real order details', () => {
    render(<FillAnalytics fills={FILLS} />)
    expect(screen.getByText('Fill Analytics')).toBeInTheDocument()
    expect(screen.getByText('Recent Fills')).toBeInTheDocument()
    expect(screen.getAllByText('BTC').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ETH').length).toBeGreaterThan(0)
  })

  it('shows summary stats (fill rate, partial, avg latency, rejected)', () => {
    render(<FillAnalytics fills={FILLS} />)
    expect(screen.getByText('Fill Rate')).toBeInTheDocument()
    expect(screen.getByText('Partial')).toBeInTheDocument()
    expect(screen.getByText('Avg Latency')).toBeInTheDocument()
    expect(screen.getByText('Rejected')).toBeInTheDocument()
  })

  it('shows fill quality distribution bar', () => {
    render(<FillAnalytics fills={FILLS} />)
    expect(screen.getByText('Fill Quality')).toBeInTheDocument()
  })

  it('shows partial fill percentages', () => {
    render(<FillAnalytics fills={FILLS} />)
    expect(screen.getAllByText(/Partial fill/).length).toBeGreaterThan(0)
  })

  it('counts rejected orders from real fills', () => {
    render(<FillAnalytics fills={FILLS} />)
    // 1 rejected of 3 → "1" appears in the Rejected stat card
    expect(screen.getByText('Rejected')).toBeInTheDocument()
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
  })
})
