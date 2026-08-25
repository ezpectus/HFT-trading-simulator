import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LogDashboard from '../components/LogDashboard'

describe('LogDashboard', () => {
  it('renders log entries with timestamps', () => {
    render(<LogDashboard />)
    expect(screen.getByText('Log Dashboard')).toBeInTheDocument()
    expect(screen.getByText('12:45:32')).toBeInTheDocument()
    expect(screen.getByText('12:45:33')).toBeInTheDocument()
  })

  it('shows info/warn/error counts', () => {
    render(<LogDashboard />)
    expect(screen.getByText('Info')).toBeInTheDocument()
    expect(screen.getByText('Warnings')).toBeInTheDocument()
    expect(screen.getByText('Errors')).toBeInTheDocument()
  })

  it('filters logs by level on button click', () => {
    render(<LogDashboard />)
    const errorBtn = screen.getByText('ERROR')
    fireEvent.click(errorBtn)
    expect(screen.getByText('Order rejected: INSUFFICIENT_BALANCE')).toBeInTheDocument()
    expect(screen.queryByText('Signal generated: BTC/USDT LONG confidence=0.82')).not.toBeInTheDocument()
  })

  it('shows all logs when ALL filter selected', () => {
    render(<LogDashboard />)
    expect(screen.getByText('Signal generated: BTC/USDT LONG confidence=0.82')).toBeInTheDocument()
    expect(screen.getByText('Order rejected: INSUFFICIENT_BALANCE')).toBeInTheDocument()
  })

  it('shows source labels for log entries', () => {
    render(<LogDashboard />)
    expect(screen.getByText('SignalBot')).toBeInTheDocument()
    expect(screen.getByText('OrderManager')).toBeInTheDocument()
    expect(screen.getByText('RiskManager')).toBeInTheDocument()
  })
})
