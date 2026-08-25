import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CancelMonitor from '../components/CancelMonitor'

describe('CancelMonitor', () => {
  it('renders cancel list with timestamps and reasons', () => {
    render(<CancelMonitor />)
    expect(screen.getByText('Cancel Monitor')).toBeInTheDocument()
    expect(screen.getAllByText('Price moved').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Timeout').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Circuit breaker').length).toBeGreaterThanOrEqual(1)
  })

  it('shows summary stats (total, user, system, risk)', () => {
    render(<CancelMonitor />)
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('User')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.getByText('Risk')).toBeInTheDocument()
  })

  it('renders cancel reasons breakdown', () => {
    render(<CancelMonitor />)
    expect(screen.getByText('Cancel Reasons')).toBeInTheDocument()
    expect(screen.getAllByText('Insufficient liquidity').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('User cancelled').length).toBeGreaterThanOrEqual(1)
  })

  it('filters cancels by source', () => {
    render(<CancelMonitor />)
    const riskBtns = screen.getAllByText(/risk/i)
    const riskBtn = riskBtns.find(el => el.tagName === 'BUTTON')
    fireEvent.click(riskBtn)
    expect(screen.getAllByText('Risk limit hit').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Circuit breaker').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryAllByText('Price moved').length).toBeLessThanOrEqual(1)
  })

  it('shows risk cancel warning', () => {
    render(<CancelMonitor />)
    expect(screen.getByText(/risk-triggered cancels/)).toBeInTheDocument()
  })
})
