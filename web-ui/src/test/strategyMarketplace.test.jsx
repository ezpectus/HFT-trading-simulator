import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import StrategyMarketplace from '../components/StrategyMarketplace'

describe('StrategyMarketplace', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders header with honest local-only label', async () => {
    render(<StrategyMarketplace />)
    expect(screen.getByText('Strategy Marketplace')).toBeInTheDocument()
    // It is built-in defaults + localStorage import/export — no server exists,
    // so the panel must say so rather than implying a real marketplace.
    expect(screen.getByText('local only')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('RSI Oversold Bounce')).toBeInTheDocument())
  })

  it('lists built-in default strategies', async () => {
    render(<StrategyMarketplace />)
    await waitFor(() => {
      expect(screen.getByText('EMA Crossover Trend')).toBeInTheDocument()
      expect(screen.getByText('Volume Spike Breakout')).toBeInTheDocument()
    })
  })

  it('loads imported strategies from localStorage', async () => {
    localStorage.setItem('trading-sim-strategy-marketplace', JSON.stringify([{
      id: 'imp-1', name: 'My Imported Strat', author: 'tester', version: '1.0.0',
      description: 'imported', tags: ['custom'], rules: [], indicators: [],
      schemaVersion: 1,
    }]))
    render(<StrategyMarketplace />)
    await waitFor(() => expect(screen.getByText('My Imported Strat')).toBeInTheDocument())
  })
})
