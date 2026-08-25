import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CapacityAnalysis from '../components/CapacityAnalysis'

describe('CapacityAnalysis', () => {
  it('renders strategy capacity table', () => {
    render(<CapacityAnalysis />)
    expect(screen.getByText('Capacity Analysis')).toBeInTheDocument()
    expect(screen.getByText('Strategy Capacity')).toBeInTheDocument()
    expect(screen.getByText('TrendFollowing')).toBeInTheDocument()
    expect(screen.getByText('MeanReversion')).toBeInTheDocument()
  })

  it('shows summary stats (AUM, max cap, scalable, constrained)', () => {
    render(<CapacityAnalysis />)
    expect(screen.getByText('Total AUM')).toBeInTheDocument()
    expect(screen.getByText('Max Cap')).toBeInTheDocument()
    expect(screen.getByText('Scalable')).toBeInTheDocument()
    expect(screen.getByText('Constrained')).toBeInTheDocument()
  })

  it('shows alpha decay curve', () => {
    render(<CapacityAnalysis />)
    expect(screen.getByText('Alpha Decay Curve (StatArb)')).toBeInTheDocument()
  })

  it('shows status badges for strategies', () => {
    render(<CapacityAnalysis />)
    expect(screen.getAllByText('SCALABLE').length).toBeGreaterThan(0)
    expect(screen.getAllByText('MODERATE').length).toBeGreaterThan(0)
    expect(screen.getAllByText('CONSTRAINED').length).toBeGreaterThan(0)
  })

  it('shows constraint warning alert', () => {
    render(<CapacityAnalysis />)
    expect(screen.getByText(/at capacity/)).toBeInTheDocument()
  })
})
