import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CrossAssetMatrix from '../components/CrossAssetMatrix'

const NOW_S = Math.floor(Date.now() / 1000)

// Two symbols with perfectly correlated returns + one independent
const mkSeries = (symbol, base, drift) =>
  Array.from({ length: 70 }, (_, i) => ({
    symbol, exchange: 'binance', timestamp: NOW_S - (70 - i) * 60,
    open: base + drift * i, high: base + drift * i + 1, low: base + drift * i - 1,
    close: base + drift * i + Math.sin(i) * 0.5, volume: 100,
  }))

const CANDLES = [
  ...mkSeries('BTC/USDT', 44000, 10),
  ...mkSeries('ETH/USDT', 2300, 0.5),
  ...mkSeries('SOL/USDT', 96, 0.02),
]

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']

describe('CrossAssetMatrix', () => {
  it('renders correlation matrix with real asset names', () => {
    render(<CrossAssetMatrix candles={CANDLES} symbols={SYMBOLS} exchange="binance" />)
    expect(screen.getByText('Cross-Asset Matrix')).toBeInTheDocument()
    expect(screen.getByText(/Correlation Matrix/)).toBeInTheDocument()
    expect(screen.getAllByText('BTC').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('ETH').length).toBeGreaterThanOrEqual(1)
  })

  it('shows summary stats (high corr, low corr, avg return, best)', () => {
    render(<CrossAssetMatrix candles={CANDLES} symbols={SYMBOLS} exchange="binance" />)
    expect(screen.getByText('High Corr')).toBeInTheDocument()
    expect(screen.getByText('Low Corr')).toBeInTheDocument()
    expect(screen.getByText('Avg Return')).toBeInTheDocument()
    expect(screen.getByText('Best')).toBeInTheDocument()
  })

  it('shows asset performance rows', () => {
    render(<CrossAssetMatrix candles={CANDLES} symbols={SYMBOLS} exchange="binance" />)
    expect(screen.getByText(/Asset Performance/)).toBeInTheDocument()
  })

  it('shows waiting state with insufficient data', () => {
    render(<CrossAssetMatrix candles={[]} symbols={SYMBOLS} exchange="binance" />)
    expect(screen.getByText(/Need ≥2 symbols/)).toBeInTheDocument()
  })
})
