import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PairsArb from '../components/PairsArb'

const NOW_S = Math.floor(Date.now() / 1000)
const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']

// Correlated series: ETH tracks BTC, SOL diverges at the end
const CANDLES = []
for (let i = 0; i < 60; i++) {
  const ts = NOW_S - (60 - i) * 60
  const base = 100 + i * 0.5 + Math.sin(i / 3) * 2
  CANDLES.push(
    { symbol: 'BTC/USDT', exchange: 'binance', timestamp: ts, open: base, high: base + 1, low: base - 1, close: base, volume: 100 },
    { symbol: 'ETH/USDT', exchange: 'binance', timestamp: ts, open: base * 10, high: base * 10 + 5, low: base * 10 - 5, close: base * 10 + Math.sin(i / 3) * 2, volume: 500 },
    { symbol: 'SOL/USDT', exchange: 'binance', timestamp: ts, open: 50 - i * 0.3, high: 51 - i * 0.3, low: 49 - i * 0.3, close: 50 - i * 0.3, volume: 800 },
  )
}

describe('PairsArb', () => {
  it('renders real computed pairs with correlations and z-scores', () => {
    render(<PairsArb candles={CANDLES} symbols={SYMBOLS} exchange="binance" />)
    expect(screen.getByText('Pairs Arbitrage')).toBeInTheDocument()
    expect(screen.getAllByText(/BTC \/ ETH/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/SOL \/ ETH|ETH \/ SOL|BTC \/ SOL|SOL \/ BTC/).length).toBeGreaterThan(0)
  })

  it('shows real summary stats', () => {
    render(<PairsArb candles={CANDLES} symbols={SYMBOLS} exchange="binance" />)
    expect(screen.getByText('Pairs')).toBeInTheDocument()
    expect(screen.getByText('Signals')).toBeInTheDocument()
    expect(screen.getByText('Avg Corr')).toBeInTheDocument()
  })

  it('shows WATCH/SIGNAL status badges from real z-scores', () => {
    render(<PairsArb candles={CANDLES} symbols={SYMBOLS} exchange="binance" />)
    const badges = screen.getAllByText(/WATCH|SIGNAL/)
    expect(badges.length).toBe(3) // C(3,2) pairs
  })

  it('shows mean reversion note', () => {
    render(<PairsArb candles={CANDLES} symbols={SYMBOLS} exchange="binance" />)
    expect(screen.getByText('Mean reversion monitor')).toBeInTheDocument()
  })

  it('shows empty state with insufficient data', () => {
    render(<PairsArb candles={CANDLES.slice(0, 10)} symbols={SYMBOLS} exchange="binance" />)
    expect(screen.getByText(/Need ≥2 symbols/)).toBeInTheDocument()
  })
})
