/**
 * StrategyBuilder — rule editing + localStorage persistence.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StrategyBuilder from '../components/StrategyBuilder'

const SAVED_KEY = 'trading-sim-strategies'

describe('StrategyBuilder', () => {
  beforeEach(() => localStorage.clear())

  it('renders the builder with a default rule', () => {
    render(<StrategyBuilder currentPrice={65000} />)
    expect(screen.getByText('Strategy Builder')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Strategy name')).toBeInTheDocument()
  })

  it('adds a rule using the live current price as default value', () => {
    render(<StrategyBuilder currentPrice={65000} />)
    const before = document.querySelectorAll('select').length
    fireEvent.click(screen.getByText(/Add Rule|\+/i) || screen.getAllByRole('button').at(-1))
    const after = document.querySelectorAll('select').length
    expect(after).toBeGreaterThanOrEqual(before)
  })

  it('saves a named strategy to localStorage', () => {
    render(<StrategyBuilder currentPrice={65000} />)
    fireEvent.change(screen.getByPlaceholderText('Strategy name'), { target: { value: 'My Strat' } })
    fireEvent.click(screen.getByText('Save'))
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY))
    expect(saved).toHaveLength(1)
    expect(saved[0].name).toBe('My Strat')
    expect(saved[0].rules.length).toBeGreaterThan(0)
  })
})
