import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TCA from '../components/TCA'

describe('TCA', () => {
  it('renders execution list with symbols and costs', () => {
    render(<TCA />)
    expect(screen.getByText('Transaction Cost Analysis')).toBeInTheDocument()
    expect(screen.getByText('Recent Executions')).toBeInTheDocument()
    expect(screen.getAllByText('BTC').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ETH').length).toBeGreaterThan(0)
  })

  it('shows summary stats (total cost, avg slippage, cost bps, fees)', () => {
    render(<TCA />)
    expect(screen.getByText('Total Cost')).toBeInTheDocument()
    expect(screen.getByText('Avg Slip')).toBeInTheDocument()
    expect(screen.getByText('Cost bps')).toBeInTheDocument()
    expect(screen.getByText('Fees')).toBeInTheDocument()
  })

  it('renders cost breakdown with components', () => {
    render(<TCA />)
    expect(screen.getByText('Cost Breakdown')).toBeInTheDocument()
    expect(screen.getByText('Slippage')).toBeInTheDocument()
    expect(screen.getByText('Exchange Fees')).toBeInTheDocument()
    expect(screen.getByText('Market Impact')).toBeInTheDocument()
  })

  it('shows BUY and SELL side labels', () => {
    render(<TCA />)
    expect(screen.getAllByText('BUY').length).toBeGreaterThan(0)
    expect(screen.getAllByText('SELL').length).toBeGreaterThan(0)
  })
})
