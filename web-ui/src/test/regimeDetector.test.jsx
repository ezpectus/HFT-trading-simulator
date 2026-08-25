import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RegimeDetector from '../components/RegimeDetector'

describe('RegimeDetector', () => {
  it('renders current regime and probabilities', () => {
    render(<RegimeDetector symbol="BTC/USDT" />)
    expect(screen.getByText('Regime Detector')).toBeInTheDocument()
    expect(screen.getByText('Current Regime')).toBeInTheDocument()
    expect(screen.getByText('Regime Probabilities')).toBeInTheDocument()
  })

  it('shows regime names with probabilities', () => {
    render(<RegimeDetector symbol="BTC/USDT" />)
    expect(screen.getByText('Trending Up')).toBeInTheDocument()
    expect(screen.getByText('High Volatility')).toBeInTheDocument()
    expect(screen.getByText('Mean Reverting')).toBeInTheDocument()
    expect(screen.getByText('Crisis')).toBeInTheDocument()
  })

  it('renders statistical indicators', () => {
    render(<RegimeDetector symbol="BTC/USDT" />)
    expect(screen.getByText('Statistical Indicators')).toBeInTheDocument()
    expect(screen.getByText('Hurst Exponent')).toBeInTheDocument()
    expect(screen.getByText('Volatility Regime')).toBeInTheDocument()
    expect(screen.getByText('Kurtosis')).toBeInTheDocument()
  })

  it('shows regime history timeline', () => {
    render(<RegimeDetector symbol="BTC/USDT" />)
    expect(screen.getByText('Recent Regime History')).toBeInTheDocument()
    expect(screen.getByText('W-1')).toBeInTheDocument()
    expect(screen.getByText('W-6')).toBeInTheDocument()
  })

  it('handles null symbol with fallback', () => {
    render(<RegimeDetector symbol={null} />)
    expect(screen.getByText('BTC/USDT')).toBeInTheDocument()
  })
})
