import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ABTesting from '../components/ABTesting'

describe('ABTesting', () => {
  it('renders experiment list with names', () => {
    render(<ABTesting />)
    expect(screen.getByText('A/B Testing')).toBeInTheDocument()
    expect(screen.getByText('Aggressive vs Conservative Entry')).toBeInTheDocument()
    expect(screen.getByText('5m vs 15m Signal Interval')).toBeInTheDocument()
  })

  it('shows summary stats (experiments, completed, total trades)', () => {
    render(<ABTesting />)
    expect(screen.getByText('Experiments')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Total Trades')).toBeInTheDocument()
  })

  it('shows variant comparison data (trades, win rate, pnl, sharpe)', () => {
    render(<ABTesting />)
    expect(screen.getAllByText('Trades').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Win%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('PnL').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sharpe').length).toBeGreaterThan(0)
  })

  it('shows winner indicator for completed experiments', () => {
    render(<ABTesting />)
    expect(screen.getAllByText(/Winner:/).length).toBeGreaterThan(0)
  })

  it('shows running vs completed status badges', () => {
    render(<ABTesting />)
    expect(screen.getAllByText('RUNNING').length).toBeGreaterThan(0)
    expect(screen.getAllByText('COMPLETED').length).toBeGreaterThan(0)
  })
})
