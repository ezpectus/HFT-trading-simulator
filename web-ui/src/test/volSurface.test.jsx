import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import VolSurface from '../components/VolSurface'

describe('VolSurface', () => {
  it('renders IV grid with strikes and DTEs', () => {
    render(<VolSurface currentPrice={44100} />)
    expect(screen.getByText('Volatility Surface')).toBeInTheDocument()
    expect(screen.getByText('IV Grid (Strike x DTE)')).toBeInTheDocument()
    expect(screen.getAllByText('7d').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('30d').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('90d').length).toBeGreaterThanOrEqual(1)
  })

  it('shows summary stats (min, avg, max IV)', () => {
    render(<VolSurface currentPrice={44100} />)
    expect(screen.getByText('Min IV')).toBeInTheDocument()
    expect(screen.getByText('Avg IV')).toBeInTheDocument()
    expect(screen.getByText('Max IV')).toBeInTheDocument()
  })

  it('renders term structure section', () => {
    render(<VolSurface currentPrice={44100} />)
    expect(screen.getByText('Term Structure (ATM)')).toBeInTheDocument()
  })

  it('shows vol skew note', () => {
    render(<VolSurface currentPrice={44100} />)
    expect(screen.getByText(/Vol skew/)).toBeInTheDocument()
  })

  it('handles null currentPrice with fallback', () => {
    render(<VolSurface currentPrice={null} />)
    expect(screen.getByText(/ATM.*44k/)).toBeInTheDocument()
  })
})
