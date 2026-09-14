/**
 * Tests for the useSignalData hook (src/hooks/useSignalData.js)
 * Split out of useExchangeData.js — verifies the module resolves standalone
 * and message dispatch maps to state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    connected: true,
    send: vi.fn(() => true),
    latency: 30,
    reconnects: 0,
  })),
}))

import { useWebSocket } from '../hooks/useWebSocket'
import { useSignalData } from '../hooks/useSignalData'

describe('useSignalData (own module)', () => {
  let mockOnMessage

  beforeEach(() => {
    vi.clearAllMocks()
    useWebSocket.mockImplementation((url, opts) => {
      mockOnMessage = opts.onMessage
      return { connected: true, send: vi.fn(() => true), latency: 30, reconnects: 0 }
    })
  })

  it('connects to the signal endpoint, not the exchange endpoint', () => {
    renderHook(() => useSignalData())
    expect(useWebSocket).toHaveBeenCalledWith(
      expect.stringContaining('8766'),
      expect.objectContaining({ label: 'signal' }),
    )
  })

  it('maps circuit_breaker_status to tripped state', () => {
    const { result } = renderHook(() => useSignalData())
    act(() => {
      mockOnMessage({
        type: 'circuit_breaker_status',
        state: 'OPEN',
        consecutive_failures: 5,
        total_trips: 2,
        total_blocks: 9,
      })
    })
    expect(result.current.circuitBreaker).toEqual({
      tripped: true, state: 'OPEN', consecutiveLosses: 5, totalTrips: 2, totalBlocks: 9,
    })
  })

  it('maps CLOSED breaker state to tripped=false', () => {
    const { result } = renderHook(() => useSignalData())
    act(() => {
      mockOnMessage({ type: 'circuit_breaker_status', state: 'CLOSED', consecutive_failures: 0 })
    })
    expect(result.current.circuitBreaker.tripped).toBe(false)
  })

  it('routes each result type to its own slot', () => {
    const { result } = renderHook(() => useSignalData())
    act(() => {
      mockOnMessage({ type: 'cvar_result', cvar: -0.05 })
      mockOnMessage({ type: 'hawkes_result', intensity: 3.2 })
      mockOnMessage({ type: 'portfolio_result', weights: { 'BTC/USDT': 0.6 } })
    })
    expect(result.current.cvarResult.cvar).toBe(-0.05)
    expect(result.current.hawkesResult.intensity).toBe(3.2)
    expect(result.current.portfolioResult.weights['BTC/USDT']).toBe(0.6)
    // other slots untouched
    expect(result.current.stressTestResult).toBeNull()
    expect(result.current.backtestResult).toBeNull()
  })

  it('auth_ok and auth_failed drive authState', () => {
    const { result } = renderHook(() => useSignalData())
    act(() => { mockOnMessage({ type: 'auth_ok' }) })
    expect(result.current.authState).toBe('ok')
    act(() => { mockOnMessage({ type: 'auth_failed' }) })
    expect(result.current.authState).toBe('failed')
  })
})
