import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BurgersEquation from '../components/BurgersEquation'

const candles = Array.from({ length: 120 }, (_, i) => ({
  exchange: 'binance', symbol: 'BTCUSDT', timestamp: 1000 + i * 300,
  open: 100, high: 101, low: 99, close: 100 + Math.sin(i) * 2, volume: 10,
}))

const inputFor = (container, labelText) => {
  const label = [...container.querySelectorAll('label')].find(l => l.textContent.includes(labelText))
  return label.querySelector('input')
}

describe('BurgersEquation', () => {
  it('renders solution/evolution charts with finite geometry', () => {
    const { container } = render(
      <BurgersEquation candles={candles} symbol="BTCUSDT" exchange="binance" />
    )
    expect(screen.getByText(/Burgers Equation \(Shock Formation\)/)).toBeInTheDocument()
    expect(container.innerHTML).not.toContain('NaN')
  })

  // S370: advection was FTCS (unconditionally unstable) with no dt bound —
  // dt=1 at data-dependent dx blew the solution into NaN paths. Now the
  // documented Lax-Friedrichs scheme runs CFL substeps for any dt.
  it('large Δt stays stable — CFL substeps keep solution finite', () => {
    const { container } = render(
      <BurgersEquation candles={candles} symbol="BTCUSDT" exchange="binance" />
    )
    fireEvent.change(inputFor(container, 'Δt'), { target: { value: '0.5' } })
    expect(container.innerHTML).not.toContain('NaN')
    for (const el of container.querySelectorAll('path')) {
      const d = el.getAttribute('d')
      if (d != null) expect(d).not.toContain('NaN')
    }
    expect(screen.getByText(/Burgers Equation \(Shock Formation\)/)).toBeInTheDocument()
  })
})
