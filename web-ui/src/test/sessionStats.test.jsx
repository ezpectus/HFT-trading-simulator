/**
 * SessionStats — session timer + real trade aggregation from accounts.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import SessionStats from '../components/SessionStats'

const ACCOUNTS = {
  binance: {
    trade_history: [
      { symbol: 'BTC/USDT', pnl: 120, closed_at: 1 },
      { symbol: 'ETH/USDT', pnl: -40, closed_at: 2 },
      { symbol: 'BTC/USDT', pnl: 60, closed_at: 3 },
    ],
  },
}

describe('SessionStats', () => {
  beforeEach(() => localStorage.clear())

  it('aggregates real trades: count, win rate, PnL', () => {
    render(<SessionStats accounts={ACCOUNTS} fills={[]} />)
    expect(screen.getByText('Session Stats')).toBeInTheDocument()
    // 3 trades, 2 wins → 66.7%
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText(/66\.7%|67%|66%/)).toBeInTheDocument()
    // net pnl = 120 - 40 + 60 = 140
    expect(screen.getByText(/140/)).toBeInTheDocument()
  })

  it('creates a session start in localStorage on first mount', () => {
    render(<SessionStats accounts={{}} fills={[]} />)
    expect(localStorage.getItem('trading-sim-session-start')).not.toBeNull()
  })

  it('handles zero trades without NaN', () => {
    render(<SessionStats accounts={{ binance: { trade_history: [] } }} fills={[]} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })
})
