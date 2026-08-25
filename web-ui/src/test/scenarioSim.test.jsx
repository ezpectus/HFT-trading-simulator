import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScenarioSim from '../components/ScenarioSim'

describe('ScenarioSim', () => {
  it('renders scenario list with names', () => {
    render(<ScenarioSim currentPrice={50000} />)
    expect(screen.getByText('Scenario Simulator')).toBeInTheDocument()
    expect(screen.getByText('Market Crash (-20%)')).toBeInTheDocument()
    expect(screen.getByText('Flash Crash (-5% / 1min)')).toBeInTheDocument()
    expect(screen.getByText('Liquidation Cascade')).toBeInTheDocument()
  })

  it('shows worst case summary with equity impact and drawdown', () => {
    render(<ScenarioSim currentPrice={50000} />)
    expect(screen.getByText('Worst Case')).toBeInTheDocument()
    expect(screen.getByText('Equity Impact')).toBeInTheDocument()
    expect(screen.getByText('Max Drawdown')).toBeInTheDocument()
    expect(screen.getByText('Recovery')).toBeInTheDocument()
  })

  it('shows fill rate bars under stress', () => {
    render(<ScenarioSim currentPrice={50000} />)
    expect(screen.getByText('Order Fill Rate Under Stress')).toBeInTheDocument()
  })

  it('shows margin call warning for worst case', () => {
    render(<ScenarioSim currentPrice={50000} />)
    expect(screen.getByText('Margin call triggered')).toBeInTheDocument()
  })

  it('handles null currentPrice with fallback', () => {
    render(<ScenarioSim currentPrice={null} />)
    expect(screen.getByText('Scenario Simulator')).toBeInTheDocument()
    expect(screen.getByText('Base: $50,000.00')).toBeInTheDocument()
  })
})
