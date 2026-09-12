import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ArbScanner from '../components/ArbScanner'

const ARB = {
  type: 'arbitrage_scan',
  active_count: 2,
  active: [
    { symbol: 'BTC/USDT', buy_exchange: 'binance', sell_exchange: 'okx', buy_price: 44000, sell_price: 44200, net_spread: 140, spread_bps: 31.8, max_quantity: 0.4, estimated_profit: 56.0, timestamp: 1700000000 },
    { symbol: 'ETH/USDT', buy_exchange: 'bybit', sell_exchange: 'binance', buy_price: 2300, sell_price: 2312, net_spread: 8.5, spread_bps: 36.9, max_quantity: 3.0, estimated_profit: 25.5, timestamp: 1700000000 },
  ],
  stats: { total_detected: 12, total_estimated_profit: 300.5, best_spread_bps: 45.2, total_closed: 7, total_expired: 3 },
}

describe('ArbScanner', () => {
  it('renders opportunities list with real paths and profits', () => {
    render(<ArbScanner arbitrage={ARB} />)
    expect(screen.getByText('Arbitrage Scanner')).toBeInTheDocument()
    expect(screen.getByText('Opportunities')).toBeInTheDocument()
    expect(screen.getByText('binance → okx')).toBeInTheDocument()
    expect(screen.getByText('bybit → binance')).toBeInTheDocument()
  })

  it('shows summary stats (active, est profit, avg spread, best)', () => {
    render(<ArbScanner arbitrage={ARB} />)
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Est Profit')).toBeInTheDocument()
    expect(screen.getByText('Avg Spread')).toBeInTheDocument()
    expect(screen.getByText('Best')).toBeInTheDocument()
  })

  it('renders session scan stats', () => {
    render(<ArbScanner arbitrage={ARB} />)
    expect(screen.getByText(/Scanner Stats/)).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument() // total_detected
  })

  it('shows empty state with no opportunities', () => {
    render(<ArbScanner arbitrage={{ active: [], stats: {} }} />)
    expect(screen.getByText(/No active arbitrage/)).toBeInTheDocument()
  })

  it('handles null arbitrage gracefully', () => {
    render(<ArbScanner arbitrage={null} />)
    expect(screen.getByText('Arbitrage Scanner')).toBeInTheDocument()
  })
})
