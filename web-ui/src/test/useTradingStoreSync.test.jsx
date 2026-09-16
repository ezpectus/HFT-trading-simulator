import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTradingStoreSync } from '../hooks/useTradingStoreSync'
import { useTradingStore } from '../stores/useTradingStore'

const exchange = {
  candles: [{ symbol: 'BTC/USDT' }],
  prices: { sim: { 'BTC/USDT': 99 } },
  accounts: { sim: { balance: 1 } },
  arbitrage: [],
  fills: [{ id: 7 }],
  orderbooks: {},
  fundingRates: {},
  connected: true,
  latency: 12,
  submitOrder: () => {},
  closePosition: () => {},
  requestOptionsChain: () => {},
  sendSpeedChange: () => {},
  sendConfigUpdate: () => {},
  toggleReplay: () => {},
  scrubReplay: () => {},
  startTrading: () => {},
  stopTrading: () => {},
}
const signals = {
  signals: [{ id: 's1' }],
  regime: 'trending',
  portfolioResult: { weights: { BTC: 0.6 } },
  cvarResult: { cvar_95: -0.03 },
  fundingArbResult: { apr: 12 },
  authState: { tier: 'pro' },
  nextReconnectIn: 5,
  connect: () => {},
}

describe('useTradingStoreSync', () => {
  it('mirrors exchange hook data into the trading store', () => {
    renderHook(() => useTradingStoreSync(exchange, signals))
    const s = useTradingStore.getState()
    expect(s.candles).toEqual([{ symbol: 'BTC/USDT' }])
    expect(s.prices.sim['BTC/USDT']).toBe(99)
    expect(s.fills).toEqual([{ id: 7 }])
    expect(s.exchangeConnected).toBe(true)
    expect(s.exchangeLatency).toBe(12)
  })

  it('mirrors signal data', () => {
    renderHook(() => useTradingStoreSync(exchange, signals))
    const s = useTradingStore.getState()
    expect(s.signals).toEqual([{ id: 's1' }])
  })

  it('mirrors server-compute results into the store', () => {
    renderHook(() => useTradingStoreSync(exchange, signals))
    const s = useTradingStore.getState()
    expect(s.portfolioResult).toEqual({ weights: { BTC: 0.6 } })
    expect(s.cvarResult).toEqual({ cvar_95: -0.03 })
    expect(s.fundingArbResult).toEqual({ apr: 12 })
    expect(s.authState).toEqual({ tier: 'pro' })
    expect(s.signalNextReconnectIn).toBe(5)
    expect(s.signalConnect).toBe(signals.connect)
  })
})
