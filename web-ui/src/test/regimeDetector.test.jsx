import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RegimeDetector from '../components/RegimeDetector'

const NOW_S = Math.floor(Date.now() / 1000)
const CANDLES = Array.from({ length: 40 }, (_, i) => ({
  symbol: 'BTC/USDT', exchange: 'binance', timestamp: NOW_S - (40 - i) * 60,
  open: 43000 + i * 10, high: 43100 + i * 10, low: 42900 + i * 10,
  close: 43050 + i * 10, volume: 100,
}))

const REGIME = { type: 'market_regime', symbol: 'BTC/USDT', regime: 'TRENDING', trend_score: 0.72, cycle_strength: 0.31, timestamp: NOW_S }

describe('RegimeDetector', () => {
  it('renders broadcast regime with scores', () => {
    render(<RegimeDetector symbol="BTC/USDT" exchange="binance" candles={CANDLES} regime={REGIME} />)
    expect(screen.getByText('Regime Detector')).toBeInTheDocument()
    expect(screen.getByText(/Current Regime/)).toBeInTheDocument()
    expect(screen.getByText('TRENDING')).toBeInTheDocument()
    expect(screen.getByText(/trend 0\.72/)).toBeInTheDocument()
  })

  it('shows classifier score bars', () => {
    render(<RegimeDetector symbol="BTC/USDT" exchange="binance" candles={CANDLES} regime={REGIME} />)
    expect(screen.getByText('Classifier Scores')).toBeInTheDocument()
    expect(screen.getByText('Trend Score')).toBeInTheDocument()
    expect(screen.getByText('Cycle Strength')).toBeInTheDocument()
  })

  it('renders real statistical indicators from candles', () => {
    render(<RegimeDetector symbol="BTC/USDT" exchange="binance" candles={CANDLES} regime={REGIME} />)
    expect(screen.getByText(/Statistical Indicators/)).toBeInTheDocument()
    expect(screen.getByText('Realized Vol')).toBeInTheDocument()
    expect(screen.getByText('Kurtosis')).toBeInTheDocument()
    expect(screen.getByText('Trend Slope')).toBeInTheDocument()
  })

  it('shows honest empty state without regime broadcast', () => {
    render(<RegimeDetector symbol="BTC/USDT" exchange="binance" candles={CANDLES} regime={null} />)
    expect(screen.getByText(/No regime broadcast yet/)).toBeInTheDocument()
  })

  it('shows waiting state with too few candles', () => {
    render(<RegimeDetector symbol="BTC/USDT" exchange="binance" candles={CANDLES.slice(0, 5)} regime={REGIME} />)
    expect(screen.getByText(/Need ≥20 candles/)).toBeInTheDocument()
  })
})
