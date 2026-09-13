/**
 * Tests for useExchangeData and useSignalData hooks
 * Tests: message handling (snapshot, candles, fills, arbitrage, replay),
 * signal handling (signal_history, signal, regime, backtest), API methods
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock useWebSocket before importing hooks that depend on it
vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    connected: false,
    send: vi.fn(),
    latency: 0,
    reconnects: 0,
  })),
}))

import { useWebSocket } from '../hooks/useWebSocket'
import { useExchangeData, useSignalData } from '../hooks/useExchangeData'

describe('useExchangeData', () => {
  let mockOnMessage
  let mockSend

  beforeEach(() => {
    vi.clearAllMocks()
    mockSend = vi.fn()
    useWebSocket.mockReturnValue({
      connected: true,
      send: mockSend,
      latency: 50,
      reconnects: 0,
    })
    // Capture onMessage callback from useWebSocket options
    useWebSocket.mockImplementation((url, opts) => {
      mockOnMessage = opts.onMessage
      return { connected: true, send: mockSend, latency: 50, reconnects: 0 }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns initial state with empty data', () => {
    const { result } = renderHook(() => useExchangeData())
    expect(result.current.candles).toEqual([])
    expect(result.current.prices).toEqual({})
    expect(result.current.accounts).toEqual({})
    expect(result.current.arbitrage).toBeNull()
    expect(result.current.fills).toEqual([])
    expect(result.current.orderbooks).toEqual({})
    expect(result.current.fundingRates).toEqual({})
    expect(result.current.connected).toBe(true)
  })

  it('handles snapshot message with candles and prices', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({
        type: 'snapshot',
        candles: [
          { exchange: 'binance', symbol: 'BTC/USDT', timestamp: 100, open: 50000, high: 50100, low: 49900, close: 50050, volume: 10 },
        ],
        prices: { 'BTC/USDT': 50050 },
        accounts: { binance: { balance: 10000 } },
        orderbooks: { 'BTC/USDT': { bids: [], asks: [] } },
      })
    })
    expect(result.current.candles).toHaveLength(1)
    expect(result.current.candles[0].close).toBe(50050)
    expect(result.current.prices['BTC/USDT']).toBe(50050)
    expect(result.current.accounts.binance.balance).toBe(10000)
  })

  it('handles fill message by prepending to fills list', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({ type: 'fill', order: { id: 1, symbol: 'BTC/USDT', qty: 0.5, price: 50000 } })
    })
    expect(result.current.fills).toHaveLength(1)
    expect(result.current.fills[0].id).toBe(1)
    expect(result.current.fills[0].received_at).toBeDefined()
  })

  it('limits fills to 50 entries', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      for (let i = 0; i < 55; i++) {
        mockOnMessage({ type: 'fill', order: { id: i, symbol: 'BTC/USDT' } })
      }
    })
    expect(result.current.fills).toHaveLength(50)
    // Most recent should be first
    expect(result.current.fills[0].id).toBe(54)
  })

  it('handles fills_batch by prepending all engine-generated fills', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({ type: 'fill', order: { id: 'manual-1', status: 'FILLED' } })
    })
    act(() => {
      mockOnMessage({
        type: 'fills_batch',
        orders: [
          { id: 'sl-9', status: 'FILLED', side: 'SELL' },
          { id: 'arb-2', status: 'FILLED', side: 'BUY' },
        ],
      })
    })
    expect(result.current.fills).toHaveLength(3)
    expect(result.current.fills.map(f => f.id)).toEqual(['sl-9', 'arb-2', 'manual-1'])
    expect(result.current.fills[0].received_at).toBeDefined()
  })

  it('ignores fills_batch with empty or missing orders', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({ type: 'fills_batch', orders: [] })
      mockOnMessage({ type: 'fills_batch' })
    })
    expect(result.current.fills).toEqual([])
  })

  it('captures server error messages into lastError', () => {
    const { result } = renderHook(() => useExchangeData())
    expect(result.current.lastError).toBeNull()
    act(() => {
      mockOnMessage({ type: 'error', message: 'Trading is stopped — send start_trading to enable orders' })
    })
    expect(result.current.lastError.message).toContain('Trading is stopped')
    expect(result.current.lastError.at).toBeDefined()
    act(() => {
      mockOnMessage({ type: 'error', message: 'Rate limit exceeded' })
    })
    expect(result.current.lastError.message).toBe('Rate limit exceeded')
  })

  it('handles arbitrage_scan message', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({ type: 'arbitrage_scan', active: [{ symbol: 'BTC/USDT', spread_bps: 5 }] })
    })
    expect(result.current.arbitrage).not.toBeNull()
    expect(result.current.arbitrage.active).toHaveLength(1)
  })

  it('handles replay_state message', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({ type: 'replay_state', paused: true })
    })
    expect(result.current.replayPaused).toBe(true)
  })

  it('handles replay_candles message', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({
        type: 'replay_candles',
        candles: [
          { exchange: 'binance', symbol: 'BTC/USDT', timestamp: 200, open: 51000, high: 51100, low: 50900, close: 51050, volume: 15 },
        ],
      })
    })
    expect(result.current.candles.length).toBeGreaterThanOrEqual(1)
  })

  it('handles funding_rates in snapshot', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({
        type: 'snapshot',
        funding_rates: { 'BTC/USDT': 0.0001 },
        candles_to_funding: 100,
      })
    })
    expect(result.current.fundingRates['BTC/USDT']).toBe(0.0001)
    expect(result.current.candlesToFunding).toBe(100)
  })

  it('handles news_event in snapshot', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({
        type: 'snapshot',
        news_event: { title: 'Fed rate decision', impact: 'high' },
      })
    })
    expect(result.current.newsEvent).not.toBeNull()
    expect(result.current.newsEvent.title).toBe('Fed rate decision')
  })

  it('handles weekend_mode in snapshot', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({ type: 'snapshot', weekend_mode: true })
    })
    expect(result.current.weekendMode).toBe(true)
  })

  it('merges candles by exchange+symbol+timestamp', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({
        type: 'snapshot',
        candles: [
          { exchange: 'binance', symbol: 'BTC/USDT', timestamp: 100, close: 50000 },
          { exchange: 'binance', symbol: 'BTC/USDT', timestamp: 100, close: 50050 },
        ],
      })
    })
    // Same key → should merge, not duplicate
    expect(result.current.candles).toHaveLength(1)
    expect(result.current.candles[0].close).toBe(50050)
  })

  it('sorts candles by timestamp', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({
        type: 'snapshot',
        candles: [
          { exchange: 'binance', symbol: 'BTC/USDT', timestamp: 200, close: 51000 },
          { exchange: 'binance', symbol: 'BTC/USDT', timestamp: 100, close: 50000 },
        ],
      })
    })
    expect(result.current.candles[0].timestamp).toBe(100)
    expect(result.current.candles[1].timestamp).toBe(200)
  })

  it('submitOrder sends order message via websocket', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      result.current.submitOrder({ symbol: 'BTC/USDT', side: 'BUY', qty: 1.0 })
    })
    const sent = mockSend.mock.calls[0][0]
    expect(sent).toMatchObject({ type: 'order', symbol: 'BTC/USDT', side: 'BUY', qty: 1.0 })
    expect(typeof sent.client_order_id).toBe('string')
    expect(sent.client_order_id.length).toBeGreaterThan(0)
  })

  it('closePosition sends close_position message', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      result.current.closePosition('binance', 'BTC/USDT')
    })
    expect(mockSend).toHaveBeenCalledWith({ type: 'close_position', exchange: 'binance', symbol: 'BTC/USDT' })
  })

  it('sendSpeedChange sends set_speed message', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      result.current.sendSpeedChange(2.0)
    })
    expect(mockSend).toHaveBeenCalledWith({ type: 'set_speed', speed: 2.0 })
  })

  it('sendConfigUpdate sends update_config message', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      result.current.sendConfigUpdate({ leverage: 5 })
    })
    expect(mockSend).toHaveBeenCalledWith({ type: 'update_config', updates: { leverage: 5 } })
  })

  it('toggleReplay sends pause when not paused', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      result.current.toggleReplay()
    })
    expect(mockSend).toHaveBeenCalledWith({ type: 'replay', action: 'pause' })
  })

  it('toggleReplay sends resume when paused', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({ type: 'replay_state', paused: true })
    })
    act(() => {
      result.current.toggleReplay()
    })
    expect(mockSend).toHaveBeenCalledWith({ type: 'replay', action: 'resume' })
  })

  it('scrubReplay sends scrub message', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      result.current.scrubReplay(5000)
    })
    expect(mockSend).toHaveBeenCalledWith({ type: 'replay', action: 'scrub', offset: 5000 })
  })

  it('ignores unknown message types', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({ type: 'unknown_type', data: 'test' })
    })
    // State should remain unchanged
    expect(result.current.candles).toEqual([])
    expect(result.current.fills).toEqual([])
  })

  it('starts with empty auditLogs', () => {
    const { result } = renderHook(() => useExchangeData())
    expect(result.current.auditLogs).toEqual([])
  })

  it('handles audit_logs message by prepending entries', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({
        type: 'audit_logs',
        logs: [
          { id: 'a1', event_type: 'ORDER_FILLED', exchange: 'binance', symbol: 'BTC/USDT', timestamp: 100 },
        ],
      })
    })
    expect(result.current.auditLogs).toHaveLength(1)
    expect(result.current.auditLogs[0].id).toBe('a1')
    expect(result.current.auditLogs[0].event_type).toBe('ORDER_FILLED')
  })

  it('prepends newer audit batches ahead of older ones', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({ type: 'audit_logs', logs: [{ id: 'old', event_type: 'ORDER_FILLED', timestamp: 1 }] })
    })
    act(() => {
      mockOnMessage({ type: 'audit_logs', logs: [{ id: 'new', event_type: 'ORDER_CANCELLED', timestamp: 2 }] })
    })
    expect(result.current.auditLogs[0].id).toBe('new')
    expect(result.current.auditLogs[1].id).toBe('old')
  })

  it('bounds audit log history at 200 entries', () => {
    const { result } = renderHook(() => useExchangeData())
    const logs = Array.from({ length: 250 }, (_, i) => ({ id: `e${i}`, event_type: 'ORDER_FILLED', timestamp: i }))
    act(() => {
      mockOnMessage({ type: 'audit_logs', logs })
    })
    expect(result.current.auditLogs).toHaveLength(200)
    expect(result.current.auditLogs[0].id).toBe('e0')
  })

  it('ignores audit_logs message with empty logs array', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({ type: 'audit_logs', logs: [] })
    })
    expect(result.current.auditLogs).toEqual([])
  })

  it('tracks PENDING fill ack as an open order', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({
        type: 'fill',
        order: { id: 'o1', exchange: 'binance', symbol: 'BTC/USDT', side: 'BUY', status: 'PENDING', price: 49000 },
      })
    })
    expect(result.current.openOrders['binance|o1']).toMatchObject({ id: 'o1', status: 'PENDING', price: 49000 })
  })

  it('removes open order when a later fill reports FILLED', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({ type: 'fill', order: { id: 'o1', exchange: 'binance', status: 'PENDING' } })
    })
    expect(result.current.openOrders['binance|o1']).toBeDefined()
    act(() => {
      mockOnMessage({ type: 'fills_batch', orders: [{ id: 'o1', exchange: 'binance', status: 'FILLED' }] })
    })
    expect(result.current.openOrders['binance|o1']).toBeUndefined()
  })

  it('drops REJECTED acks from open orders', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({ type: 'fill', order: { id: 'o1', exchange: 'binance', status: 'PENDING' } })
    })
    act(() => {
      mockOnMessage({ type: 'fill', order: { id: 'o1', exchange: 'binance', status: 'REJECTED', rejection_reason: 'margin' } })
    })
    expect(result.current.openOrders['binance|o1']).toBeUndefined()
  })

  it('removes a single order on order_cancelled', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({ type: 'fill', order: { id: 'o1', exchange: 'binance', status: 'PENDING' } })
      mockOnMessage({ type: 'fill', order: { id: 'o2', exchange: 'binance', status: 'PENDING' } })
    })
    act(() => {
      mockOnMessage({ type: 'order_cancelled', order: { id: 'o1', exchange: 'binance', status: 'CANCELLED' } })
    })
    expect(result.current.openOrders['binance|o1']).toBeUndefined()
    expect(result.current.openOrders['binance|o2']).toBeDefined()
  })

  it('clears listed orders on orders_cancelled', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({ type: 'fill', order: { id: 'o1', exchange: 'binance', status: 'PENDING' } })
      mockOnMessage({ type: 'fill', order: { id: 'o2', exchange: 'binance', status: 'PENDING' } })
      mockOnMessage({ type: 'fill', order: { id: 'o3', exchange: 'bybit', status: 'PENDING' } })
    })
    act(() => {
      mockOnMessage({ type: 'orders_cancelled', exchange: 'binance', count: 2, order_ids: ['o1', 'o2'] })
    })
    expect(result.current.openOrders['binance|o1']).toBeUndefined()
    expect(result.current.openOrders['binance|o2']).toBeUndefined()
    expect(result.current.openOrders['bybit|o3']).toBeDefined()
  })

  it('hydrates openOrders from snapshot open_orders', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({
        type: 'snapshot',
        open_orders: {
          binance: [{ id: 'o1', exchange: 'binance', status: 'PENDING', price: 100 }],
          bybit: [{ id: 'o9', exchange: 'bybit', status: 'PENDING', price: 200 }],
        },
      })
    })
    expect(Object.keys(result.current.openOrders)).toEqual(['binance|o1', 'bybit|o9'])
  })

  it('snapshot open_orders replaces stale state wholesale', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({ type: 'fill', order: { id: 'stale', exchange: 'binance', status: 'PENDING' } })
    })
    act(() => {
      mockOnMessage({ type: 'sync_state', open_orders: { binance: [] } })
    })
    expect(result.current.openOrders).toEqual({})
  })

  it('submitOrder resolves with the matching ack', async () => {
    const { result } = renderHook(() => useExchangeData())
    let ackPromise
    act(() => {
      ackPromise = result.current.submitOrder({ exchange: 'binance', symbol: 'BTC/USDT', side: 'BUY', quantity: 1 })
    })
    const cid = mockSend.mock.calls[0][0].client_order_id
    await act(async () => {
      mockOnMessage({
        type: 'fill',
        order: { id: 'o1', exchange: 'binance', status: 'FILLED', filled_price: 50000, client_order_id: cid },
      })
      await ackPromise
    })
    await expect(ackPromise).resolves.toMatchObject({ status: 'FILLED', filled_price: 50000 })
  })

  it('submitOrder resolves null on ack timeout', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useExchangeData())
    let ackPromise
    act(() => {
      ackPromise = result.current.submitOrder({ exchange: 'binance', symbol: 'BTC/USDT', side: 'BUY', quantity: 1 })
    })
    await act(async () => {
      vi.advanceTimersByTime(6000)
      await ackPromise
    })
    await expect(ackPromise).resolves.toBeNull()
    vi.useRealTimers()
  })

  it('cancelOrder sends cancel_order message', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      result.current.cancelOrder('binance', 'o1')
    })
    expect(mockSend).toHaveBeenCalledWith({ type: 'cancel_order', exchange: 'binance', order_id: 'o1' })
  })

  it('cancelAllOrders sends cancel_all_orders with optional symbol', () => {
    const { result } = renderHook(() => useExchangeData())
    act(() => {
      result.current.cancelAllOrders('binance', 'BTC/USDT')
    })
    expect(mockSend).toHaveBeenCalledWith({ type: 'cancel_all_orders', exchange: 'binance', symbol: 'BTC/USDT' })
  })

  it('requests sync_state on a broadcast seq gap', () => {
    renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({ type: 'candles', seq: 5, timestamp: 100, candles: [] })
    })
    act(() => {
      mockOnMessage({ type: 'candles', seq: 8, timestamp: 110, candles: [] })
    })
    // Cursor must be the pre-gap ts (100) — not the gapped message's (110)
    expect(mockSend).toHaveBeenCalledWith({ type: 'sync_state', last_timestamp: 100 })
  })

  it('does not resync on contiguous seq', () => {
    renderHook(() => useExchangeData())
    act(() => {
      for (const seq of [1, 2, 3]) {
        mockOnMessage({ type: 'candles', seq, candles: [] })
      }
    })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('resets seq baseline when the socket re-opens', () => {
    let capturedOnOpen
    useWebSocket.mockImplementation((url, opts) => {
      capturedOnOpen = opts.onOpen
      mockOnMessage = opts.onMessage
      return { connected: true, send: mockSend, latency: 50, reconnects: 0 }
    })
    renderHook(() => useExchangeData())
    act(() => {
      mockOnMessage({ type: 'candles', seq: 50, candles: [] })
      capturedOnOpen()                       // server restart → counter resets
      mockOnMessage({ type: 'candles', seq: 1, candles: [] })
      mockOnMessage({ type: 'candles', seq: 2, candles: [] })
    })
    expect(mockSend).not.toHaveBeenCalled()  // no spurious gap on 1 → 2
  })
})

describe('useSignalData', () => {
  let mockOnMessage
  let mockSend

  beforeEach(() => {
    vi.clearAllMocks()
    mockSend = vi.fn()
    useWebSocket.mockImplementation((url, opts) => {
      mockOnMessage = opts.onMessage
      return { connected: true, send: mockSend, latency: 30, reconnects: 0 }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns initial state with empty signals', () => {
    const { result } = renderHook(() => useSignalData())
    expect(result.current.signals).toEqual([])
    expect(result.current.regime).toBeNull()
    expect(result.current.backtestResult).toBeNull()
    expect(result.current.connected).toBe(true)
  })

  it('handles signal_history message', () => {
    const { result } = renderHook(() => useSignalData())
    act(() => {
      mockOnMessage({
        type: 'signal_history',
        signals: [
          { symbol: 'BTC/USDT', direction: 'LONG', confidence: 0.85 },
          { symbol: 'ETH/USDT', direction: 'SHORT', confidence: 0.70 },
        ],
      })
    })
    expect(result.current.signals).toHaveLength(2)
    expect(result.current.signals[0].symbol).toBe('BTC/USDT')
  })

  it('handles single signal message by prepending', () => {
    const { result } = renderHook(() => useSignalData())
    act(() => {
      mockOnMessage({ type: 'signal_history', signals: [{ symbol: 'BTC/USDT', direction: 'LONG' }] })
    })
    act(() => {
      mockOnMessage({ type: 'signal', symbol: 'ETH/USDT', direction: 'SHORT', confidence: 0.75 })
    })
    expect(result.current.signals).toHaveLength(2)
    expect(result.current.signals[0].symbol).toBe('ETH/USDT')
  })

  it('limits signals to 50 entries', () => {
    const { result } = renderHook(() => useSignalData())
    act(() => {
      for (let i = 0; i < 55; i++) {
        mockOnMessage({ type: 'signal', symbol: `SYM${i}`, direction: 'LONG' })
      }
    })
    expect(result.current.signals).toHaveLength(50)
    expect(result.current.signals[0].symbol).toBe('SYM54')
  })

  it('handles market_regime message', () => {
    const { result } = renderHook(() => useSignalData())
    act(() => {
      mockOnMessage({ type: 'market_regime', regime: 'trending', confidence: 0.90 })
    })
    expect(result.current.regime).not.toBeNull()
    expect(result.current.regime.regime).toBe('trending')
  })

  it('handles backtest_result message', () => {
    const { result } = renderHook(() => useSignalData())
    act(() => {
      mockOnMessage({ type: 'backtest_result', totalTrades: 100, winRate: 0.65 })
    })
    expect(result.current.backtestResult).not.toBeNull()
    expect(result.current.backtestResult.totalTrades).toBe(100)
  })

  it('calls onBacktestResult callback when provided', () => {
    const callback = vi.fn()
    renderHook(() => useSignalData({ onBacktestResult: callback }))
    act(() => {
      mockOnMessage({ type: 'backtest_result', totalTrades: 50 })
    })
    expect(callback).toHaveBeenCalledWith({ type: 'backtest_result', totalTrades: 50 })
  })

  it('ignores unknown message types', () => {
    const { result } = renderHook(() => useSignalData())
    act(() => {
      mockOnMessage({ type: 'unknown', data: 'test' })
    })
    expect(result.current.signals).toEqual([])
    expect(result.current.regime).toBeNull()
  })

  it('sendSignalMessage is exposed', () => {
    const { result } = renderHook(() => useSignalData())
    expect(typeof result.current.sendSignalMessage).toBe('function')
    act(() => {
      result.current.sendSignalMessage({ type: 'test' })
    })
    expect(mockSend).toHaveBeenCalledWith({ type: 'test' })
  })
})
