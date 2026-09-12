import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TCA from '../components/TCA'

const NOW_S = Math.floor(Date.now() / 1000)

const FILLS = [
  { id: '1', symbol: 'BTC/USDT', exchange: 'binance', side: 'BUY', order_type: 'MARKET', quantity: 0.5, filled_quantity: 0.5, filled_price: 44100, slippage: 2.5, fee: 11.0, status: 'FILLED', timestamp: NOW_S },
  { id: '2', symbol: 'ETH/USDT', exchange: 'okx', side: 'SELL', order_type: 'LIMIT', quantity: 3.2, filled_quantity: 3.2, filled_price: 2350, slippage: 1.8, fee: 3.8, status: 'FILLED', timestamp: NOW_S },
  { id: '3', symbol: 'SOL/USDT', exchange: 'bybit', side: 'BUY', order_type: 'MARKET', quantity: 50, filled_quantity: 50, filled_price: 96.2, slippage: 0.5, fee: 2.4, status: 'FILLED', timestamp: NOW_S },
]

describe('TCA', () => {
  it('renders execution list with real symbols and costs', () => {
    render(<TCA fills={FILLS} />)
    expect(screen.getByText('Transaction Cost Analysis')).toBeInTheDocument()
    expect(screen.getByText('Recent Executions')).toBeInTheDocument()
    expect(screen.getAllByText('BTC').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ETH').length).toBeGreaterThan(0)
  })

  it('shows summary stats (total cost, avg slippage, cost bps, fees)', () => {
    render(<TCA fills={FILLS} />)
    expect(screen.getByText('Total Cost')).toBeInTheDocument()
    expect(screen.getByText('Avg Slip')).toBeInTheDocument()
    expect(screen.getByText('Cost bps')).toBeInTheDocument()
    expect(screen.getByText('Fees')).toBeInTheDocument()
  })

  it('shows cost breakdown from real fee/slippage data', () => {
    render(<TCA fills={FILLS} />)
    expect(screen.getByText('Cost Breakdown')).toBeInTheDocument()
    expect(screen.getByText('Slippage')).toBeInTheDocument()
    expect(screen.getByText('Exchange Fees')).toBeInTheDocument()
  })

  it('shows empty state with no fills', () => {
    render(<TCA fills={[]} />)
    expect(screen.getByText(/No fills yet/)).toBeInTheDocument()
  })
})
