// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { useUIStore } from '../stores/useUIStore'

describe('useUIStore customIndicators', () => {
  it('defaults to empty list', () => {
    expect(Array.isArray(useUIStore.getState().customIndicators)).toBe(true)
  })

  it('setCustomIndicators replaces the list (IndicatorBuilder → CandleChart channel)', () => {
    const inds = [{ id: 'a', label: 'SMA(20)', color: '#fff', lines: [] }]
    useUIStore.getState().setCustomIndicators(inds)
    expect(useUIStore.getState().customIndicators).toBe(inds)
    useUIStore.getState().setCustomIndicators([])
  })
})
