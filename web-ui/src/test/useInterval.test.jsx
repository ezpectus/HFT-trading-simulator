/**
 * Tests for useInterval hook
 * Tests: basic interval, pause with null delay, cleanup on unmount, callback updates
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInterval } from '../hooks/useInterval'

describe('useInterval', () => {
  let originalSetInterval
  let originalClearInterval
  let timers

  beforeEach(() => {
    originalSetInterval = global.setInterval
    originalClearInterval = global.clearInterval
    timers = []
    let nextId = 1
    global.setInterval = vi.fn((cb, delay) => {
      const id = nextId++
      timers.push({ id, cb, delay, callCount: 0 })
      return id
    })
    global.clearInterval = vi.fn((id) => {
      const idx = timers.findIndex(t => t.id === id)
      if (idx >= 0) timers.splice(idx, 1)
    })
  })

  afterEach(() => {
    global.setInterval = originalSetInterval
    global.clearInterval = originalClearInterval
    vi.restoreAllMocks()
  })

  function tickTimer(ms) {
    for (const t of timers) {
      t.elapsed = (t.elapsed || 0) + ms
      while (t.delay > 0 && t.elapsed >= t.delay) {
        t.cb()
        t.callCount++
        t.elapsed -= t.delay
      }
    }
  }

  it('calls callback on interval', () => {
    const callback = vi.fn()
    renderHook(() => useInterval(callback, 1000))

    act(() => { tickTimer(1000) })
    expect(callback).toHaveBeenCalledTimes(1)

    act(() => { tickTimer(1000) })
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('does not call callback when delay is null', () => {
    const callback = vi.fn()
    renderHook(() => useInterval(callback, null))

    act(() => { tickTimer(5000) })
    expect(callback).not.toHaveBeenCalled()
  })

  it('does not call callback when delay is undefined', () => {
    const callback = vi.fn()
    renderHook(() => useInterval(callback, undefined))

    act(() => { tickTimer(5000) })
    expect(callback).not.toHaveBeenCalled()
  })

  it('clears interval on unmount', () => {
    const callback = vi.fn()
    const { unmount } = renderHook(() => useInterval(callback, 1000))

    act(() => { tickTimer(1000) })
    expect(callback).toHaveBeenCalledTimes(1)

    unmount()

    act(() => { tickTimer(5000) })
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('uses latest callback without resetting interval', () => {
    let count = 0
    const { rerender } = renderHook(
      ({ cb }) => useInterval(cb, 1000),
      { initialProps: { cb: () => { count += 1 } } }
    )

    act(() => { tickTimer(1000) })
    expect(count).toBe(1)

    // Update callback
    const newCallback = vi.fn()
    rerender({ cb: newCallback })

    act(() => { tickTimer(1000) })
    expect(newCallback).toHaveBeenCalledTimes(1)
    expect(count).toBe(1)
  })

  it('resets interval when delay changes', () => {
    const callback = vi.fn()
    const { rerender } = renderHook(
      ({ delay }) => useInterval(callback, delay),
      { initialProps: { delay: 1000 } }
    )

    act(() => { tickTimer(500) })
    expect(callback).not.toHaveBeenCalled()

    // Change delay to 2000 — timer resets
    rerender({ delay: 2000 })

    act(() => { tickTimer(1500) })
    expect(callback).not.toHaveBeenCalled()

    act(() => { tickTimer(500) })
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('pauses when delay changes to null', () => {
    const callback = vi.fn()
    const { rerender } = renderHook(
      ({ delay }) => useInterval(callback, delay),
      { initialProps: { delay: 1000 } }
    )

    act(() => { tickTimer(1000) })
    expect(callback).toHaveBeenCalledTimes(1)

    rerender({ delay: null })

    act(() => { tickTimer(10000) })
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('resumes when delay changes from null to number', () => {
    const callback = vi.fn()
    const { rerender } = renderHook(
      ({ delay }) => useInterval(callback, delay),
      { initialProps: { delay: null } }
    )

    act(() => { tickTimer(5000) })
    expect(callback).not.toHaveBeenCalled()

    rerender({ delay: 1000 })

    act(() => { tickTimer(1000) })
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('works with state updates in callback (no stale closure)', () => {
    let result = 0
    const { rerender } = renderHook(
      ({ cb }) => useInterval(cb, 100),
      { initialProps: { cb: () => { result = 1 } } }
    )

    act(() => { tickTimer(100) })
    expect(result).toBe(1)

    // Update callback to use new value
    rerender({ cb: () => { result = 2 } })

    act(() => { tickTimer(100) })
    expect(result).toBe(2)
  })

  it('handles zero delay', () => {
    const callback = vi.fn()
    renderHook(() => useInterval(callback, 0))

    act(() => { tickTimer(0) })
    expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 0)
  })
})
