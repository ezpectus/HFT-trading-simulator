import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BlackLitterman from '../components/BlackLitterman'
import { generateInitialSnapshot, MOCK_SYMBOLS } from '../utils/mockData'

const snapshot = generateInitialSnapshot()

describe('BlackLitterman', () => {
  it('renders without views matching S (K=0 branch must still supply sharpes)', () => {
    const { container } = render(
      <BlackLitterman candles={snapshot.candles} symbols={MOCK_SYMBOLS} exchange="binance" />
    )
    expect(screen.getByText(/Black-Litterman Portfolio Allocation/)).toBeInTheDocument()
    expect(screen.getAllByText(/Sharpe:/).length).toBeGreaterThan(1)
    expect(container.innerHTML).not.toContain('NaN')
  })

  it('shows guidance when insufficient symbols', () => {
    render(
      <BlackLitterman candles={snapshot.candles} symbols={['BTCUSDT']} exchange="binance" />
    )
    expect(screen.getByText(/Need at least 2 symbols/)).toBeInTheDocument()
  })
})
