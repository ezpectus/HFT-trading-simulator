import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePanelContext } from '../stores/usePanelContext'
import { useTradingStore } from '../stores/useTradingStore'

describe('usePanelContext', () => {
  it('exposes exchange object with the fields registry expects', () => {
    const { result } = renderHook(() => usePanelContext())
    const ex = result.current.exchange
    // These are forwarded field-by-field — a missing name silently drops
    // the data from every panel, so assert the important ones explicitly.
    for (const key of [
      'candles', 'prices', 'accounts', 'fills', 'orderbooks',
      'optionsChain', 'requestOptionsChain', 'submitOrder', 'closePosition',
      'connected', 'latency',
    ]) {
      expect(ex, `exchange.${key} missing`).toHaveProperty(key)
    }
  })

  it('flows optionsChain data from the store into ctx.exchange', () => {
    const chain = { spot: 64000, volatility: 0.5, strikes: [], expiries: [] }
    const req = () => {}
    useTradingStore.setState({ optionsChain: chain, requestOptionsChain: req })
    const { result } = renderHook(() => usePanelContext())
    expect(result.current.exchange.optionsChain).toEqual(chain)
    expect(result.current.exchange.requestOptionsChain).toBe(req)
  })

  it('exposes signals object with connection state', () => {
    const { result } = renderHook(() => usePanelContext())
    const sig = result.current.signals
    for (const key of ['signals', 'regime', 'backtestResult', 'connected', 'latency']) {
      expect(sig).toHaveProperty(key)
    }
  })
})
