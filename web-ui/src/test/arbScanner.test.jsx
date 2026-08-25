import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ArbScanner from '../components/ArbScanner'

describe('ArbScanner', () => {
  it('renders opportunities list with paths and profits', () => {
    render(<ArbScanner />)
    expect(screen.getByText('Arbitrage Scanner')).toBeInTheDocument()
    expect(screen.getByText('Opportunities')).toBeInTheDocument()
    expect(screen.getByText('BTC → ETH → USDT → BTC')).toBeInTheDocument()
  })

  it('shows summary stats (active, est profit, avg spread, best)', () => {
    render(<ArbScanner />)
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Est Profit')).toBeInTheDocument()
    expect(screen.getByText('Avg Spread')).toBeInTheDocument()
    expect(screen.getByText('Best')).toBeInTheDocument()
  })

  it('renders exchange scan stats', () => {
    render(<ArbScanner />)
    expect(screen.getByText('Exchange Scan Stats')).toBeInTheDocument()
    expect(screen.getByText('Binance')).toBeInTheDocument()
    expect(screen.getByText('OKX')).toBeInTheDocument()
    expect(screen.getByText('Bybit')).toBeInTheDocument()
  })

  it('shows status badges (active, fading, closing)', () => {
    render(<ArbScanner />)
    expect(screen.getAllByText('ACTIVE').length).toBeGreaterThan(0)
    expect(screen.getAllByText('FADING').length).toBeGreaterThan(0)
  })

  it('shows active opportunities alert', () => {
    render(<ArbScanner />)
    expect(screen.getByText(/active opportunities/)).toBeInTheDocument()
  })
})
