import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import GeneticViewer from '../components/GeneticViewer'

describe('GeneticViewer', () => {
  it('renders the panel title', () => {
    render(<GeneticViewer />)
    expect(screen.getByText('Genetic Algorithm Viewer')).toBeInTheDocument()
  })

  it('discloses there is no genetic run feed (backend module removed)', () => {
    render(<GeneticViewer />)
    expect(screen.getByText(/No genetic run feed — this data is not produced/)).toBeInTheDocument()
  })

  it('renders no fabricated individuals or operators', () => {
    render(<GeneticViewer />)
    expect(screen.queryByText('RSI+EMA+VOL')).not.toBeInTheDocument()
    expect(screen.queryByText('Crossover')).not.toBeInTheDocument()
  })
})
