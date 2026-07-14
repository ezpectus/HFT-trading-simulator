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

  it('tracks buffer size', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:8765'))
    await act(() => new Promise(r => setTimeout(r, 10)))
    act(() => {
      mockInstances[0].onmessage({ data: JSON.stringify({ type: 'candle' }) })
      mockInstances[0].onmessage({ data: JSON.stringify({ type: 'orderbook' }) })
    })
    expect(result.current.bufferSize).toBe(2)
  })

  it('clearBuffer resets buffer size', async () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:8765'))
    await act(() => new Promise(r => setTimeout(r, 10)))
    act(() => {
      mockInstances[0].onmessage({ data: JSON.stringify({ type: 'candle' }) })
    })
    expect(result.current.bufferSize).toBe(1)
    act(() => result.current.clearBuffer())
    expect(result.current.bufferSize).toBe(0)
  })
})
