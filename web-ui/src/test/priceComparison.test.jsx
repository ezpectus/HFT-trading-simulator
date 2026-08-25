import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PriceComparison from '../components/PriceComparison'

vi.mock('../hooks/useDebounce', () => ({
  useDebounce: (value) => value,
}))

const mockPrices = {
  binance: { 'BTC/USDT': 43200, 'ETH/USDT': 2580 },
  okx: { 'BTC/USDT': 43250, 'ETH/USDT': 2585 },
  bybit: { 'BTC/USDT': 43180, 'ETH/USDT': 2578 },
}

const mockExchanges = ['binance', 'okx', 'bybit']
const mockSymbols = ['BTC/USDT', 'ETH/USDT']

describe('PriceComparison', () => {
  it('renders cross-exchange price table for symbols', () => {
    render(<PriceComparison prices={mockPrices} symbols={mockSymbols} selectedSymbol="BTC/USDT" exchanges={mockExchanges} />)
    expect(screen.getByText('Cross-Exchange Prices')).toBeInTheDocument()
    expect(screen.getByText('BTC/USDT')).toBeInTheDocument()
    expect(screen.getByText('ETH/USDT')).toBeInTheDocument()
  })

  it('shows spread and arbitrage opportunity for price differences', () => {
    render(<PriceComparison prices={mockPrices} symbols={mockSymbols} selectedSymbol="BTC/USDT" exchanges={mockExchanges} />)
    expect(screen.getAllByText(/Spread/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/bps/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows empty state when no price data', () => {
    render(<PriceComparison prices={{}} symbols={mockSymbols} selectedSymbol="BTC/USDT" exchanges={mockExchanges} />)
    expect(screen.getByText('Waiting for price data')).toBeInTheDocument()
  })

  it('handles null prices gracefully', () => {
    render(<PriceComparison prices={null} symbols={mockSymbols} selectedSymbol="BTC/USDT" exchanges={mockExchanges} />)
    expect(screen.getByText('Waiting for price data')).toBeInTheDocument()
  })

  it('highlights selected symbol with ring', () => {
    const { container } = render(<PriceComparison prices={mockPrices} symbols={mockSymbols} selectedSymbol="BTC/USDT" exchanges={mockExchanges} />)
    const selectedEl = container.querySelector('.ring-accent-blue')
    expect(selectedEl).not.toBeNull()
  })
})
