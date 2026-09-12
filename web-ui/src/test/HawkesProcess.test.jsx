import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import HawkesProcess from '../components/HawkesProcess'

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


describe('HawkesProcess backend fit', () => {
  const props = {
    candles: mkCandles('binance', 'BTC/USDT', 0, 150, true),
    symbol: 'BTC/USDT', exchange: 'binance',
    sendSignalMessage: vi.fn(() => true),
    hawkesResult: null, signalsConnected: true,
  }

  it('sends hawkes_fit with extracted event indices', () => {
    const send = vi.fn(() => true)
    render(<HawkesProcess {...props} sendSignalMessage={send} />)
    fireEvent.click(screen.getByText('Backend MLE fit'))
    expect(send).toHaveBeenCalledTimes(1)
    const msg = send.mock.calls[0][0]
    expect(msg.type).toBe('hawkes_fit')
    expect(Array.isArray(msg.events)).toBe(true)
    expect(msg.events.length).toBeGreaterThan(4)
  })

  it('renders backend fit result', () => {
    const backend = {
      type: 'hawkes_result',
      params: { mu: 0.2, alpha: 0.4, beta: 1.0, branching_ratio: 0.4, log_lik: -30 },
      n_events: 20, intensity_path: [],
    }
    const { rerender } = render(<HawkesProcess {...props} />)
    fireEvent.click(screen.getByText('Backend MLE fit'))
    rerender(<HawkesProcess {...props} hawkesResult={backend} />)
    expect(screen.getByText(/ai-signal-bot fit/)).toBeInTheDocument()
    expect(screen.getByText(/n=0.4/)).toBeInTheDocument()
  })
})

