import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PositionSizeOptimizer from '../components/PositionSizeOptimizer'

const mkCandles = (exchange, symbol, seed = 0, n = 150, volatile = false) =>
  Array.from({ length: n }, (_, i) => ({
    exchange, symbol, timestamp: 1704067200 + i * 300,
    open: 100 + i * 0.05 + seed,
    high: 101 + i * 0.05 + seed,
    low: 99 + i * 0.05 + seed,
    // volatile series → enough |ret|>0.003 events for the Hawkes event extractor
    close: volatile ? 100 + seed + (i % 7 === 0 ? 1.5 : 0) + i * 0.05 : 100 + i * 0.05 + seed,
    volume: 100,
  }))


describe('PositionSizeOptimizer backend sizing', () => {
  const props = {
    candles: mkCandles('binance', 'BTC/USDT'),
    accounts: { binance: { balance: 10000, equity: 10000 } },
    currentPrice: 149.9, symbol: 'BTC/USDT', exchange: 'binance',
    sendSignalMessage: vi.fn(() => true),
    positionSizeResult: null, signalsConnected: true,
  }

  it('sends position_size with volatility sizing inputs', () => {
    const send = vi.fn(() => true)
    render(<PositionSizeOptimizer {...props} sendSignalMessage={send} />)
    fireEvent.click(screen.getByText('Backend sizing (volatility method)'))
    const msg = send.mock.calls[0][0]
    expect(msg.type).toBe('position_size')
    expect(msg.direction).toBe('LONG')
    expect(msg.price).toBe(149.9)
    expect(msg.account_value).toBe(10000)
    expect(msg.method).toBe('volatility')
    expect(msg.volatility).toBeGreaterThan(0)
  })

  it('renders backend size', () => {
    const backend = {
      type: 'position_size_result', position_size: 0.25,
      position_value: 37475, risk_amount: 100, leverage: 1, method: 'volatility',
    }
    const { rerender } = render(<PositionSizeOptimizer {...props} />)
    fireEvent.click(screen.getByText('Backend sizing (volatility method)'))
    rerender(<PositionSizeOptimizer {...props} positionSizeResult={backend} />)
    expect(screen.getByText(/size 0\.2500/)).toBeInTheDocument()
  })
})

