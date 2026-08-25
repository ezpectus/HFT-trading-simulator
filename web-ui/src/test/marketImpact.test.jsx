import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MarketImpact from '../components/MarketImpact'

const mockCandles = [
  { timestamp: 1, open: 100, high: 105, low: 95, close: 102, volume: 1000 },
  { timestamp: 2, open: 102, high: 108, low: 100, close: 106, volume: 1200 },
  { timestamp: 3, open: 106, high: 110, low: 104, close: 108, volume: 900 },
]

describe('MarketImpact', () => {
  it('renders impact table with order sizes', () => {
    render(<MarketImpact candles={mockCandles} symbol="BTC/USDT" currentPrice={50000} />)
    expect(screen.getByText('Market Impact')).toBeInTheDocument()
    expect(screen.getByText('Impact by Order Size')).toBeInTheDocument()
    expect(screen.getByText('$1k')).toBeInTheDocument()
    expect(screen.getByText('$500k')).toBeInTheDocument()
  })

  it('shows current price', () => {
    render(<MarketImpact candles={mockCandles} symbol="BTC/USDT" currentPrice={50000} />)
    expect(screen.getByText('$50,000.00')).toBeInTheDocument()
  })

  it('shows empty state when no price data', () => {
    render(<MarketImpact candles={[]} symbol="BTC/USDT" />)
    expect(screen.getByText('No price data')).toBeInTheDocument()
  })

  it('renders liquidity imbalance when orderbook provided', () => {
    const mockOrderbooks = {
      'binance|BTC/USDT': {
        bids: [[50000, 1.5], [49990, 2.0], [49980, 1.0]],
        asks: [[50010, 1.2], [50020, 1.8], [50030, 0.8]],
      },
    }
    render(<MarketImpact candles={mockCandles} symbol="BTC/USDT" exchange="binance" currentPrice={50000} orderbooks={mockOrderbooks} />)
    expect(screen.getByText('Order Book Imbalance')).toBeInTheDocument()
    expect(screen.getByText(/Bids:/)).toBeInTheDocument()
    expect(screen.getByText(/Asks:/)).toBeInTheDocument()
  })

  it('shows warning about large orders', () => {
    render(<MarketImpact candles={mockCandles} symbol="BTC/USDT" currentPrice={50000} />)
    expect(screen.getByText(/Orders.*\$50k.*may move price/)).toBeInTheDocument()
  })
})
