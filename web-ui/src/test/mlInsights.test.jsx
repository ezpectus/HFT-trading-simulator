import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MLInsights from '../components/MLInsights'

const mockSignals = {
  signals: [
    { symbol: 'BTC/USDT', direction: 'LONG', confidence: 75, strategy: 'ml_ensemble', price: 44000 },
    { symbol: 'ETH/USDT', direction: 'SHORT', confidence: 60, strategy: 'trend', price: 2500 },
    { symbol: 'SOL/USDT', direction: 'LONG', confidence: 80, strategy: 'ml_lstm', price: 100 },
  ],
}

describe('MLInsights', () => {
  it('discloses missing model registry instead of fake model cards', () => {
    render(<MLInsights signals={mockSignals} symbol="BTC/USDT" />)
    expect(screen.getByText('ML Insights')).toBeInTheDocument()
    expect(screen.getByText(/No model registry feed/)).toBeInTheDocument()
    expect(screen.queryByText('LSTM Price Predictor')).not.toBeInTheDocument()
  })

  it('lists only real ML-tagged signals', () => {
    render(<MLInsights signals={mockSignals} symbol="BTC/USDT" />)
    expect(screen.getByText('BTC/USDT')).toBeInTheDocument()
    expect(screen.getByText('SOL/USDT')).toBeInTheDocument()
    // 'trend' strategy is not ML — must be filtered out
    expect(screen.queryByText('ETH/USDT')).not.toBeInTheDocument()
  })

  it('derives long/short consensus from real signals', () => {
    render(<MLInsights signals={mockSignals} symbol="BTC/USDT" />)
    expect(screen.getByText('BULLISH')).toBeInTheDocument()
  })

  it('shows empty state when no ML signals exist', () => {
    render(<MLInsights signals={{ signals: [] }} symbol="BTC/USDT" />)
    expect(screen.getByText('No ML signals')).toBeInTheDocument()
  })
})
