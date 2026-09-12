import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FeatureStudio from '../components/FeatureStudio'

const NOW_S = Math.floor(Date.now() / 1000)
const CANDLES = Array.from({ length: 60 }, (_, i) => ({
  symbol: 'BTC/USDT', exchange: 'binance', timestamp: NOW_S - (60 - i) * 60,
  open: 43000 + i * 10 + Math.sin(i) * 50, high: 43100 + i * 10, low: 42900 + i * 10,
  close: 43050 + i * 10 + Math.sin(i) * 50, volume: 100 + i,
}))

describe('FeatureStudio', () => {
  it('renders computed feature list from real candles', () => {
    render(<FeatureStudio candles={CANDLES} symbol="BTC/USDT" exchange="binance" />)
    expect(screen.getByText('Feature Studio')).toBeInTheDocument()
    expect(screen.getByText('rsi_14')).toBeInTheDocument()
    expect(screen.getByText('ema_cross_5_20')).toBeInTheDocument()
    expect(screen.getByText('volatility_20')).toBeInTheDocument()
    expect(screen.getByText('macd_hist')).toBeInTheDocument()
  })

  it('shows real stats (avg corr, strong, window)', () => {
    render(<FeatureStudio candles={CANDLES} symbol="BTC/USDT" exchange="binance" />)
    expect(screen.getByText('Avg |Corr|')).toBeInTheDocument()
    expect(screen.getByText('Strong (>0.1)')).toBeInTheDocument()
    expect(screen.getByText('60 bars')).toBeInTheDocument()
  })

  it('filters features by category', () => {
    render(<FeatureStudio candles={CANDLES} symbol="BTC/USDT" exchange="binance" />)
    const momentumBtn = screen.getAllByText('Momentum').find(el => el.tagName === 'BUTTON')
    fireEvent.click(momentumBtn)
    expect(screen.getByText('rsi_14')).toBeInTheDocument()
    expect(screen.queryByText('volatility_20')).not.toBeInTheDocument()
  })

  it('toggles feature ON/OFF', () => {
    render(<FeatureStudio candles={CANDLES} symbol="BTC/USDT" exchange="binance" />)
    const onBadges = screen.getAllByText('ON')
    expect(onBadges.length).toBe(7)
    fireEvent.click(onBadges[0])
    expect(screen.getAllByText('OFF').length).toBe(1)
  })

  it('shows empty state with too few candles', () => {
    render(<FeatureStudio candles={CANDLES.slice(0, 10)} symbol="BTC/USDT" exchange="binance" />)
    expect(screen.getByText(/Need ≥30 candles/)).toBeInTheDocument()
  })
})
