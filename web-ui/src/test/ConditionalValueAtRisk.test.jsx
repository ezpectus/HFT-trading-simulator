import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConditionalValueAtRisk from '../components/ConditionalValueAtRisk'

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


describe('ConditionalValueAtRisk backend CVaR', () => {
  const props = {
    candles: ['BTC/USDT', 'ETH/USDT'].flatMap((s, i) => mkCandles('binance', s, i)),
    symbols: ['BTC/USDT', 'ETH/USDT'], exchange: 'binance',
    sendSignalMessage: vi.fn(() => true),
    cvarResult: null, signalsConnected: true,
  }

  it('sends cvar_analysis with equal-weight returns', () => {
    const send = vi.fn(() => true)
    render(<ConditionalValueAtRisk {...props} sendSignalMessage={send} />)
    fireEvent.click(screen.getByText('Backend CVaR (ai-signal-bot)'))
    const msg = send.mock.calls[0][0]
    expect(msg.type).toBe('cvar_analysis')
    expect(msg.method).toBe('historical')
    expect(msg.confidence).toBe(0.95)
    expect(msg.returns.length).toBeGreaterThan(50)
  })

  it('renders backend cvar with tail + scenarios', () => {
    const backend = {
      type: 'cvar_result', var: -0.02, cvar: -0.03, confidence_level: 0.95,
      method: 'historical', n_observations: 99,
      tail: { skewness: -0.1, kurtosis: 1.2, tail_index: 3, max_drawdown: -0.1 },
      scenarios: { crisis_2008: { cvar: -0.06, var: -0.04, shock_multiplier: 2 } },
    }
    const { rerender } = render(<ConditionalValueAtRisk {...props} />)
    fireEvent.click(screen.getByText('Backend CVaR (ai-signal-bot)'))
    rerender(<ConditionalValueAtRisk {...props} cvarResult={backend} />)
    expect(screen.getByText(/Backend result/)).toBeInTheDocument()
    expect(screen.getByText(/CVaR -3\.000%/)).toBeInTheDocument()
    expect(screen.getByText(/crisis_2008/)).toBeInTheDocument()
  })
})

