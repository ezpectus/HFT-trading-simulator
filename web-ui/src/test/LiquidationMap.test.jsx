import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LiquidationMap from '../components/LiquidationMap'

const candles = Array.from({ length: 50 }, (_, i) => ({
  exchange: 'binance', symbol: 'BTCUSDT', timestamp: 1000 + i * 300,
  open: 100, high: 101, low: 99, close: 100 + Math.sin(i) * 2, volume: 10,
}))

describe('LiquidationMap', () => {
  it('renders leverage bars with finite geometry (magnitude reaches bars)', () => {
    const { container } = render(
      <LiquidationMap candles={candles} accounts={{}} symbol="BTCUSDT" exchange="binance" />
    )
    expect(screen.getByText('Liquidation Map')).toBeInTheDocument()
    const rects = container.querySelectorAll('rect')
    expect(rects.length).toBeGreaterThan(0)
    for (const r of rects) {
      const h = parseFloat(r.getAttribute('height'))
      const y = parseFloat(r.getAttribute('y'))
      expect(Number.isFinite(h)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
    }
    expect(container.innerHTML).not.toContain('NaN')
  })

  it('renders long and short side bars', () => {
    const { container } = render(
      <LiquidationMap candles={candles} accounts={{}} symbol="BTCUSDT" exchange="binance" />
    )
    expect(container.textContent).toContain('2x')
    expect(container.textContent).toContain('100x')
  })

  it('shows empty state when insufficient candles', () => {
    render(
      <LiquidationMap candles={candles.slice(0, 5)} accounts={{}} symbol="BTCUSDT" exchange="binance" />
    )
    expect(screen.getByText('Not enough data')).toBeInTheDocument()
  })
})
