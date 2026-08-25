import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CancelMonitor from '../components/CancelMonitor'

describe('CancelMonitor', () => {
  it('renders cancel list with timestamps and reasons', () => {
    render(<CancelMonitor />)
    expect(screen.getByText('Cancel Monitor')).toBeInTheDocument()
    expect(screen.getByText('Price moved')).toBeInTheDocument()
    expect(screen.getByText('Timeout')).toBeInTheDocument()
    expect(screen.getByText('Circuit breaker')).toBeInTheDocument()
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
    expect(screen.getByText('Insufficient liquidity')).toBeInTheDocument()
    expect(screen.getByText('User cancelled')).toBeInTheDocument()
  })

  it('filters cancels by source', () => {
    render(<CancelMonitor />)
    fireEvent.click(screen.getByText('RISK'))
    expect(screen.getByText('Risk limit hit')).toBeInTheDocument()
    expect(screen.getByText('Circuit breaker')).toBeInTheDocument()
    expect(screen.queryByText('Price moved')).not.toBeInTheDocument()
  })

  it('shows risk cancel warning', () => {
    render(<CancelMonitor />)
    expect(screen.getByText(/risk-triggered cancels/)).toBeInTheDocument()
  })
})
