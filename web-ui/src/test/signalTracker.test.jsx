import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SignalTracker from '../components/SignalTracker'

const NOW_S = Math.floor(Date.now() / 1000)

const SIGNALS = [
  { symbol: 'BTC/USDT', direction: 'LONG', confidence: 82, strategy: 'TrendFollowing', entry_price: 43000, stop_loss: 42500, take_profit: 44500, rr_ratio: 3.0, reason: 'breakout', timestamp: NOW_S - 300 },
  { symbol: 'ETH/USDT', direction: 'SHORT', confidence: 64, strategy: 'MeanReversion', entry_price: 2400, stop_loss: 2450, take_profit: 2300, rr_ratio: 2.0, reason: 'overbought', timestamp: NOW_S - 120 },
  { symbol: 'SOL/USDT', direction: 'LONG', confidence: 71, strategy: 'TrendFollowing', entry_price: 95, stop_loss: 92, take_profit: 101, rr_ratio: 2.0, reason: 'momentum', timestamp: NOW_S - 60 },
]

const PRICES = { binance: { 'BTC/USDT': 44100, 'ETH/USDT': 2350, 'SOL/USDT': 96 } }

describe('SignalTracker', () => {
  it('renders empty state when no signals', () => {
    render(<SignalTracker signals={[]} prices={{}} />)
    expect(screen.getByText('Signal Tracker')).toBeInTheDocument()
    expect(screen.getByText(/Waiting for signals/)).toBeInTheDocument()
  })

  it('renders signal history with strategies and symbols', () => {
    render(<SignalTracker signals={SIGNALS} prices={PRICES} />)
    expect(screen.getByText('Signal Tracker')).toBeInTheDocument()
    expect(screen.getByText('Signal History')).toBeInTheDocument()
    expect(screen.getAllByText('TrendFollowing').length).toBeGreaterThan(0)
    expect(screen.getAllByText('MeanReversion').length).toBeGreaterThan(0)
  })

  it('shows summary stats (win rate, avg move, avg conf, signals)', () => {
    render(<SignalTracker signals={SIGNALS} prices={PRICES} />)
    expect(screen.getByText('Win Rate')).toBeInTheDocument()
    expect(screen.getByText('Avg Move')).toBeInTheDocument()
    expect(screen.getByText('Avg Conf')).toBeInTheDocument()
    expect(screen.getByText('Signals')).toBeInTheDocument()
  })

  it('marks signals to market against live prices', () => {
    render(<SignalTracker signals={SIGNALS} prices={PRICES} />)
    // BTC LONG entry 43000 → now 44100 = +2.56%
    expect(screen.getAllByText(/\+2\.56%/).length).toBeGreaterThan(0)
  })

  it('shows by-strategy grouping', () => {
    render(<SignalTracker signals={SIGNALS} prices={PRICES} />)
    expect(screen.getByText('By Strategy')).toBeInTheDocument()
  })
})
