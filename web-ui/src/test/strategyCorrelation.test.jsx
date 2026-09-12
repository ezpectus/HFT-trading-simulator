import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StrategyCorrelation from '../components/StrategyCorrelation'

const NOW_S = Math.floor(Date.now() / 1000)

const SIGNALS = [
  { symbol: 'BTC/USDT', direction: 'LONG', confidence: 80, strategy: 'Trend', timestamp: NOW_S - 10 },
  { symbol: 'ETH/USDT', direction: 'LONG', confidence: 75, strategy: 'Trend', timestamp: NOW_S - 10 },
  { symbol: 'BTC/USDT', direction: 'LONG', confidence: 70, strategy: 'Momentum', timestamp: NOW_S - 5 },
  { symbol: 'ETH/USDT', direction: 'SHORT', confidence: 60, strategy: 'Momentum', timestamp: NOW_S - 5 },
  { symbol: 'BTC/USDT', direction: 'SHORT', confidence: 55, strategy: 'MeanRev', timestamp: NOW_S - 1 },
]

describe('StrategyCorrelation', () => {
  it('renders agreement matrix with real strategy names', () => {
    render(<StrategyCorrelation signals={SIGNALS} />)
    expect(screen.getByText('Strategy Correlation')).toBeInTheDocument()
    expect(screen.getByText('Directional Agreement')).toBeInTheDocument()
    expect(screen.getAllByText('Tren').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Mome').length).toBeGreaterThan(0)
  })

  it('shows summary stats', () => {
    render(<StrategyCorrelation signals={SIGNALS} />)
    expect(screen.getByText('High Agree')).toBeInTheDocument()
    expect(screen.getByText('Opposing')).toBeInTheDocument()
    expect(screen.getByText('Signals')).toBeInTheDocument()
    expect(screen.getByText('Avg Conf')).toBeInTheDocument()
  })

  it('renders strategy snapshot table', () => {
    render(<StrategyCorrelation signals={SIGNALS} />)
    expect(screen.getByText(/Strategy Snapshot/)).toBeInTheDocument()
  })

  it('shows waiting state with fewer than 2 strategies', () => {
    render(<StrategyCorrelation signals={[SIGNALS[0]]} />)
    expect(screen.getByText(/Need ≥2 strategies/)).toBeInTheDocument()
  })
})
