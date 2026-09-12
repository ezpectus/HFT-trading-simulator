import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import OptionsPricing from '../components/OptionsPricing'

const setParam = (label, value) => {
  const input = screen.getByText(label).parentElement.querySelector('input')
  fireEvent.change(input, { target: { value: String(value) } })
}

// Verified against the same BS formulas evaluated with this erf implementation
// (Abramowitz–Stegun) — call=4.61, put=3.37, per-day theta -0.0287/-0.0152.
describe('OptionsPricing', () => {
  it('computes a real Black-Scholes call (was: crash on Math.erf)', () => {
    render(<OptionsPricing />)
    expect(screen.getByText('$4.61')).toBeInTheDocument()
    // Greeks are finite — pdf was NaN under the old Math.pi typo
    expect(screen.getByText('0.0393')).toBeInTheDocument() // gamma
    expect(screen.getByText('0.5695')).toBeInTheDocument() // delta
  })

  it('shows theta per day, matching the OptionsSimulator convention (÷365)', () => {
    render(<OptionsPricing />)
    // Annual call theta ≈ −10.475 → per-day ≈ −0.0287 (not −10.4750)
    expect(screen.getByText('Theta (per day)')).toBeInTheDocument()
    expect(screen.getByText('-0.0287')).toBeInTheDocument()
  })

  it('computes the put side with per-day theta too', () => {
    render(<OptionsPricing />)
    const select = screen.getByText('Option Type').parentElement.querySelector('select')
    fireEvent.change(select, { target: { value: 'put' } })
    expect(screen.getByText('$3.37')).toBeInTheDocument()
    expect(screen.getByText('-0.0152')).toBeInTheDocument()
  })

  it('updates the price when the strike input changes', () => {
    render(<OptionsPricing />)
    setParam('Strike Price (K)', 110)
    // S=100, K=110, T=0.25 call ≈ 1.19
    expect(screen.getByText('$1.19')).toBeInTheDocument()
  })
})
