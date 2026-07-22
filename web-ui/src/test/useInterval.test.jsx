/**
 * Tests for useInterval hook
 * Tests: basic interval, pause with null delay, cleanup on unmount, callback updates
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInterval } from '../hooks/useInterval'

describe('useInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('calls callback on interval', () => {
    const callback = vi.fn()
    renderHook(() => useInterval(callback, 1000))

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(callback).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('does not call callback when delay is null', () => {
    const callback = vi.fn()
    renderHook(() => useInterval(callback, null))

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(callback).not.toHaveBeenCalled()
  })

  it('does not call callback when delay is undefined', () => {
    const callback = vi.fn()
    renderHook(() => useInterval(callback, undefined))

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(callback).not.toHaveBeenCalled()
  })

  it('clears interval on unmount', () => {
    const callback = vi.fn()
    const { unmount } = renderHook(() => useInterval(callback, 1000))

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(callback).toHaveBeenCalledTimes(1)

    unmount()

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(callback).toHaveBeenCalledTimes(1) // No more calls after unmount
  })

  it('uses latest callback without resetting interval', () => {
    let count = 0
    const { rerender } = renderHook(
      ({ cb }) => useInterval(cb, 1000),
      { initialProps: { cb: () => { count += 1 } } }
    )

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(count).toBe(1)

    // Update callback
    const newCallback = vi.fn()
    rerender({ cb: newCallback })

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(newCallback).toHaveBeenCalledTimes(1)
    expect(count).toBe(1) // Old callback not called anymore
  })

  it('resets interval when delay changes', () => {
    const callback = vi.fn()
    const { rerender } = renderHook(
      ({ delay }) => useInterval(callback, delay),
      { initialProps: { delay: 1000 } }
    )

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(callback).not.toHaveBeenCalled()

    // Change delay to 2000 — timer resets
    rerender({ delay: 2000 })

    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(callback).not.toHaveBeenCalled() // Not yet (only 1500ms of 2000ms)

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(callback).toHaveBeenCalledTimes(1) // Now 2000ms elapsed
  })

  it('pauses when delay changes to null', () => {
    const callback = vi.fn()
    const { rerender } = renderHook(
      ({ delay }) => useInterval(callback, delay),
      { initialProps: { delay: 1000 } }
    )

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(callback).toHaveBeenCalledTimes(1)

    rerender({ delay: null })

    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(callback).toHaveBeenCalledTimes(1) // No more calls
  })

  it('resumes when delay changes from null to number', () => {
    const callback = vi.fn()
    const { rerender } = renderHook(
      ({ delay }) => useInterval(callback, delay),
      { initialProps: { delay: null } }
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(callback).not.toHaveBeenCalled()

    rerender({ delay: 1000 })

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('works with state updates in callback (no stale closure)', () => {
    let result = 0
    const { rerender } = renderHook(
      ({ cb }) => useInterval(cb, 100),
      { initialProps: { cb: () => { result = 1 } } }
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result).toBe(1)

    // Update callback to use new value
    rerender({ cb: () => { result = 2 } })

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result).toBe(2)
  })

  it('handles zero delay', () => {
    const callback = vi.fn()
    renderHook(() => useInterval(callback, 0))

    act(() => {
      vi.advanceTimersByTime(0)
    })
    // setInterval with 0 still fires on next tick
    expect(callback).toHaveBeenCalled()
  })
})
