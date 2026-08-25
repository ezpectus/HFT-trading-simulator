import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatToolkit from '../components/StatToolkit'

const mockCandles = [
  { timestamp: 1, open: 100, high: 105, low: 95, close: 100, volume: 1000 },
  { timestamp: 2, open: 100, high: 108, low: 98, close: 105, volume: 1200 },
  { timestamp: 3, open: 105, high: 110, low: 102, close: 108, volume: 900 },
  { timestamp: 4, open: 108, high: 112, low: 104, close: 106, volume: 1100 },
  { timestamp: 5, open: 106, high: 109, low: 101, close: 103, volume: 800 },
]

describe('StatToolkit', () => {
  it('computes and displays price statistics', () => {
    render(<StatToolkit candles={mockCandles} symbol="BTC/USDT" />)
    expect(screen.getByText('Statistical Toolkit')).toBeInTheDocument()
    expect(screen.getByText('Price Statistics')).toBeInTheDocument()
    expect(screen.getByText('Mean')).toBeInTheDocument()
    expect(screen.getByText('Median')).toBeInTheDocument()
    expect(screen.getAllByText('Std Dev').length).toBeGreaterThanOrEqual(1)
  })

  it('computes return statistics', () => {
    render(<StatToolkit candles={mockCandles} symbol="BTC/USDT" />)
    expect(screen.getByText('Return Statistics')).toBeInTheDocument()
    expect(screen.getByText('Mean Return')).toBeInTheDocument()
    expect(screen.getByText('Skewness')).toBeInTheDocument()
    expect(screen.getByText('Kurtosis')).toBeInTheDocument()
  })

  it('computes risk metrics including Sharpe ratio', () => {
    render(<StatToolkit candles={mockCandles} symbol="BTC/USDT" />)
    expect(screen.getByText('Risk Metrics')).toBeInTheDocument()
    expect(screen.getByText('Sharpe Ratio')).toBeInTheDocument()
    expect(screen.getByText('Volatility (Ann.)')).toBeInTheDocument()
  })

  it('shows empty state when no candle data', () => {
    render(<StatToolkit candles={[]} symbol="BTC/USDT" />)
    expect(screen.getByText('No data')).toBeInTheDocument()
  })

  it('handles null candles gracefully', () => {
    render(<StatToolkit candles={null} symbol="BTC/USDT" />)
    expect(screen.getByText('No data')).toBeInTheDocument()
  })
})
