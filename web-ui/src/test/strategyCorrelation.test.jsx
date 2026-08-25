import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StrategyCorrelation from '../components/StrategyCorrelation'

describe('StrategyCorrelation', () => {
  it('renders correlation matrix with strategy names', () => {
    render(<StrategyCorrelation />)
    expect(screen.getByText('Strategy Correlation')).toBeInTheDocument()
    expect(screen.getByText('Correlation Matrix')).toBeInTheDocument()
  })

  it('shows summary stats (high corr, diversifying, avg return, avg sharpe)', () => {
    render(<StrategyCorrelation />)
    expect(screen.getByText('High Corr')).toBeInTheDocument()
    expect(screen.getByText('Diversifying')).toBeInTheDocument()
    expect(screen.getByText('Avg Return')).toBeInTheDocument()
    expect(screen.getByText('Avg Sharpe')).toBeInTheDocument()
  })

  it('renders strategy performance table', () => {
    render(<StrategyCorrelation />)
    expect(screen.getByText('Strategy Performance')).toBeInTheDocument()
    expect(screen.getByText('Trend')).toBeInTheDocument()
    expect(screen.getByText('MeanRev')).toBeInTheDocument()
    expect(screen.getByText('StatArb')).toBeInTheDocument()
  })

  it('shows returns and max drawdown values', () => {
    render(<StrategyCorrelation />)
    expect(screen.getByText('+12.5%')).toBeInTheDocument()
    expect(screen.getByText('-8.2%')).toBeInTheDocument()
  })
})
