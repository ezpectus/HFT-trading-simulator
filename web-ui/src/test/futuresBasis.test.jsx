import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import FuturesBasis from '../components/FuturesBasis'

describe('FuturesBasis', () => {
  it('renders basis table with expiries', () => {
    render(<FuturesBasis currentPrice={44100} />)
    expect(screen.getByText('Futures Basis')).toBeInTheDocument()
    expect(screen.getByText('Basis by Expiry')).toBeInTheDocument()
    expect(screen.getByText('1W')).toBeInTheDocument()
    expect(screen.getByText('1M')).toBeInTheDocument()
    expect(screen.getByText('1Y')).toBeInTheDocument()
  })

  it('shows summary stats (best APR, max basis, structure)', () => {
    render(<FuturesBasis currentPrice={44100} />)
    expect(screen.getByText('Best APR')).toBeInTheDocument()
    expect(screen.getByText('Max Basis')).toBeInTheDocument()
    expect(screen.getByText('Structure')).toBeInTheDocument()
    expect(screen.getByText('Contango')).toBeInTheDocument()
  })

  it('shows basis trend chart', () => {
    render(<FuturesBasis currentPrice={44100} />)
    expect(screen.getByText('Basis Trend (7 days)')).toBeInTheDocument()
  })

  it('shows opportunity alert', () => {
    render(<FuturesBasis currentPrice={44100} />)
    expect(screen.getByText(/Best opportunity/)).toBeInTheDocument()
  })

  it('handles null currentPrice with fallback', () => {
    render(<FuturesBasis currentPrice={null} />)
    expect(screen.getByText('Spot: $44,100')).toBeInTheDocument()
  })
})
