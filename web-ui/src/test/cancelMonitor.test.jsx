import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CancelMonitor from '../components/CancelMonitor'

describe('CancelMonitor', () => {
  it('renders the panel title', () => {
    render(<CancelMonitor />)
    expect(screen.getByText('Cancel Monitor')).toBeInTheDocument()
  })

  it('discloses there is no order cancellation feed', () => {
    render(<CancelMonitor />)
    expect(screen.getByText(/No order cancellation feed — this data is not produced/)).toBeInTheDocument()
  })

  it('renders no fabricated cancel reasons', () => {
    render(<CancelMonitor />)
    expect(screen.queryByText('Price moved')).not.toBeInTheDocument()
    expect(screen.queryByText('Circuit breaker')).not.toBeInTheDocument()
  })
})
