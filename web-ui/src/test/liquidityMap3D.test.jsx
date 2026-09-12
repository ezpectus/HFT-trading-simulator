import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LiquidityMap3D from '../components/LiquidityMap3D'

const ORDERBOOKS = {
  'binance|BTC/USDT': {
    bids: [
      { price: 43990, quantity: 2.5 },
      { price: 43980, quantity: 1.0 },
      { price: 43970, quantity: 4.0 },
    ],
    asks: [
      { price: 44010, quantity: 1.5 },
      { price: 44020, quantity: 3.0 },
      { price: 44030, quantity: 0.5 },
    ],
  },
}

describe('LiquidityMap3D', () => {
  it('shows no-feed disclosure when the book for exchange|symbol is absent', () => {
    render(<LiquidityMap3D orderbooks={{}} exchange="binance" symbol="BTC/USDT" />)
    expect(screen.getByText('Liquidity Map 3D')).toBeInTheDocument()
    expect(screen.getByText(/No live order book for BTC\/USDT on binance/)).toBeInTheDocument()
  })

  it('renders real depth stats from the order book prop', () => {
    render(<LiquidityMap3D orderbooks={ORDERBOOKS} exchange="binance" symbol="BTC/USDT" currentPrice={44000} />)
    expect(screen.getByText('Liquidity Map 3D')).toBeInTheDocument()
    // bid depth = 2.5+1.0+4.0 = 7.5, ask depth = 1.5+3.0+0.5 = 5.0
    expect(screen.getByText('Bid Depth')).toBeInTheDocument()
    expect(screen.getByText('7.5')).toBeInTheDocument()
    expect(screen.getByText('Ask Depth')).toBeInTheDocument()
    expect(screen.getAllByText('5.0').length).toBeGreaterThanOrEqual(1)
    // imbalance = 7.5/12.5 = 60% (also appears as per-row imbalances)
    expect(screen.getAllByText('60%').length).toBeGreaterThanOrEqual(1)
  })

  it('derives bid/ask walls from the biggest real levels', () => {
    render(<LiquidityMap3D orderbooks={ORDERBOOKS} exchange="binance" symbol="BTC/USDT" currentPrice={44000} />)
    expect(screen.getByText('Bid Wall')).toBeInTheDocument()
    expect(screen.getByText('Ask Wall')).toBeInTheDocument()
    expect(screen.getByText('SUPPORT')).toBeInTheDocument()
    expect(screen.getByText('RESIST')).toBeInTheDocument()
  })

  it('shows no-feed state when book has empty sides', () => {
    render(<LiquidityMap3D orderbooks={{ 'binance|BTC/USDT': { bids: [], asks: [] } }} exchange="binance" symbol="BTC/USDT" />)
    expect(screen.getByText(/No live order book/)).toBeInTheDocument()
  })
})
