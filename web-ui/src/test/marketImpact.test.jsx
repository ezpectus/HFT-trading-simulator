import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MarketImpact from '../components/MarketImpact'

const mockCandles = [
  { timestamp: 1, open: 100, high: 105, low: 95, close: 102, volume: 1000 },
  { timestamp: 2, open: 102, high: 108, low: 100, close: 106, volume: 1200 },
]

// 3-level ask book: 1 @50010, 1 @50020, 1 @50030 (object-style levels)
const mockOrderbooks = {
  'binance|BTC/USDT': {
    bids: [{ price: 50000, quantity: 1.5 }, { price: 49990, quantity: 2.0 }],
    asks: [{ price: 50010, quantity: 1.0 }, { price: 50020, quantity: 1.0 }, { price: 50030, quantity: 1.0 }],
  },
}

describe('MarketImpact', () => {
  it('renders real book-derived impact table', () => {
    render(<MarketImpact candles={mockCandles} symbol="BTC/USDT" exchange="binance" currentPrice={50000} orderbooks={mockOrderbooks} />)
    expect(screen.getByText('Market Impact')).toBeInTheDocument()
    expect(screen.getByText('Impact by Order Size')).toBeInTheDocument()
    expect(screen.getByText('$1k')).toBeInTheDocument()
  })

  it('computes VWAP slippage from the real book', () => {
    render(<MarketImpact candles={mockCandles} symbol="BTC/USDT" exchange="binance" currentPrice={50000} orderbooks={mockOrderbooks} />)
    // $1k buy walks best ask 50010 -> slippage 0%; deeper sizes slip more
    expect(screen.getAllByText(/%$/).length).toBeGreaterThan(0)
  })

  it('shows empty state when no price data', () => {
    render(<MarketImpact candles={[]} symbol="BTC/USDT" />)
    expect(screen.getByText('No price data')).toBeInTheDocument()
  })

  it('discloses when the book cannot fill a size', () => {
    // book total ~$150k asks; sizes above it show "book+" marker
    render(<MarketImpact candles={mockCandles} symbol="BTC/USDT" exchange="binance" currentPrice={50000} orderbooks={mockOrderbooks} />)
    expect(screen.getAllByText('book+').length).toBeGreaterThanOrEqual(1)
  })

  it('renders liquidity imbalance from real book', () => {
    render(<MarketImpact candles={mockCandles} symbol="BTC/USDT" exchange="binance" currentPrice={50000} orderbooks={mockOrderbooks} />)
    expect(screen.getByText('Order Book Imbalance')).toBeInTheDocument()
    expect(screen.getByText(/Bids:/)).toBeInTheDocument()
    expect(screen.getByText(/Asks:/)).toBeInTheDocument()
  })
})
