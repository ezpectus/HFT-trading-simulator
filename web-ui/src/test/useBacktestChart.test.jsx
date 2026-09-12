import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useBacktestChart } from '../hooks/useBacktestChart'

const addLineSeries = vi.fn(() => ({ setData: vi.fn() }))
vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addLineSeries,
    applyOptions: vi.fn(),
    remove: vi.fn(),
  })),
  ColorType: { Solid: 'solid' },
}))

describe('useBacktestChart', () => {
  it('returns a container ref to attach', () => {
    const { result } = renderHook(() => useBacktestChart(null))
    expect(result.current).toHaveProperty('current')
    expect(result.current.current).toBeNull()  // unattached in jsdom
  })

  it('does not crash on result updates', () => {
    const bt = { results: { trend: { equity_curve: [100, 110, 120] } } }
    const { rerender } = renderHook(({ r }) => useBacktestChart(r),
      { initialProps: { r: null } })
    rerender({ r: bt })
    rerender({ r: null })
  })
})
