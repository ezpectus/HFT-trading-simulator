import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CapacityAnalysis from '../components/CapacityAnalysis'

describe('CapacityAnalysis', () => {
  it('renders the panel title', () => {
    render(<CapacityAnalysis />)
    expect(screen.getByText('Capacity Analysis')).toBeInTheDocument()
  })

  it('discloses there is no strategy capacity feed', () => {
    render(<CapacityAnalysis />)
    expect(screen.getByText(/No strategy capacity feed — this data is not produced/)).toBeInTheDocument()
  })

  it('renders no fabricated strategy rows or badges', () => {
    render(<CapacityAnalysis />)
    expect(screen.queryByText('TrendFollowing')).not.toBeInTheDocument()
    expect(screen.queryByText('SCALABLE')).not.toBeInTheDocument()
  })
})
