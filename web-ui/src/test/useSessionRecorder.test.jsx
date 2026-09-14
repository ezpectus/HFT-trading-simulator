/**
 * Tests for useSessionRecorder — real record/snapshot/stop/import behavior.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSessionRecorder } from '../hooks/useSessionRecorder'

const LS_KEY = 'trading-sim-session-recordings'

function marketData(equity) {
  return {
    accounts: { binance: { balance: equity, equity, trade_history: [{ id: 1 }] } },
    fills: [],
    signals: [],
    candles: { 'binance:BTC/USDT': [[1, 2, 3, 4, 5]] },
    prices: { 'BTC/USDT': 50000 },
    orderbooks: {},
  }
}

describe('useSessionRecorder', () => {
  beforeEach(() => localStorage.clear())

  it('starts recording and captures snapshots of supplied data', () => {
    const { result } = renderHook(() => useSessionRecorder())
    act(() => result.current.startRecording('test-run', 'BTC/USDT', 'binance'))
    expect(result.current.isRecording).toBe(true)

    act(() => result.current.updateData(marketData(10000)))
    act(() => result.current.captureSnapshot())
    expect(result.current.snapshotCount).toBe(1)
  })

  it('computes peak equity, drawdown, trades and balance on stop', () => {
    const { result } = renderHook(() => useSessionRecorder())
    act(() => result.current.startRecording('dd', 'BTC/USDT', 'binance'))
    act(() => result.current.updateData(marketData(10000)))
    act(() => result.current.captureSnapshot())
    act(() => result.current.updateData(marketData(8000)))
    act(() => result.current.captureSnapshot())

    let rec
    act(() => { rec = result.current.stopRecording() })
    expect(result.current.isRecording).toBe(false)
    expect(rec.snapshots).toHaveLength(2)
    expect(rec.metadata.peakEquity).toBe(10000)
    expect(rec.metadata.maxDrawdown).toBeCloseTo(0.2)
    // impl: finalBalance is Math.max over snapshots (peak balance, not last)
    expect(rec.metadata.finalBalance).toBe(10000)
    // trade_history is cumulative — last snapshot's count, not a sum
    // across snapshots (2 snaps × 1 trade would wrongly report 2)
    expect(rec.metadata.totalTrades).toBe(1)
  })

  it('totalTrades reflects the final cumulative history, not a per-snapshot sum', () => {
    const { result } = renderHook(() => useSessionRecorder())
    act(() => result.current.startRecording('trades', 'BTC/USDT', 'binance'))
    const data = marketData(10000)
    act(() => result.current.updateData(data))
    act(() => result.current.captureSnapshot())
    // history grows to 3 trades — cumulative list in the next snapshot
    data.accounts.binance.trade_history = [{ id: 1 }, { id: 2 }, { id: 3 }]
    act(() => result.current.updateData(data))
    act(() => result.current.captureSnapshot())

    let rec
    act(() => { rec = result.current.stopRecording() })
    // 1 + 3 = 4 would be the inflated sum; true session count is 3
    expect(rec.metadata.totalTrades).toBe(3)
  })

  it('persists recordings to localStorage and deletes by id', () => {
    const { result } = renderHook(() => useSessionRecorder())
    act(() => result.current.startRecording('persist', 'ETH/USDT', 'okx'))
    act(() => result.current.updateData(marketData(5000)))
    act(() => result.current.captureSnapshot())
    act(() => result.current.stopRecording())

    expect(result.current.savedRecordings).toHaveLength(1)
    const stored = JSON.parse(localStorage.getItem(LS_KEY))
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('persist')

    act(() => result.current.deleteRecording(stored[0].id))
    expect(result.current.savedRecordings).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem(LS_KEY))).toHaveLength(0)
  })

  it('importRecording validates format and rejects malformed JSON', () => {
    const { result } = renderHook(() => useSessionRecorder())

    let res
    act(() => { res = result.current.importRecording('{not json') })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/parse error/i)

    act(() => { res = result.current.importRecording('{"foo": 1}') })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Invalid recording format')

    const valid = {
      id: 'r1', name: 'imp', startTime: 1, endTime: 2, symbol: 'BTC/USDT',
      exchange: 'binance', snapshots: [], metadata: {},
    }
    act(() => { res = result.current.importRecording(JSON.stringify(valid)) })
    expect(res.ok).toBe(true)
    expect(result.current.savedRecordings[0].id).toBe('r1')
  })

  it('getSnapshotAt returns the snapshot nearest the timestamp', () => {
    const { result } = renderHook(() => useSessionRecorder())
    act(() => result.current.startRecording('nav', 'BTC/USDT', 'binance'))
    act(() => result.current.updateData(marketData(100)))
    act(() => result.current.captureSnapshot())
    let rec
    act(() => { rec = result.current.stopRecording() })

    const snap = result.current.getSnapshotAt(rec, rec.snapshots[0].t + 5)
    expect(snap).toBe(rec.snapshots[0])
    expect(result.current.getSnapshotAt({ snapshots: [] }, 0)).toBeNull()
  })
})
