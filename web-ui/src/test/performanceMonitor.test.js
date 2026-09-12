import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('web-vitals', () => ({
  onCLS: vi.fn(),
  onINP: vi.fn(),
  onLCP: vi.fn(),
  onTTFB: vi.fn(),
  onFCP: vi.fn(),
}))

import { initPerformanceMonitoring, getMetrics, recordCustomMetric, resetMetrics } from '../utils/performanceMonitor'
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
    expect(metrics).toHaveProperty('customMetrics')
  })

  it('recordCustomMetric stores value with unit and timestamp', () => {
    recordCustomMetric('render_time', 16.5)
    const metrics = getMetrics()
    expect(metrics.customMetrics.render_time.value).toBe(16.5)
    expect(metrics.customMetrics.render_time.unit).toBe('ms')
    expect(metrics.customMetrics.render_time.timestamp).toBeGreaterThan(0)
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
