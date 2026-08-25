import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('web-vitals', () => ({
  onCLS: vi.fn(),
  onFID: vi.fn(),
  onLCP: vi.fn(),
  onTTFB: vi.fn(),
  onFCP: vi.fn(),
}))

import { initPerformanceMonitor, getMetrics, recordCustomMetric } from '../utils/performanceMonitor'
import { onCLS, onFID, onLCP, onTTFB, onFCP } from 'web-vitals'

describe('performanceMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getMetrics returns initial state', () => {
    const metrics = getMetrics()
    expect(metrics).toHaveProperty('LCP')
    expect(metrics).toHaveProperty('FID')
    expect(metrics).toHaveProperty('CLS')
    expect(metrics).toHaveProperty('TTFB')
    expect(metrics).toHaveProperty('FCP')
    expect(metrics).toHaveProperty('customMetrics')
  })

  it('recordCustomMetric stores value', () => {
    recordCustomMetric('render_time', 16.5)
    const metrics = getMetrics()
    expect(metrics.customMetrics.render_time).toBe(16.5)
  })

  it('initPerformanceMonitor calls web-vitals handlers', () => {
    initPerformanceMonitor()
    expect(onCLS).toHaveBeenCalled()
    expect(onFID).toHaveBeenCalled()
    expect(onLCP).toHaveBeenCalled()
    expect(onTTFB).toHaveBeenCalled()
    expect(onFCP).toHaveBeenCalled()
  })
})
