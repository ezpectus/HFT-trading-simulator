import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import OptionsStrategies from '../components/OptionsStrategies'

const setStrategy = (value) => {
  const select = screen.getByText('Strategy').parentElement.querySelector('select')
  fireEvent.change(select, { target: { value } })
}

// BS legs via the shared erf approximation: C(100)=4.61, P(100)=3.37 (S=100,T=0.25,σ=0.2,r=0.05)
describe('OptionsStrategies', () => {
  it('renders the default straddle (was: TDZ ReferenceError on render)', () => {
    render(<OptionsStrategies />)
    expect(screen.getByText('Options Strategies')).toBeInTheDocument()
    expect(screen.getByText('Max Profit')).toBeInTheDocument()
    // Long straddle: unlimited profit, loss = premium paid (call+put ≈ 7.99)
    expect(screen.getByText('∞')).toBeInTheDocument()
    expect(screen.getByText('$-7.99')).toBeInTheDocument()
    // Break-evens at K ± premium
    expect(screen.getByText('$92.01')).toBeInTheDocument()
    expect(screen.getByText('$107.99')).toBeInTheDocument()
  })

  it('strangle no longer crashes (TDZ shadow fixed)', () => {
    render(<OptionsStrategies />)
    setStrategy('strangle')
    expect(screen.getByText('Max Loss')).toBeInTheDocument()
    expect(screen.getByText('Break-even Points')).toBeInTheDocument()
  })

  it('iron condor shows a positive max profit (credit), not a negative one', () => {
    render(<OptionsStrategies />)
    setStrategy('iron_condor')
    // Net credit = short legs − long legs ≈ +2.27 (was −2.27 before the sign fix)
    expect(screen.getByText('$2.27')).toBeInTheDocument()
    expect(screen.getByText('$-2.73')).toBeInTheDocument() // width 5 − credit 2.27
  })

  it('iron condor break-evens sit on the short strikes (95/105), not the wings', () => {
    render(<OptionsStrategies />)
    setStrategy('iron_condor')
    // 95 − 2.27 = 92.73 and 105 + 2.27 = 107.27 (was 92.27/107.73 using long strikes)
    expect(screen.getByText('$92.73')).toBeInTheDocument()
    expect(screen.getByText('$107.27')).toBeInTheDocument()
  })
})
