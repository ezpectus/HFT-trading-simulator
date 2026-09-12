import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Microstructure from '../components/Microstructure'

const BOOK = {
  exchange: 'binance',
  symbol: 'BTC/USDT',
  bids: [
    { price: 44098, quantity: 5.2 },
    { price: 44096, quantity: 8.1 },
    { price: 44090, quantity: 12.5 },
  ],
  asks: [
    { price: 44102, quantity: 3.8 },
    { price: 44105, quantity: 6.2 },
    { price: 44110, quantity: 9.8 },
  ],
}

const ORDERBOOKS = { 'binance|BTC/USDT': BOOK }

describe('Microstructure', () => {
  it('renders book notional and depth profile sections', () => {
    render(<Microstructure symbol="BTC/USDT" exchange="binance" orderbooks={ORDERBOOKS} />)
    expect(screen.getByText('Microstructure')).toBeInTheDocument()
    expect(screen.getByText(/Book Notional/)).toBeInTheDocument()
    expect(screen.getByText(/Depth Profile/)).toBeInTheDocument()
  })

  it('shows real summary stats (spread, depth, buy pressure, imbalance)', () => {
    render(<Microstructure symbol="BTC/USDT" exchange="binance" orderbooks={ORDERBOOKS} />)
    expect(screen.getByText('Spread')).toBeInTheDocument()
    expect(screen.getByText('Depth')).toBeInTheDocument()
    expect(screen.getByText('Bid Press')).toBeInTheDocument()
    expect(screen.getByText('Imbalance')).toBeInTheDocument()
  })

  it('computes real spread from best bid/ask (4 / 44100 ≈ 0.9bps)', () => {
    render(<Microstructure symbol="BTC/USDT" exchange="binance" orderbooks={ORDERBOOKS} />)
    expect(screen.getByText('0.9bps')).toBeInTheDocument()
  })

  it('shows empty state when book missing', () => {
    render(<Microstructure symbol="BTC/USDT" exchange="binance" orderbooks={{}} />)
    expect(screen.getByText(/No order book/)).toBeInTheDocument()
  })

  it('shows largest levels walls section', () => {
    render(<Microstructure symbol="BTC/USDT" exchange="binance" orderbooks={ORDERBOOKS} />)
    expect(screen.getByText(/Largest Levels/)).toBeInTheDocument()
  })
})
