import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import FillAnalytics from '../components/FillAnalytics'

describe('FillAnalytics', () => {
  it('renders fill list with order details', () => {
    render(<FillAnalytics />)
    expect(screen.getByText('Fill Analytics')).toBeInTheDocument()
    expect(screen.getByText('Recent Fills')).toBeInTheDocument()
    expect(screen.getAllByText('BTC').length).toBeGreaterThan(0)
  })

  it('shows summary stats (fill rate, partial, avg latency, rejected)', () => {
    render(<FillAnalytics />)
    expect(screen.getByText('Fill Rate')).toBeInTheDocument()
    expect(screen.getByText('Partial')).toBeInTheDocument()
    expect(screen.getByText('Avg Latency')).toBeInTheDocument()
    expect(screen.getByText('Rejected')).toBeInTheDocument()
  })

  it('shows fill quality distribution bar', () => {
    render(<FillAnalytics />)
    expect(screen.getByText('Fill Quality')).toBeInTheDocument()
  })

  it('shows fill status badges (filled, partial, rejected)', () => {
    render(<FillAnalytics />)
    expect(screen.getAllByText('filled').length).toBeGreaterThan(0)
    expect(screen.getAllByText('partial').length).toBeGreaterThan(0)
    expect(screen.getAllByText('rejected').length).toBeGreaterThan(0)
  })

  it('shows partial fill percentages', () => {
    render(<FillAnalytics />)
    expect(screen.getAllByText(/Partial fill/).length).toBeGreaterThan(0)
  })
})
