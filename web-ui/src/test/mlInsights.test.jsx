import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MLInsights from '../components/MLInsights'

const mockCandles = [
  { timestamp: 1, open: 100, high: 105, low: 95, close: 43250, volume: 1000 },
]

const mockSignals = {
  signals: [
    { symbol: 'BTC/USDT', direction: 'LONG', confidence: 75, strategy: 'ml_ensemble' },
    { symbol: 'ETH/USDT', direction: 'SHORT', confidence: 60, strategy: 'trend' },
    { symbol: 'SOL/USDT', direction: 'LONG', confidence: 80, strategy: 'ml_lstm' },
  ],
}

describe('MLInsights', () => {
  it('renders model cards with names and stats', () => {
    render(<MLInsights signals={mockSignals} candles={mockCandles} symbol="BTC/USDT" />)
    expect(screen.getByText('ML Insights')).toBeInTheDocument()
    expect(screen.getByText('LSTM Price Predictor')).toBeInTheDocument()
    expect(screen.getByText('Transformer Forecast')).toBeInTheDocument()
    expect(screen.getByText('RL Trading Agent')).toBeInTheDocument()
    expect(screen.getByText('AutoML Ensemble')).toBeInTheDocument()
  })

  it('shows consensus based on model predictions', () => {
    render(<MLInsights signals={mockSignals} candles={mockCandles} symbol="BTC/USDT" />)
    expect(screen.getByText(/BULLISH|BEARISH|NEUTRAL/)).toBeInTheDocument()
  })

  it('expands model details on click', () => {
    render(<MLInsights signals={mockSignals} candles={mockCandles} symbol="BTC/USDT" />)
    const detailsBtn = screen.getAllByText('▶ Details')[0]
    fireEvent.click(detailsBtn)
    expect(screen.getByText(/Features/)).toBeInTheDocument()
  })

  it('handles empty signals gracefully', () => {
    render(<MLInsights signals={null} candles={[]} symbol="BTC/USDT" />)
    expect(screen.getByText('ML Insights')).toBeInTheDocument()
    expect(screen.getByText('LSTM Price Predictor')).toBeInTheDocument()
  })

  it('shows average accuracy in summary', () => {
    render(<MLInsights signals={mockSignals} candles={mockCandles} symbol="BTC/USDT" />)
    expect(screen.getByText('Avg Acc')).toBeInTheDocument()
  })
})
