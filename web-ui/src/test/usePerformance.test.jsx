/**
 * Tests for usePerformance hooks:
 * useDebouncedValue, useThrottledCallback, useBatchedUpdates,
 * useWorker, useIntersectionObserver
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useDebouncedValue,
  useThrottledCallback,
  useBatchedUpdates,
  useWorker,
  useIntersectionObserver,
} from '../hooks/usePerformance'

// ═══════════════════════════════════════════════════════════════════════════
// useDebouncedValue
// ═══════════════════════════════════════════════════════════════════════════
describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('hello', 300))
    expect(result.current).toBe('hello')
  })

  it('debounces value changes', () => {
    let value = 'a'
    const { result, rerender } = renderHook(() => useDebouncedValue(value, 300))
    expect(result.current).toBe('a')

    value = 'b'
    rerender()
    expect(result.current).toBe('a') // Not yet updated

    act(() => vi.advanceTimersByTime(300))
    expect(result.current).toBe('b')
  })

  it('resets timer on rapid changes', () => {
    let value = 'a'
    const { result, rerender } = renderHook(() => useDebouncedValue(value, 300))

    value = 'b'
    rerender()
    act(() => vi.advanceTimersByTime(200))

    value = 'c'
    rerender()
    act(() => vi.advanceTimersByTime(200))
    expect(result.current).toBe('a') // Still not updated (timer reset)

    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe('c')
  })

  it('uses default delay of 300ms', () => {
    let value = 'x'
    const { result, rerender } = renderHook(() => useDebouncedValue(value))
    value = 'y'
    rerender()
    act(() => vi.advanceTimersByTime(299))
    expect(result.current).toBe('x')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe('y')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// useThrottledCallback
// ═══════════════════════════════════════════════════════════════════════════
describe('useThrottledCallback', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('calls callback immediately on first invocation', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useThrottledCallback(cb, 100))
    act(() => result.current('test'))
    expect(cb).toHaveBeenCalledWith('test')
  })

  it('throttles subsequent calls within limit', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useThrottledCallback(cb, 100))
    act(() => result.current('a'))
    act(() => result.current('b'))
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith('a')
  })

  it('allows call after throttle period expires', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useThrottledCallback(cb, 100))
    act(() => result.current('a'))
    act(() => vi.advanceTimersByTime(100))
    act(() => result.current('b'))
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('schedules trailing call when throttled', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useThrottledCallback(cb, 100))
    act(() => result.current('a'))
    act(() => result.current('b'))
    expect(cb).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(100))
    expect(cb).toHaveBeenCalledTimes(2)
    expect(cb).toHaveBeenLastCalledWith('b')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// useBatchedUpdates
// ═══════════════════════════════════════════════════════════════════════════
describe('useBatchedUpdates', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => setTimeout(cb, 16)))
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id) => clearTimeout(id)))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('returns a push function', () => {
    const updater = vi.fn()
    const { result } = renderHook(() => useBatchedUpdates(updater))
    expect(typeof result.current).toBe('function')
  })

  it('flushes batch on next animation frame', () => {
    const updater = vi.fn()
    const { result } = renderHook(() => useBatchedUpdates(updater))

    act(() => {
      result.current('a')
      result.current('b')
    })
    expect(updater).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(16))
    expect(updater).toHaveBeenCalledWith(['a', 'b'])
  })

  it('flushes immediately when batch size is reached', () => {
    const updater = vi.fn()
    const { result } = renderHook(() => useBatchedUpdates(updater, 3))

    act(() => {
      result.current('a')
      result.current('b')
    })
    expect(updater).not.toHaveBeenCalled()

    act(() => result.current('c'))
    expect(updater).toHaveBeenCalledWith(['a', 'b', 'c'])
  })

  it('clears batch after flush', () => {
    const updater = vi.fn()
    const { result } = renderHook(() => useBatchedUpdates(updater, 2))

    act(() => {
      result.current('a')
      result.current('b')
    })
    expect(updater).toHaveBeenCalledTimes(1)

    act(() => vi.advanceTimersByTime(16))
    // Should not double-flush
    expect(updater).toHaveBeenCalledTimes(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// useWorker
// ═══════════════════════════════════════════════════════════════════════════
describe('useWorker', () => {
  let mockWorker

  beforeEach(() => {
    mockWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
    }
    class MockWorker {
      constructor() {
        return mockWorker
      }
    }
    vi.stubGlobal('Worker', MockWorker)
    // Mock URL constructor for jsdom — new URL(workerUrl, import.meta.url) fails otherwise
    class MockURL {
      constructor(url, base) {
        this.href = `${base || ''}${url}`
      }
    }
    vi.stubGlobal('URL', MockURL)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('returns worker, postMessage, and terminate', () => {
    const { result } = renderHook(() => useWorker('./test-worker.js'))
    expect(result.current.postMessage).toBeInstanceOf(Function)
    expect(result.current.terminate).toBeInstanceOf(Function)
  })

  it('postMessage forwards to worker', () => {
    const { result } = renderHook(() => useWorker('./test-worker.js'))
    act(() => result.current.postMessage({ type: 'test' }))
    expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'test' })
  })

  it('terminate calls worker.terminate', () => {
    const { result } = renderHook(() => useWorker('./test-worker.js'))
    act(() => result.current.terminate())
    expect(mockWorker.terminate).toHaveBeenCalled()
  })

  it('handles worker creation failure gracefully', () => {
    class FailingWorker {
      constructor() { throw new Error('fail') }
    }
    vi.stubGlobal('Worker', FailingWorker)
    const { result } = renderHook(() => useWorker('./bad-worker.js'))
    expect(() => act(() => result.current.postMessage('test'))).not.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// useIntersectionObserver
// ═══════════════════════════════════════════════════════════════════════════
describe('useIntersectionObserver', () => {
  let observerCallback
  let mockObserver

  beforeEach(() => {
    mockObserver = {
      observe: vi.fn(),
      disconnect: vi.fn(),
      unobserve: vi.fn(),
      takeRecords: vi.fn(() => []),
    }
    class MockIO {
      constructor(cb) {
        observerCallback = cb
        return mockObserver
      }
    }
    vi.stubGlobal('IntersectionObserver', MockIO)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('returns ref and isVisible=false initially', () => {
    const { result } = renderHook(() => useIntersectionObserver())
    expect(result.current[0]).toBeDefined()
    expect(result.current[1]).toBe(false)
  })

  it('sets isVisible to true when intersecting', () => {
    const div = document.createElement('div')
    const { result } = renderHook(() => useIntersectionObserver())
    // Use callback ref to set element
    act(() => result.current[0](div))

    act(() => observerCallback([{ isIntersecting: true }]))
    expect(result.current[1]).toBe(true)
  })

  it('disconnects observer on unmount', () => {
    const div = document.createElement('div')
    const { result, unmount } = renderHook(() => useIntersectionObserver())
    act(() => result.current[0](div))
    unmount()
    expect(mockObserver.disconnect).toHaveBeenCalled()
  })

  it('does not set visible when not intersecting', () => {
    const div = document.createElement('div')
    const { result } = renderHook(() => useIntersectionObserver())
    act(() => result.current[0](div))

    act(() => observerCallback([{ isIntersecting: false }]))
    expect(result.current[1]).toBe(false)
  })
})
