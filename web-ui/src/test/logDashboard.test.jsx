import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LogDashboard from '../components/LogDashboard'

describe('LogDashboard', () => {
  it('renders the panel title', () => {
    render(<LogDashboard />)
    expect(screen.getByText('Log Dashboard')).toBeInTheDocument()
  })

  it('discloses there is no log stream feed', () => {
    render(<LogDashboard />)
    expect(screen.getByText(/No log stream feed — this data is not produced/)).toBeInTheDocument()
    expect(screen.getByText(/no log stream is published over WebSocket/)).toBeInTheDocument()
  })

  it('renders no fabricated log entries', () => {
    render(<LogDashboard />)
    expect(screen.queryByText(/Signal generated:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Order rejected:/)).not.toBeInTheDocument()
  })
})
