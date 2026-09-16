/**
 * Tests for useWebSocket hook
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWebSocket } from '../hooks/useWebSocket'

class MockWebSocket {
  constructor(url, protocols) {
    this.url = url
    this.protocols = protocols
    this.readyState = 0 // CONNECTING
    this.onopen = null
    this.onmessage = null
    this.onerror = null
    this.onclose = null
    this.sent = []
    this._connectTimer = setTimeout(() => {
      this.readyState = 1 // OPEN
      this.onopen?.()
    }, 0)
  }
  send(data) { this.sent.push(data) }
  close() {
    clearTimeout(this._connectTimer)
    this.readyState = 3 // CLOSED
    this.onclose?.()
  }
}
MockWebSocket.CONNECTING = 0
MockWebSocket.OPEN = 1
MockWebSocket.CLOSING = 2
MockWebSocket.CLOSED = 3

let mockInstances = []

describe('useWebSocket', () => {
  beforeEach(() => {
    mockInstances = []
    vi.stubGlobal('WebSocket', class extends MockWebSocket {
      constructor(...args) {
        super(...args)
        mockInstances.push(this)
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('initializes with disconnected state', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:8765', { autoConnect: false }))
    expect(result.current.connected).toBe(false)
    expect(result.current.error).toBe(null)
    expect(result.current.latency).toBe(null)
    expect(result.current.reconnects).toBe(0)
  })

  it('connects when autoConnect is true', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:8765'))
    await act(() => new Promise(r => setTimeout(r, 10)))
    expect(result.current.connected).toBe(true)
  })

  it('sends subscribe message on connect', async () => {
    renderHook(() => useWebSocket('ws://localhost:8765'))
    await act(() => new Promise(r => setTimeout(r, 10)))
    expect(mockInstances[0].sent.length).toBeGreaterThan(0)
    const sent = JSON.parse(mockInstances[0].sent[0])
    expect(sent.type).toBe('subscribe')
  })

  it('sends auth frame BEFORE subscribe when authToken set', async () => {
    renderHook(() => useWebSocket('ws://localhost:8766', { authToken: 'tok-1' }))
    await act(() => new Promise(r => setTimeout(r, 10)))
    const frames = mockInstances[0].sent.map(s => JSON.parse(s))
    expect(frames[0]).toEqual({ type: 'auth', token: 'tok-1' })
    expect(frames[1].type).toBe('subscribe')
  })

  it('sends no auth frame when authToken unset', async () => {
    renderHook(() => useWebSocket('ws://localhost:8766'))
    await act(() => new Promise(r => setTimeout(r, 10)))
    const frames = mockInstances[0].sent.map(s => JSON.parse(s))
    expect(frames.every(f => f.type !== 'auth')).toBe(true)
  })

  it('calls onMessage callback for received data', async () => {
    const onMessage = vi.fn()
    renderHook(() => useWebSocket('ws://localhost:8765', { onMessage }))
    await act(() => new Promise(r => setTimeout(r, 10)))
    act(() => {
      mockInstances[0].onmessage({ data: JSON.stringify({ type: 'candle', symbol: 'BTC/USDT' }) })
    })
    expect(onMessage).toHaveBeenCalledWith({ type: 'candle', symbol: 'BTC/USDT' })
  })

  it('sets error on WebSocket error event', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:8765'))
    await act(() => new Promise(r => setTimeout(r, 10)))
    act(() => {
      mockInstances[0].onerror(new Event('error'))
    })
    expect(result.current.error).toContain('WebSocket error')
    expect(result.current.error).toContain('ws://localhost:8765')
  })

  it('disconnects cleanly', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:8765'))
    await act(() => new Promise(r => setTimeout(r, 10)))
    expect(result.current.connected).toBe(true)
    act(() => result.current.disconnect())
    expect(result.current.connected).toBe(false)
  })

  it('send returns false when not connected', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:8765', { autoConnect: false }))
    expect(result.current.send({ type: 'ping' })).toBe(false)
  })

  it('send returns true when connected', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:8765'))
    await act(() => new Promise(r => setTimeout(r, 10)))
    let sent
    act(() => { sent = result.current.send({ type: 'ping' }) })
    expect(sent).toBe(true)
  })

  it('does not send a bogus permessage-deflate subprotocol', async () => {
    renderHook(() => useWebSocket('ws://localhost:8765'))
    await act(() => new Promise(r => setTimeout(r, 10)))
    // Second WebSocket ctor arg is SUBPROTOCOLS — the old code passed
    // ['permessage-deflate'], an extension name the browser offers itself.
    expect(mockInstances[0].protocols).toBeUndefined()
  })

  it('caps retries when the server never connects', async () => {
    vi.useFakeTimers()
    try {
      // Every attempt closes immediately — the server is down.
      vi.stubGlobal('WebSocket', class extends MockWebSocket {
        constructor(...args) {
          super(...args)
          clearTimeout(this._connectTimer)
          this.readyState = 3
          queueMicrotask(() => this.onclose?.())
          mockInstances.push(this)
        }
      })
      const { result } = renderHook(() => useWebSocket('ws://localhost:9999', { maxReconnects: 3 }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(120000)
      })
      expect(result.current.error).toContain('Max reconnections')
      expect(result.current.connected).toBe(false)
      // 1 initial + 2 retries (attempts counted on close, not on open)
      expect(mockInstances.length).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('manual disconnect does not auto-reconnect', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useWebSocket('ws://localhost:8765'))
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })
      expect(result.current.connected).toBe(true)
      act(() => result.current.disconnect())
      await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
      expect(mockInstances.length).toBe(1) // no reconnect attempt spawned
      expect(result.current.connected).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('unmount does not spawn a ghost reconnect', async () => {
    vi.useFakeTimers()
    try {
      const { result, unmount } = renderHook(() => useWebSocket('ws://localhost:8765'))
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })
      expect(result.current.connected).toBe(true)
      unmount() // cleanup closes ws → onclose fires → must not scheduleRetry
      await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
      expect(mockInstances.length).toBe(1) // no ghost socket created post-unmount
    } finally {
      vi.useRealTimers()
    }
  })
})
