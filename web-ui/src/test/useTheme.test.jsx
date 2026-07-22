/**
 * Tests for useTheme hook
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from '../hooks/useTheme'

describe('useTheme', () => {
  beforeEach(() => {
    document.documentElement.className = ''
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns dark theme by default', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
  })

  it('applies dark class to document root', () => {
    renderHook(() => useTheme())
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('toggleTheme switches from dark to light', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')

    act(() => {
      result.current.toggleTheme()
    })

    expect(result.current.theme).toBe('light')
  })

  it('applies light class after toggle', () => {
    const { result } = renderHook(() => useTheme())

    act(() => {
      result.current.toggleTheme()
    })

    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('toggleTheme switches back from light to dark', () => {
    const { result } = renderHook(() => useTheme())

    act(() => {
      result.current.toggleTheme()
    })
    expect(result.current.theme).toBe('light')

    act(() => {
      result.current.toggleTheme()
    })
    expect(result.current.theme).toBe('dark')
  })

  it('removes previous theme class when switching', () => {
    const { result } = renderHook(() => useTheme())

    expect(document.documentElement.classList.contains('dark')).toBe(true)

    act(() => {
      result.current.toggleTheme()
    })
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.classList.contains('light')).toBe(true)

    act(() => {
      result.current.toggleTheme()
    })
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  it('persists theme choice to localStorage', () => {
    const { result } = renderHook(() => useTheme())

    act(() => {
      result.current.toggleTheme()
    })

    expect(localStorage.getItem('trading-sim-theme')).toBe(JSON.stringify('light'))
  })

  it('restores theme from localStorage on init', () => {
    localStorage.setItem('trading-sim-theme', JSON.stringify('light'))

    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
  })
})
