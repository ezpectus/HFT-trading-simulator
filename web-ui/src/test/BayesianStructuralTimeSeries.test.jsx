import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BayesianStructuralTimeSeries from '../components/BayesianStructuralTimeSeries'

const CANDLES = Array.from({ length: 120 }, (_, i) => ({
  exchange: 'binance', symbol: 'BTC/USDT', timestamp: 1000 + i * 300,
  open: 100 + Math.sin(i / 7) * 5, high: 102 + Math.sin(i / 7) * 5,
  low: 98 + Math.sin(i / 7) * 5, close: 100 + Math.sin(i / 7) * 5, volume: 10,
}))

describe('BayesianStructuralTimeSeries', () => {
  it('shows the insufficient-data gate below the lookback floor', () => {
    render(<BayesianStructuralTimeSeries candles={CANDLES.slice(0, 50)} symbol="BTC/USDT" exchange="binance" />)
    expect(screen.getByText(/Need at least/)).toBeInTheDocument()
  })

  it('renders decomposition, params and signal with enough candles', () => {
    const { container } = render(
      <BayesianStructuralTimeSeries candles={CANDLES} symbol="BTC/USDT" exchange="binance" />
    )
    expect(screen.getByText(/Bayesian Structural Time Series/)).toBeInTheDocument()
    expect(screen.getByText('σ_level')).toBeInTheDocument()
    expect(screen.getByText('σ_irregular')).toBeInTheDocument()
    expect(screen.getByText('Log-likelihood')).toBeInTheDocument()
    // no NaN in any SVG geometry
    for (const el of container.querySelectorAll('path, line, circle')) {
      for (const attr of ['d', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy']) {
        const v = el.getAttribute(attr)
        if (v != null) expect(v).not.toContain('NaN')
      }
    }
  })

  it('auto-optimize writes params via effect — render stays pure (regression)', () => {
    render(<BayesianStructuralTimeSeries candles={CANDLES} symbol="BTC/USDT" exchange="binance" />)
    // after the effect ran, σ cells hold finite numbers, not NaN/undefined
    expect(screen.getByText('σ_level').nextElementSibling.textContent).toMatch(/^\d+\.\d{3}$/)
    expect(screen.getByText('σ_irregular').nextElementSibling.textContent).toMatch(/^\d+\.\d{3}$/)
  })
})
