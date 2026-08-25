import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CostBasis from '../components/CostBasis'

describe('CostBasis', () => {
  it('renders positions with symbols and quantities', () => {
    render(<CostBasis />)
    expect(screen.getByText('Cost Basis Tracker')).toBeInTheDocument()
    expect(screen.getByText('Positions')).toBeInTheDocument()
    expect(screen.getAllByText('BTC').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ETH').length).toBeGreaterThan(0)
  })

  it('shows summary stats (unrealized, realized, total PnL, ROI)', () => {
    render(<CostBasis />)
    expect(screen.getByText('Unrealized')).toBeInTheDocument()
    expect(screen.getByText('Realized')).toBeInTheDocument()
    expect(screen.getByText('Total PnL')).toBeInTheDocument()
    expect(screen.getByText('ROI')).toBeInTheDocument()
  })

  it('renders lot details for positions', () => {
    render(<CostBasis />)
    expect(screen.getAllByText(/@/).length).toBeGreaterThan(0)
  })

  it('shows portfolio summary with cost basis and market value', () => {
    render(<CostBasis />)
    expect(screen.getByText('Portfolio Summary')).toBeInTheDocument()
    expect(screen.getByText('Total Cost Basis:')).toBeInTheDocument()
    expect(screen.getByText('Market Value:')).toBeInTheDocument()
  })

  it('shows profitable and loss position counts', () => {
    render(<CostBasis />)
    expect(screen.getByText(/profitable/)).toBeInTheDocument()
    expect(screen.getByText(/at loss/)).toBeInTheDocument()
  })
})
