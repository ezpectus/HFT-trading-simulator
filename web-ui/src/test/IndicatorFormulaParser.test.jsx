import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import IndicatorFormulaParser from '../components/IndicatorFormulaParser'

const CANDLES = Array.from({ length: 60 }, (_, i) => ({
  exchange: 'binance', symbol: 'BTC/USDT', timestamp: 1000 + i,
  open: 100, high: 102, low: 98, close: 100 + i * 0.5, volume: 10,
}))

describe('IndicatorFormulaParser', () => {
  it('evaluates the default formula and shows the result grid', () => {
    render(<IndicatorFormulaParser candles={CANDLES} symbol="BTC/USDT" exchange="binance" />)
    expect(screen.getByText('Custom Indicator Formula')).toBeInTheDocument()
    expect(screen.getByText('Current')).toBeInTheDocument()
    expect(screen.getByText('Change')).toBeInTheDocument()
  })

  it('surfaces parse errors in the error box (regression)', () => {
    render(<IndicatorFormulaParser candles={CANDLES} symbol="BTC/USDT" exchange="binance" />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'FOO(' } })
    expect(screen.getByText(/token|Unexpected|Unknown|Invalid|token/i)).toBeInTheDocument()
  })

  it('all-NaN result shows "No valid values" instead of crashing (regression)', () => {
    render(<IndicatorFormulaParser candles={CANDLES} symbol="BTC/USDT" exchange="binance" />)
    // 0/0 → NaN series → validValues empty → error path; previously this
    // rendered the result grid with undefined fields → TypeError
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'closes * 0 / 0' } })
    expect(screen.getByText('No valid values')).toBeInTheDocument()
    expect(screen.queryByText('Current')).toBeNull()
  })

  it('clicking an example updates the formula', () => {
    render(<IndicatorFormulaParser candles={CANDLES} symbol="BTC/USDT" exchange="binance" />)
    fireEvent.click(screen.getByText('RSI(closes, 14) - 50'))
    expect(screen.getByRole('textbox')).toHaveValue('RSI(closes, 14) - 50')
  })
})
