import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import GeneticViewer from '../components/GeneticViewer'

describe('GeneticViewer', () => {
  it('renders fitness evolution and top individuals', () => {
    render(<GeneticViewer />)
    expect(screen.getByText('Genetic Algorithm Viewer')).toBeInTheDocument()
    expect(screen.getByText('Fitness Evolution')).toBeInTheDocument()
    expect(screen.getByText(/Top Individuals/)).toBeInTheDocument()
  })

  it('shows summary stats (best, avg, diversity, improvement)', () => {
    render(<GeneticViewer />)
    expect(screen.getByText('Best Fitness')).toBeInTheDocument()
    expect(screen.getByText('Avg Fitness')).toBeInTheDocument()
    expect(screen.getByText('Diversity')).toBeInTheDocument()
    expect(screen.getByText('Improvement')).toBeInTheDocument()
  })

  it('renders top individuals with genome and metrics', () => {
    render(<GeneticViewer />)
    expect(screen.getByText('RSI+EMA+VOL')).toBeInTheDocument()
    expect(screen.getByText('MACD+ATR+OBV')).toBeInTheDocument()
  })

  it('shows operator distribution', () => {
    render(<GeneticViewer />)
    expect(screen.getByText('Operator Distribution')).toBeInTheDocument()
    expect(screen.getByText('Crossover')).toBeInTheDocument()
    expect(screen.getByText('Mutation')).toBeInTheDocument()
  })

  it('shows low diversity warning', () => {
    render(<GeneticViewer />)
    expect(screen.getByText(/Low diversity/)).toBeInTheDocument()
  })
})
