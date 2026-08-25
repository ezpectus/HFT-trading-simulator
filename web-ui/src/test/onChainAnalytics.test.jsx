import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import OnChainAnalytics from '../components/OnChainAnalytics'

describe('OnChainAnalytics', () => {
  it('renders on-chain metrics and whale activity', () => {
    render(<OnChainAnalytics symbol="BTC/USDT" />)
    expect(screen.getByText('On-Chain Analytics')).toBeInTheDocument()
    expect(screen.getByText('Key Metrics')).toBeInTheDocument()
    expect(screen.getByText('Whale Activity')).toBeInTheDocument()
  })

  it('shows net exchange flow with direction', () => {
    render(<OnChainAnalytics symbol="BTC/USDT" />)
    expect(screen.getByText('Net Exchange Flow')).toBeInTheDocument()
    expect(screen.getByText(/bullish signal|bearish signal/)).toBeInTheDocument()
  })

  it('renders key metrics with values and changes', () => {
    render(<OnChainAnalytics symbol="BTC/USDT" />)
    expect(screen.getByText('Active Addresses')).toBeInTheDocument()
    expect(screen.getByText('Hash Rate')).toBeInTheDocument()
    expect(screen.getByText('MVRV Ratio')).toBeInTheDocument()
    expect(screen.getByText('NVT Ratio')).toBeInTheDocument()
  })

  it('shows whale addresses with accumulation/distribution labels', () => {
    render(<OnChainAnalytics symbol="BTC/USDT" />)
    expect(screen.getAllByText('ACC').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('DIST').length).toBeGreaterThanOrEqual(1)
  })

  it('handles null symbol with fallback', () => {
    render(<OnChainAnalytics symbol={null} />)
    expect(screen.getByText('BTC')).toBeInTheDocument()
  })
})
