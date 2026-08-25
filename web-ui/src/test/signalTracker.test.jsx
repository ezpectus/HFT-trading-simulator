import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SignalTracker from '../components/SignalTracker'

describe('SignalTracker', () => {
  it('renders signal history with strategies and symbols', () => {
    render(<SignalTracker />)
    expect(screen.getByText('Signal Tracker')).toBeInTheDocument()
    expect(screen.getByText('Signal History')).toBeInTheDocument()
    expect(screen.getAllByText('TrendFollowing').length).toBeGreaterThan(0)
    expect(screen.getAllByText('MeanReversion').length).toBeGreaterThan(0)
  })

  it('shows summary stats (win rate, avg pnl, avg conf, signals)', () => {
    render(<SignalTracker />)
    expect(screen.getByText('Win Rate')).toBeInTheDocument()
    expect(screen.getByText('Avg PnL')).toBeInTheDocument()
    expect(screen.getByText('Avg Conf')).toBeInTheDocument()
    expect(screen.getByText('Signals')).toBeInTheDocument()
  })

  it('renders by-strategy breakdown', () => {
    render(<SignalTracker />)
    expect(screen.getByText('By Strategy')).toBeInTheDocument()
  })

  it('shows open and closed status badges', () => {
    render(<SignalTracker />)
    expect(screen.getAllByText('open').length).toBeGreaterThan(0)
    expect(screen.getAllByText('closed').length).toBeGreaterThan(0)
  })

  it('shows win/loss counts in footer', () => {
    render(<SignalTracker />)
    expect(screen.getByText(/wins/)).toBeInTheDocument()
    expect(screen.getByText(/losses/)).toBeInTheDocument()
  })
})
