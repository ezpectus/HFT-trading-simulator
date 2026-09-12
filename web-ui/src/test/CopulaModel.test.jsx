import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CopulaModel from '../components/CopulaModel'

const candles = (sym, n = 60) =>
  Array.from({ length: n }, (_, i) => ({
    exchange: 'sim', symbol: sym, timestamp: i * 300,
    open: 100 + i * 0.1, high: 101 + i * 0.1,
    low: 99 + i * 0.1, close: 100 + i * 0.1, volume: 10,
  }))

describe('CopulaModel', () => {
  it('shows empty state without candles', () => {
    render(<CopulaModel candles={[]} symbols={['BTC/USDT', 'ETH/USDT']} exchange="sim" />)
    expect(document.body.textContent).toMatch(/Need at least 2 symbols/i)
  })

  it('shows empty state with <2 symbols', () => {
    render(<CopulaModel candles={candles('BTC/USDT')} symbols={['BTC/USDT']} exchange="sim" />)
    expect(document.body.textContent).toMatch(/Need at least 2 symbols/i)
  })

  it('renders model output for a valid pair', () => {
    render(<CopulaModel
      candles={[...candles('BTC/USDT'), ...candles('ETH/USDT')]}
      symbols={['BTC/USDT', 'ETH/USDT']} exchange="sim" />)
    expect(screen.getByText('Copula Dependency Model')).toBeInTheDocument()
    expect(screen.getByText('Asset A:')).toBeInTheDocument()
  })
})
