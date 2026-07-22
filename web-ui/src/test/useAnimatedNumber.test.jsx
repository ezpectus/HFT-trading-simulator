/**
 * Tests for useAnimatedNumber hook
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAnimatedNumber } from '../hooks/useAnimatedNumber'

describe('useAnimatedNumber', () => {
  let rafCallbacks
  let rafIdCounter
  let origRAF, origCAF

  beforeEach(() => {
    rafCallbacks = []
    rafIdCounter = 0

    // Store originals before mocking
    origRAF = global.requestAnimationFrame
    origCAF = global.cancelAnimationFrame

    // Mock requestAnimationFrame to capture callbacks
    global.requestAnimationFrame = vi.fn((cb) => {
      const id = ++rafIdCounter
      rafCallbacks.push({ id, cb })
      return id
    })
    global.cancelAnimationFrame = vi.fn((id) => {
      rafCallbacks = rafCallbacks.filter(c => c.id !== id)
    })

    // Mock performance.now to advance manually
    let now = 0
    global.performance.now = () => now
    global.performance.__advance = (ms) => { now += ms }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // Restore originals
    global.requestAnimationFrame = origRAF
    global.cancelAnimationFrame = origCAF
  })

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useAnimatedNumber(100))
    expect(result.current).toBe(100)
  })

  it('returns initial value for negative number', () => {
    const { result } = renderHook(() => useAnimatedNumber(-50.5))
    expect(result.current).toBe(-50.5)
  })

  it('returns initial value for zero', () => {
    const { result } = renderHook(() => useAnimatedNumber(0))
    expect(result.current).toBe(0)
  })

  it('does not animate when value stays the same', () => {
    const { result, rerender } = renderHook(({ val }) => useAnimatedNumber(val), {
      initialProps: { val: 100 },
    })
    rerender({ val: 100 })
    expect(result.current).toBe(100)
    expect(global.requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('starts animation when value changes', () => {
    const { rerender } = renderHook(({ val }) => useAnimatedNumber(val), {
      initialProps: { val: 100 },
    })
    rerender({ val: 200 })
    // requestAnimationFrame should have been called
    expect(global.requestAnimationFrame).toHaveBeenCalled()
  })

  it('animates towards target value over time', () => {
    const { result, rerender } = renderHook(({ val }) => useAnimatedNumber(val, 300), {
      initialProps: { val: 0 },
    })

    rerender({ val: 100 })

    // First frame: elapsed=0, progress=0, eased=0, current=0
    expect(rafCallbacks.length).toBeGreaterThan(0)
    act(() => {
      global.performance.__advance(0)
      rafCallbacks[0].cb(performance.now())
    })
    // Value should be between 0 and 100 (start of animation)
    expect(result.current).toBeGreaterThanOrEqual(0)
    expect(result.current).toBeLessThanOrEqual(100)

    // Advance to midpoint: elapsed=150, progress=0.5, eased=1-(0.5)^3=0.875
    act(() => {
      global.performance.__advance(150)
      rafCallbacks[rafCallbacks.length - 1].cb(performance.now())
    })
    expect(result.current).toBeGreaterThan(0)
    expect(result.current).toBeLessThan(100)

    // Advance past duration: elapsed=300+, progress=1, value=100
    act(() => {
      global.performance.__advance(200)
      rafCallbacks[rafCallbacks.length - 1].cb(performance.now())
    })
    expect(result.current).toBe(100)
  })

  it('reaches exact target value at end of animation', () => {
    const { result, rerender } = renderHook(({ val }) => useAnimatedNumber(val, 100), {
      initialProps: { val: 50 },
    })

    rerender({ val: 75 })

    // Advance well past duration
    act(() => {
      global.performance.__advance(200)
      rafCallbacks[0].cb(performance.now())
    })

    expect(result.current).toBe(75)
  })

  it('handles decreasing values', () => {
    const { result, rerender } = renderHook(({ val }) => useAnimatedNumber(val, 100), {
      initialProps: { val: 100 },
    })

    rerender({ val: 50 })

    expect(rafCallbacks.length).toBeGreaterThan(0)
    act(() => {
      global.performance.__advance(50)
      rafCallbacks[0].cb(performance.now())
    })
    // Should be between 50 and 100 (moving down)
    expect(result.current).toBeGreaterThan(50)
    expect(result.current).toBeLessThan(100)

    // Complete animation
    act(() => {
      global.performance.__advance(100)
      rafCallbacks[rafCallbacks.length - 1].cb(performance.now())
    })
    expect(result.current).toBe(50)
  })

  it('handles negative value transitions', () => {
    const { result, rerender } = renderHook(({ val }) => useAnimatedNumber(val, 100), {
      initialProps: { val: 100 },
    })

    rerender({ val: -100 })

    act(() => {
      global.performance.__advance(200)
      rafCallbacks[0].cb(performance.now())
    })
    expect(result.current).toBe(-100)
  })

  it('uses custom duration', () => {
    const { result, rerender } = renderHook(({ val, dur }) => useAnimatedNumber(val, dur), {
      initialProps: { val: 0, dur: 1000 },
    })

    rerender({ val: 100, dur: 1000 })

    // At 500ms with 1000ms duration: progress=0.5, eased=0.875
    act(() => {
      global.performance.__advance(500)
      rafCallbacks[0].cb(performance.now())
    })
    // Should be at ~87.5, not at 100
    expect(result.current).toBeLessThan(95)
    expect(result.current).toBeGreaterThan(80)
  })

  it('cancels animation frame on cleanup', () => {
    const { unmount, rerender } = renderHook(({ val }) => useAnimatedNumber(val), {
      initialProps: { val: 0 },
    })

    rerender({ val: 100 })
    expect(global.requestAnimationFrame).toHaveBeenCalled()

    // Unmount should cancel the animation frame
    unmount()
    expect(global.cancelAnimationFrame).toHaveBeenCalled()
  })

  it('handles rapid value changes', () => {
    const { result, rerender } = renderHook(({ val }) => useAnimatedNumber(val, 100), {
      initialProps: { val: 0 },
    })

    // Rapid changes
    rerender({ val: 50 })
    rerender({ val: 100 })
    rerender({ val: 200 })

    // Complete animation
    act(() => {
      global.performance.__advance(200)
      rafCallbacks[rafCallbacks.length - 1].cb(performance.now())
    })
    // Should eventually reach the latest target
    expect(result.current).toBe(200)
  })
})
