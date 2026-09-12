import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SlippageAnalytics from '../components/SlippageAnalytics'

const NOW_S = Math.floor(Date.now() / 1000)

const FILLS = [
  { id: 'a', symbol: 'BTC/USDT', exchange: 'binance', side: 'BUY', quantity: 0.5, filled_quantity: 0.5, filled_price: 44102.5, slippage: 2.5, fee: 3.3, status: 'FILLED', timestamp: NOW_S },
  { id: 'b', symbol: 'BTC/USDT', exchange: 'binance', side: 'BUY', quantity: 5.0, filled_quantity: 5.0, filled_price: 44125.0, slippage: 25.0, fee: 16.5, status: 'FILLED', timestamp: NOW_S },
  { id: 'c', symbol: 'ETH/USDT', exchange: 'okx', side: 'SELL', quantity: 3.0, filled_quantity: 3.0, filled_price: 2351.2, slippage: 1.2, fee: 5.3, status: 'FILLED', timestamp: NOW_S },
  { id: 'd', symbol: 'SOL/USDT', exchange: 'bybit', side: 'BUY', quantity: 50, filled_quantity: 50, filled_price: 96.25, slippage: 0.25, fee: 3.6, status: 'FILLED', timestamp: NOW_S },
]

describe('SlippageAnalytics', () => {
  it('renders slippage by order size and venue comparison', () => {
    render(<SlippageAnalytics fills={FILLS} symbol="BTC/USDT" />)
    expect(screen.getByText('Slippage Analytics')).toBeInTheDocument()
    expect(screen.getByText('Slippage by Order Size')).toBeInTheDocument()
    expect(screen.getByText('Venue Comparison')).toBeInTheDocument()
  })

  it('shows summary stats (avg, max, executions)', () => {
    render(<SlippageAnalytics fills={FILLS} symbol="BTC/USDT" />)
    expect(screen.getByText('Avg Slippage')).toBeInTheDocument()
    expect(screen.getByText('Max Slippage')).toBeInTheDocument()
    expect(screen.getByText('Executions')).toBeInTheDocument()
  })

  it('renders size buckets with counts', () => {
    render(<SlippageAnalytics fills={FILLS} symbol="BTC/USDT" />)
    expect(screen.getByText('< 1k')).toBeInTheDocument()
    expect(screen.getByText('> 50k')).toBeInTheDocument()
  })

  it('shows empty state with no fills', () => {
    render(<SlippageAnalytics fills={[]} symbol="BTC/USDT" />)
    expect(screen.getByText(/No fills yet/)).toBeInTheDocument()
  })

  it('computes real venue stats grouped by exchange', () => {
    render(<SlippageAnalytics fills={FILLS} symbol="BTC/USDT" />)
    expect(screen.getAllByText('binance').length).toBeGreaterThan(0)
    expect(screen.getAllByText('okx').length).toBeGreaterThan(0)
    expect(screen.getAllByText('bybit').length).toBeGreaterThan(0)
  })
})
