import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useNotifications } from '../hooks/useNotifications'

function makeParams(overrides = {}) {
  return {
    exchange: { connected: false, fills: [], newsEvent: null },
    signals: { connected: false, signals: [] },
    addToast: vi.fn(),
    playSound: vi.fn(),
    ...overrides,
  }
}

describe('useNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('notifies on exchange connect', () => {
    const params = makeParams()
    const { rerender } = renderHook(
      (props) => useNotifications(props),
      { initialProps: params },
    )
    rerender(makeParams({
      exchange: { connected: true, fills: [], newsEvent: null },
      signals: { connected: false, signals: [] },
      addToast: params.addToast,
      playSound: params.playSound,
    }))
    expect(params.addToast).toHaveBeenCalledWith('success', 'Exchange Simulator connected')
    expect(params.playSound).toHaveBeenCalledWith('connect')
  })

  it('notifies on exchange disconnect', () => {
    const params = makeParams({
      exchange: { connected: true, fills: [], newsEvent: null },
    })
    const { rerender } = renderHook(
      (props) => useNotifications(props),
      { initialProps: params },
    )
    rerender(makeParams({
      exchange: { connected: false, fills: [], newsEvent: null },
      signals: { connected: false, signals: [] },
      addToast: params.addToast,
      playSound: params.playSound,
    }))
    expect(params.addToast).toHaveBeenCalledWith('error', 'Exchange Simulator disconnected')
    expect(params.playSound).toHaveBeenCalledWith('disconnect')
  })

  it('notifies on signal bot connect', () => {
    const params = makeParams()
    const { rerender } = renderHook(
      (props) => useNotifications(props),
      { initialProps: params },
    )
    rerender(makeParams({
      exchange: { connected: false, fills: [], newsEvent: null },
      signals: { connected: true, signals: [] },
      addToast: params.addToast,
      playSound: params.playSound,
    }))
    expect(params.addToast).toHaveBeenCalledWith('success', 'AI Signal Bot connected')
  })

  it('notifies on strong signal (confidence >= 75)', () => {
    const params = makeParams({
      signals: { connected: false, signals: [{ direction: 'LONG', symbol: 'BTCUSDT', confidence: 80 }] },
    })
    const { rerender } = renderHook(
      (props) => useNotifications(props),
      { initialProps: params },
    )
    rerender(makeParams({
      exchange: { connected: false, fills: [], newsEvent: null },
      signals: { connected: false, signals: [
        { direction: 'LONG', symbol: 'BTCUSDT', confidence: 80 },
        { direction: 'SHORT', symbol: 'ETHUSDT', confidence: 85 },
      ] },
      addToast: params.addToast,
      playSound: params.playSound,
    }))
    expect(params.addToast).toHaveBeenCalledWith(
      'info',
      expect.stringContaining('Strong signal'),
      4000,
    )
  })

  it('does not notify on weak signals (confidence < 75)', () => {
    const params = makeParams({
      signals: { connected: false, signals: [{ direction: 'LONG', symbol: 'BTCUSDT', confidence: 50 }] },
    })
    const { rerender } = renderHook(
      (props) => useNotifications(props),
      { initialProps: params },
    )
    rerender(makeParams({
      exchange: { connected: false, fills: [], newsEvent: null },
      signals: { connected: false, signals: [
        { direction: 'LONG', symbol: 'BTCUSDT', confidence: 50 },
        { direction: 'SHORT', symbol: 'ETHUSDT', confidence: 60 },
      ] },
      addToast: params.addToast,
      playSound: params.playSound,
    }))
    expect(params.addToast).not.toHaveBeenCalledWith(
      'info',
      expect.stringContaining('Strong signal'),
      4000,
    )
  })
})
