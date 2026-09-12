import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import EmpiricalDynamicModeling from '../components/EmpiricalDynamicModeling'

const candles = (sym, n = 200) =>
  Array.from({ length: n }, (_, i) => ({
    exchange: 'sim', symbol: sym, timestamp: i * 300,
    open: 100 + Math.sin(i / 10), high: 101 + Math.sin(i / 10),
    low: 99 + Math.sin(i / 10), close: 100 + Math.sin(i / 10), volume: 10,
  }))

describe('EmpiricalDynamicModeling', () => {
  it('shows empty state without enough candles', () => {
    render(<EmpiricalDynamicModeling candles={[]} symbol="BTC/USDT"
      exchange="sim" symbols={['BTC/USDT', 'ETH/USDT']} />)
    expect(document.body.textContent.length).toBeGreaterThan(0)
  })

  it('renders EDM output for sufficient data', () => {
    const { container } = render(
      <EmpiricalDynamicModeling candles={candles('BTC/USDT')}
        symbol="BTC/USDT" exchange="sim" symbols={['BTC/USDT', 'ETH/USDT']} />)
    expect(container.innerHTML).toMatch(/EDM|Embedding|Simplex|CCM|Convergent/i)
  })
})
