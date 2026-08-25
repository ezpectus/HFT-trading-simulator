import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PortfolioOptLab from '../components/PortfolioOptLab'

describe('PortfolioOptLab', () => {
  it('renders efficient frontier and weights table', () => {
    render(<PortfolioOptLab />)
    expect(screen.getByText('Portfolio Optimization Lab')).toBeInTheDocument()
    expect(screen.getByText('Efficient Frontier')).toBeInTheDocument()
    expect(screen.getByText('Current vs Optimal Weights')).toBeInTheDocument()
  })

  it('shows method selector with all methods', () => {
    render(<PortfolioOptLab />)
    expect(screen.getByText('Markowitz')).toBeInTheDocument()
    expect(screen.getByText('Risk Parity')).toBeInTheDocument()
    expect(screen.getByText('Black-Litterman')).toBeInTheDocument()
    expect(screen.getByText('Kelly')).toBeInTheDocument()
  })

  it('shows selected method stats (sharpe, return, vol, max DD)', () => {
    render(<PortfolioOptLab />)
    expect(screen.getByText('Sharpe')).toBeInTheDocument()
    expect(screen.getByText('Return')).toBeInTheDocument()
    expect(screen.getByText('Volatility')).toBeInTheDocument()
    expect(screen.getByText('Max DD')).toBeInTheDocument()
  })

  it('switches method on click', () => {
    render(<PortfolioOptLab />)
    fireEvent.click(screen.getByText('Kelly'))
    expect(screen.getByText('Kelly')).toBeInTheDocument()
  })

  it('renders asset weights with current and optimal values', () => {
    render(<PortfolioOptLab />)
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('ETH')).toBeInTheDocument()
    expect(screen.getByText('SOL')).toBeInTheDocument()
  })
})
