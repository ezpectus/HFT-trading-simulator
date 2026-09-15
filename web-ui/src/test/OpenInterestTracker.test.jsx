import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import OpenInterestTracker from '../components/OpenInterestTracker'

const CANDLES = Array.from({ length: 30 }, (_, i) => ({
  exchange: 'binance', symbol: 'BTC/USDT', time: 1000 + i,
  open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 500 + i * 10,
}))

describe('OpenInterestTracker', () => {
  it('shows empty state with <10 matching candles', () => {
    render(<OpenInterestTracker candles={[]} fills={[]} symbol="BTC/USDT" exchange="binance" />)
    expect(screen.getByText('Open Interest')).toBeInTheDocument()
    expect(screen.getByText('Not enough data')).toBeInTheDocument()
  })

  it('filters candles by exchange+symbol', () => {
    const foreign = CANDLES.map(c => ({ ...c, exchange: 'bybit' }))
    render(<OpenInterestTracker candles={foreign} fills={[]} symbol="BTC/USDT" exchange="binance" />)
    expect(screen.getByText('Not enough data')).toBeInTheDocument()
  })

  it('renders OI estimate + divergence without crashing (S365 regression)', () => {
    const { container } = render(
      <OpenInterestTracker candles={CANDLES} fills={[]} symbol="BTC/USDT" exchange="binance" />
    )
    expect(screen.getByText('Open Interest Tracker')).toBeInTheDocument()
    expect(screen.getByText('Est. OI')).toBeInTheDocument()
    // chart paths must carry real coordinates, not NaN
    for (const path of container.querySelectorAll('path')) {
      expect(path.getAttribute('d')).not.toContain('NaN')
    }
  })
})
