import { describe, it, expect, beforeEach } from 'vitest'
import { useTradingStore } from '../stores/useTradingStore'

describe('useTradingStore', () => {
  beforeEach(() => {
    useTradingStore.setState({
      candles: [], prices: {}, optionsChain: null, signals: [],
    })
  })

  it('has expected defaults', () => {
    const s = useTradingStore.getState()
    expect(s.candles).toEqual([])
    expect(s.tradingActive).toBe(true)
    expect(s.optionsChain).toBeNull()
    expect(s.requestOptionsChain).toBeNull()
  })

  it('setExchangeData populates exchange fields', () => {
    const chain = { spot: 65000, volatility: 0.8, strikes: [60000], expiries: [1] }
    useTradingStore.getState().setExchangeData({
      optionsChain: chain,
      prices: { binance: { 'BTC/USDT': 65000 } },
    })
    const s = useTradingStore.getState()
    expect(s.optionsChain).toEqual(chain)
    expect(s.prices.binance['BTC/USDT']).toBe(65000)
  })

  it('setSignalData populates signal fields', () => {
    useTradingStore.getState().setSignalData({ regime: { trend: 'up' } })
    expect(useTradingStore.getState().regime).toEqual({ trend: 'up' })
  })

  it('setDerivedData populates derived fields', () => {
    useTradingStore.getState().setDerivedData({ currentPrice: 65500, priceChange: 1.2 })
    expect(useTradingStore.getState().currentPrice).toBe(65500)
  })
})
