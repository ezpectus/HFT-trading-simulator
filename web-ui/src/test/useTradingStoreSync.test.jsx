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
const signals = { signals: [{ id: 's1' }], regime: 'trending' }

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
})
