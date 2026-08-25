import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PairsArb from '../components/PairsArb'

describe('PairsArb', () => {
  it('renders pairs table with correlations and z-scores', () => {
    render(<PairsArb />)
    expect(screen.getByText('Pairs Arbitrage')).toBeInTheDocument()
    expect(screen.getByText('Pairs')).toBeInTheDocument()
    expect(screen.getByText('BTC / ETH')).toBeInTheDocument()
    expect(screen.getByText('SOL / AVAX')).toBeInTheDocument()
  })

  it('shows summary stats (open, signals, PnL, avg corr)', () => {
    render(<PairsArb />)
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Signals')).toBeInTheDocument()
    expect(screen.getByText('Open PnL')).toBeInTheDocument()
    expect(screen.getByText('Avg Corr')).toBeInTheDocument()
  })

  it('shows status badges for pairs', () => {
    render(<PairsArb />)
    expect(screen.getAllByText('OPEN').length).toBeGreaterThan(0)
    expect(screen.getAllByText('SIGNAL').length).toBeGreaterThan(0)
    expect(screen.getAllByText('CLOSED').length).toBeGreaterThan(0)
  })

  it('shows signal alerts for pairs with signal status', () => {
    render(<PairsArb />)
    expect(screen.getByText(/z-score 3.2/)).toBeInTheDocument()
    expect(screen.getByText(/z-score -2.8/)).toBeInTheDocument()
  })

  it('shows mean reversion strategy note', () => {
    render(<PairsArb />)
    expect(screen.getByText('Mean reversion strategy')).toBeInTheDocument()
  })
})
