import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BlackSwanTester from '../components/BlackSwanTester'

describe('BlackSwanTester', () => {
  it('renders stress test scenarios', () => {
    render(<BlackSwanTester />)
    expect(screen.getByText('Black Swan Tester')).toBeInTheDocument()
    expect(screen.getByText('Stress Test Scenarios')).toBeInTheDocument()
    expect(screen.getByText('2008 Financial Crisis')).toBeInTheDocument()
    expect(screen.getByText('COVID Crash (Mar 2020)')).toBeInTheDocument()
  })

  it('shows summary stats (worst impact, avg impact, max VaR, survival)', () => {
    render(<BlackSwanTester />)
    expect(screen.getByText('Worst Impact')).toBeInTheDocument()
    expect(screen.getByText('Avg Impact')).toBeInTheDocument()
    expect(screen.getByText('Max VaR95')).toBeInTheDocument()
    expect(screen.getByText('Survival')).toBeInTheDocument()
  })

  it('renders hedge analysis with costs and protection', () => {
    render(<BlackSwanTester />)
    expect(screen.getByText('Hedge Analysis')).toBeInTheDocument()
    expect(screen.getByText('BTC Put Options (20% OTM)')).toBeInTheDocument()
    expect(screen.getByText('USDC Allocation (20%)')).toBeInTheDocument()
  })

  it('shows worst case alert', () => {
    render(<BlackSwanTester />)
    expect(screen.getByText(/Worst case/)).toBeInTheDocument()
  })

  it('shows tested and custom status badges', () => {
    render(<BlackSwanTester />)
    expect(screen.getAllByText('TESTED').length).toBeGreaterThan(0)
    expect(screen.getAllByText('CUSTOM').length).toBeGreaterThan(0)
  })
})
