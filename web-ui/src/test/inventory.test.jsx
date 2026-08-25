import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Inventory from '../components/Inventory'

describe('Inventory', () => {
  it('renders inventory with position count', () => {
    render(<Inventory />)
    expect(screen.getByText('Inventory Manager')).toBeInTheDocument()
    expect(screen.getByText('8 positions')).toBeInTheDocument()
  })

  it('shows total PnL and exposure stats', () => {
    render(<Inventory />)
    expect(screen.getByText('Total PnL')).toBeInTheDocument()
    expect(screen.getByText('Gross Exp')).toBeInTheDocument()
    expect(screen.getByText('Net Exp')).toBeInTheDocument()
    expect(screen.getByText('Win/Loss')).toBeInTheDocument()
  })

  it('renders long/short exposure bar', () => {
    render(<Inventory />)
    expect(screen.getByText(/Long \(/)).toBeInTheDocument()
    expect(screen.getByText(/Short \(/)).toBeInTheDocument()
  })

  it('shows position list with symbols', () => {
    render(<Inventory />)
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('ETH')).toBeInTheDocument()
    expect(screen.getByText('SOL')).toBeInTheDocument()
    expect(screen.getByText('MATIC')).toBeInTheDocument()
  })

  it('shows concentration warning', () => {
    render(<Inventory />)
    expect(screen.getByText(/High concentration/)).toBeInTheDocument()
  })
})
