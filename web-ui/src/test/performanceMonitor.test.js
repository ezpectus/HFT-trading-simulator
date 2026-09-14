import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('web-vitals', () => ({
  onCLS: vi.fn(),
  onINP: vi.fn(),
  onLCP: vi.fn(),
  onTTFB: vi.fn(),
  onFCP: vi.fn(),
}))

import { initPerformanceMonitoring, getMetrics, onAlert, offAlert, resetMetrics } from '../utils/performanceMonitor'
import { onCLS, onINP, onLCP, onTTFB, onFCP } from 'web-vitals'

describe('performanceMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetMetrics()
  })

  it('getMetrics returns initial state', () => {
    const metrics = getMetrics()
    expect(metrics).toHaveProperty('LCP')
    expect(metrics).toHaveProperty('INP')
    expect(metrics).toHaveProperty('CLS')
    expect(metrics).toHaveProperty('TTFB')
    expect(metrics).toHaveProperty('FCP')
  })

  it('onAlert subscribers fire on over-budget vitals; offAlert removes them', () => {
    initPerformanceMonitoring()
    const lcpHandler = onLCP.mock.calls[0][0]
    const cb = vi.fn()
    onAlert(cb)
    lcpHandler({ value: 5000 })  // budget is 2500
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb.mock.calls[0][0]).toMatchObject({ name: 'LCP', value: 5000, budget: 2500, rating: 'poor' })
    offAlert(cb)
    lcpHandler({ value: 6000 })
    expect(cb).toHaveBeenCalledTimes(1)
    // under budget: no alert
    onAlert(cb)
    lcpHandler({ value: 1000 })
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('initPerformanceMonitoring registers web-vitals handlers', () => {
    initPerformanceMonitoring()
    expect(onCLS).toHaveBeenCalled()
    expect(onINP).toHaveBeenCalled()
    expect(onLCP).toHaveBeenCalled()
    expect(onTTFB).toHaveBeenCalled()
    expect(onFCP).toHaveBeenCalled()
  })
})
