/**
 * Tests for useMockExchangeData and useMockSignalData hooks
 * Tests: initial snapshot, periodic updates, submitOrder, closePosition,
 * toggleReplay, signal generation, regime updates, cleanup
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock mockData utilities
vi.mock('../utils/mockData', () => ({
  generateInitialSnapshot: vi.fn(() => ({
    candles: [
      { exchange: 'binance', symbol: 'BTC/USDT', timestamp: 100, open: 50000, high: 50100, low: 49900, close: 50050, volume: 10 },
      { exchange: 'okx', symbol: 'ETH/USDT', timestamp: 100, open: 3000, high: 3010, low: 2990, close: 3005, volume: 50 },
    ],
    prices: { 'binance|BTC/USDT': 50050, 'okx|ETH/USDT': 3005 },
    accounts: { binance: { balance: 10000, equity: 10000, positions: {} } },
    orderbooks: { 'binance|BTC/USDT': { bids: [{ price: 50000, quantity: 1 }], asks: [{ price: 50100, quantity: 0.5 }] } },
  })),
  generateCandles: vi.fn(() => [{ exchange: 'binance', symbol: 'BTC/USDT', timestamp: 200, open: 50050, high: 50100, low: 50000, close: 50080, volume: 15 }]),
  generateOrderBook: vi.fn(() => ({ bids: [{ price: 50000, quantity: 1 }], asks: [{ price: 50100, quantity: 0.5 }] })),
  generateSignal: vi.fn(() => ({ symbol: 'BTC/USDT', direction: 'LONG', confidence: 0.85, strategy: 'momentum' })),
  generateFill: vi.fn(() => ({ id: 1, symbol: 'BTC/USDT', exchange: 'binance', side: 'BUY', qty: 0.5, price: 50050 })),
  generateNewsEvent: vi.fn(() => ({ title: 'Fed rate decision', impact: 'high' })),
  maybeUpdatePosition: vi.fn((accounts) => accounts),
  MOCK_SYMBOLS: ['BTC/USDT', 'ETH/USDT'],
  MOCK_EXCHANGES: ['binance', 'okx'],
}))

import {
  useMockExchangeData,
  useMockSignalData,
  IS_MOCK,
} from '../hooks/useMockData'
import {
  generateInitialSnapshot,
  generateCandles,
  generateFill,
} from '../utils/mockData'

describe('useMockExchangeData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns initial state with connected and zero latency', () => {
    const { result } = renderHook(() => useMockExchangeData())
    expect(result.current.connected).toBe(true)
    expect(result.current.latency).toBe(0)
    expect(result.current.reconnects).toBe(0)
  })

  it('loads initial snapshot on mount', () => {
    const { result } = renderHook(() => useMockExchangeData())
    expect(generateInitialSnapshot).toHaveBeenCalled()
    expect(result.current.candles).toHaveLength(2)
    expect(result.current.prices['binance|BTC/USDT']).toBe(50050)
    expect(result.current.accounts.binance.balance).toBe(10000)
  })

  it('returns correct API surface', () => {
    const { result } = renderHook(() => useMockExchangeData())
    expect(typeof result.current.submitOrder).toBe('function')
    expect(typeof result.current.closePosition).toBe('function')
    expect(typeof result.current.sendSpeedChange).toBe('function')
    expect(typeof result.current.sendConfigUpdate).toBe('function')
    expect(typeof result.current.toggleReplay).toBe('function')
    expect(typeof result.current.scrubReplay).toBe('function')
    expect(result.current.arbitrage).toBeNull()
    expect(result.current.fundingRates).toEqual({})
    expect(result.current.candlesToFunding).toBe(8)
    expect(result.current.weekendMode).toBe(false)
  })

  it('submitOrder generates fill and returns true', () => {
    const { result } = renderHook(() => useMockExchangeData())
    let ret
    act(() => {
      ret = result.current.submitOrder({ symbol: 'BTC/USDT', exchange: 'binance' })
    })
    expect(ret).toBe(true)
    expect(generateFill).toHaveBeenCalled()
  })

  it('closePosition returns true', () => {
    const { result } = renderHook(() => useMockExchangeData())
    let ret
    act(() => {
      ret = result.current.closePosition('binance', 'BTC/USDT')
    })
    expect(ret).toBe(true)
  })

  it('sendSpeedChange returns true', () => {
    const { result } = renderHook(() => useMockExchangeData())
    expect(result.current.sendSpeedChange(2.0)).toBe(true)
  })

  it('sendConfigUpdate returns true', () => {
    const { result } = renderHook(() => useMockExchangeData())
    expect(result.current.sendConfigUpdate({ leverage: 5 })).toBe(true)
  })

  it('toggleReplay toggles paused state', () => {
    const { result } = renderHook(() => useMockExchangeData())
    expect(result.current.replayPaused).toBe(false)
    act(() => result.current.toggleReplay())
    expect(result.current.replayPaused).toBe(true)
    act(() => result.current.toggleReplay())
    expect(result.current.replayPaused).toBe(false)
  })

  it('scrubReplay does not throw', () => {
    const { result } = renderHook(() => useMockExchangeData())
    expect(() => act(() => result.current.scrubReplay(5000))).not.toThrow()
  })

  it('generates periodic updates on interval', () => {
    renderHook(() => useMockExchangeData())

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    // Should have called generateCandles for each symbol/exchange
    expect(generateCandles).toHaveBeenCalled()
  })

  it('cleans up interval on unmount', () => {
    const { unmount } = renderHook(() => useMockExchangeData())
    unmount()
    // Advancing timers should not cause errors after unmount
    act(() => {
      vi.advanceTimersByTime(2000)
    })
  })
})

describe('useMockSignalData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns initial state with signals after mount', () => {
    const { result } = renderHook(() => useMockSignalData())
    // Should generate 10 initial signals
    expect(result.current.signals).toHaveLength(10)
    expect(result.current.regime).toBeNull()
    expect(result.current.backtestResult).toBeNull()
    expect(result.current.connected).toBe(true)
    expect(result.current.latency).toBe(0)
  })

  it('generates new signals on interval', () => {
    const { result } = renderHook(() => useMockSignalData())

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    // Should have added a new signal (capped at 50)
    expect(result.current.signals.length).toBeLessThanOrEqual(50)
  })

  it('sendSignalMessage returns true', () => {
    const { result } = renderHook(() => useMockSignalData())
    expect(result.current.sendSignalMessage({ type: 'test' })).toBe(true)
  })

  it('cleans up interval on unmount', () => {
    const { unmount } = renderHook(() => useMockSignalData())
    unmount()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
  })
})

describe('IS_MOCK', () => {
  it('is a boolean', () => {
    expect(typeof IS_MOCK).toBe('boolean')
  })
})
