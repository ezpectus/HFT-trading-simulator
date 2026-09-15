import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import OptionsStrategySimulator from '../components/OptionsStrategySimulator'

describe('OptionsStrategySimulator', () => {
  it('renders params, legs and P&L chart', () => {
    render(<OptionsStrategySimulator currentPrice={65000} />)
    expect(screen.getByText('Options Strategy P&L Simulator')).toBeInTheDocument()
    expect(screen.getByText('Spot Price')).toBeInTheDocument()
    expect(screen.getByText('Days to Expiry')).toBeInTheDocument()
  })

  it('emits finite SVG coordinates with normal spot', () => {
    const { container } = render(<OptionsStrategySimulator currentPrice={65000} />)
    const polyline = container.querySelector('polyline')
    expect(polyline).not.toBeNull()
    for (const pt of polyline.getAttribute('points').split(' ')) {
      const [x, y] = pt.split(',').map(Number)
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
    }
  })

  it('flat-collapses instead of NaN when spot is 0', () => {
    const { container } = render(<OptionsStrategySimulator currentPrice={0} />)
    // drive spot input to 0 explicitly (initial state falls back to 65000)
    const spotInput = screen.getByText('Spot Price').parentElement.querySelector('input')
    fireEvent.change(spotInput, { target: { value: '0' } })

    const svg = container.querySelector('svg')
    expect(svg.innerHTML).not.toContain('NaN')
    const polyline = container.querySelector('polyline')
    for (const pt of polyline.getAttribute('points').split(' ')) {
      const [x, y] = pt.split(',').map(Number)
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
    }
  })
})
