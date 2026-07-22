/**
 * Tests for useMediaQuery hook
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMediaQuery, useIsMobile, useIsTablet } from '../hooks/useMediaQuery'

describe('useMediaQuery', () => {
  let matchMediaMock

  beforeEach(() => {
    matchMediaMock = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns false when query does not match', () => {
    matchMediaMock.mockReturnValue({
      matches: false,
      media: '(max-width: 768px)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'))
    expect(result.current).toBe(false)
  })

  it('returns true when query matches', () => {
    matchMediaMock.mockReturnValue({
      matches: true,
      media: '(max-width: 768px)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'))
    expect(result.current).toBe(true)
  })

  it('calls matchMedia with the provided query', () => {
    renderHook(() => useMediaQuery('(min-width: 1024px)'))
    expect(matchMediaMock).toHaveBeenCalledWith('(min-width: 1024px)')
  })

  it('adds event listener for change events', () => {
    const addEventListener = vi.fn()
    matchMediaMock.mockReturnValue({
      matches: false,
      media: '(max-width: 768px)',
      addEventListener,
      removeEventListener: vi.fn(),
    })
    renderHook(() => useMediaQuery('(max-width: 768px)'))
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('removes event listener on unmount', () => {
    const removeEventListener = vi.fn()
    matchMediaMock.mockReturnValue({
      matches: false,
      media: '(max-width: 768px)',
      addEventListener: vi.fn(),
      removeEventListener,
    })
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 768px)'))
    unmount()
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('updates matches when media query change event fires', () => {
    let handler
    matchMediaMock.mockReturnValue({
      matches: false,
      media: '(max-width: 768px)',
      addEventListener: vi.fn((event, cb) => { handler = cb }),
      removeEventListener: vi.fn(),
    })
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'))
    expect(result.current).toBe(false)

    // Simulate media query change
    act(() => handler({ matches: true }))
    expect(result.current).toBe(true)
  })

  it('handles query changes by re-subscribing', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    matchMediaMock.mockReturnValue({
      matches: false,
      media: '',
      addEventListener,
      removeEventListener,
    })
    const { rerender } = renderHook(({ q }) => useMediaQuery(q), {
      initialProps: { q: '(max-width: 768px)' },
    })
    expect(addEventListener).toHaveBeenCalledTimes(1)

    rerender({ q: '(max-width: 1024px)' })
    // Should remove old listener and add new one
    expect(removeEventListener).toHaveBeenCalled()
    expect(addEventListener).toHaveBeenCalledTimes(2)
  })
})

describe('useIsMobile', () => {
  it('uses max-width: 768px query', () => {
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '(max-width: 768px)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    renderHook(() => useIsMobile())
    expect(matchMediaSpy).toHaveBeenCalledWith('(max-width: 768px)')
    matchMediaSpy.mockRestore()
  })
})

describe('useIsTablet', () => {
  it('uses max-width: 1024px query', () => {
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '(max-width: 1024px)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    renderHook(() => useIsTablet())
    expect(matchMediaSpy).toHaveBeenCalledWith('(max-width: 1024px)')
    matchMediaSpy.mockRestore()
  })
})
