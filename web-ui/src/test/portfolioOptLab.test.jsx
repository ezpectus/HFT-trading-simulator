import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PortfolioOptLab from '../components/PortfolioOptLab'

describe('PortfolioOptLab', () => {
  it('renders the panel title', () => {
    render(<PortfolioOptLab />)
    expect(screen.getByText('Portfolio Optimization Lab')).toBeInTheDocument()
  })

  it('discloses the missing feed instead of fabricating data', () => {
    render(<PortfolioOptLab />)
    expect(screen.getByText(/No portfolio optimizer feed — this data is not produced/)).toBeInTheDocument()
  })
})
