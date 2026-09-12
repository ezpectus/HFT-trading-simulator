// Performance Monitor - Web Vitals integration for real-time performance monitoring
//
// Measures Core Web Vitals (LCP, INP, CLS) and custom performance metrics
// Provides performance budget enforcement and alerting on degradation

import { onCLS, onINP, onLCP, onTTFB, onFCP } from 'web-vitals'

const IS_DEV = import.meta.env?.DEV ?? false

// Performance budgets
const PERFORMANCE_BUDGETS = {
  LCP: 2500, // Largest Contentful Paint: 2.5s
  INP: 200, // Interaction to Next Paint: 200ms (FID successor, web-vitals v4+)
  CLS: 0.1, // Cumulative Layout Shift: 0.1
  TTFB: 800, // Time to First Byte: 800ms
  FCP: 1800, // First Contentful Paint: 1.8s
}

// Performance metrics storage
let metrics = {
  LCP: null,
  INP: null,
  CLS: null,
  TTFB: null,
  FCP: null,
  customMetrics: {},
}

// Performance history for trend analysis
const metricsHistory = {
  LCP: [],
  INP: [],
  CLS: [],
  TTFB: [],
  FCP: [],
}

// Alert callbacks
let alertCallbacks = []

/**
 * Format metric value for display
 */
function formatMetric(name, value) {
  switch (name) {
    case 'LCP':
    case 'FCP':
    case 'TTFB':
      return `${value.toFixed(0)}ms`
    case 'INP':
      return `${value.toFixed(0)}ms`
    case 'CLS':
      return value.toFixed(3)
    default:
      return value.toString()
  }
}

/**
 * Check if metric exceeds budget
 */
function exceedsBudget(name, value) {
  const budget = PERFORMANCE_BUDGETS[name]
  if (budget === undefined) return false
  return value > budget
}

/**
 * Get performance rating (good, needs-improvement, poor)
 */
function getRating(name, value) {
  const thresholds = {
    LCP: { good: 2500, poor: 4000 },
    INP: { good: 200, poor: 500 },
    CLS: { good: 0.1, poor: 0.25 },
    TTFB: { good: 800, poor: 1800 },
    FCP: { good: 1800, poor: 3000 },
  }

  const threshold = thresholds[name]
  if (!threshold) return 'unknown'

  if (value <= threshold.good) return 'good'
  if (value <= threshold.poor) return 'needs-improvement'
  return 'poor'
}

/**
 * Record a custom performance metric
 */
export function recordCustomMetric(name, value, unit = 'ms') {
  metrics.customMetrics[name] = { value, unit, timestamp: Date.now() }
  
  // Check if custom metric has a budget
  const budget = PERFORMANCE_BUDGETS[name]
  if (budget && value > budget) {
    triggerAlert(name, value, budget)
  }
}

/**
 * Get all current metrics
 */
export function getMetrics() {
  return { ...metrics }
}

/**
 * Get metrics history
 */
export function getMetricsHistory() {
  return { ...metricsHistory }
}

/**
 * Get performance budgets
 */
export function getPerformanceBudgets() {
  return { ...PERFORMANCE_BUDGETS }
}

/**
 * Check if all budgets are met
 */
export function checkBudgets() {
  const violations = []
  
  for (const [name, value] of Object.entries(metrics)) {
    if (value === null) continue
    if (name === 'customMetrics') continue
    
    if (exceedsBudget(name, value)) {
      violations.push({
        name,
        value,
        budget: PERFORMANCE_BUDGETS[name],
        rating: getRating(name, value),
      })
    }
  }
  
  return violations
}

/**
 * Register an alert callback
 */
export function onAlert(callback) {
  alertCallbacks.push(callback)
}

/**
 * Remove an alert callback — call on unmount to prevent leak
 */
export function offAlert(callback) {
  alertCallbacks = alertCallbacks.filter(cb => cb !== callback)
}

/**
 * Trigger an alert
 */
function triggerAlert(name, value, budget) {
  const alert = {
    name,
    value,
    budget,
    rating: getRating(name, value),
    timestamp: Date.now(),
  }
  
  alertCallbacks.forEach(callback => callback(alert))
}

/**
 * Initialize performance monitoring
 */
export function initPerformanceMonitoring() {
  // LCP - Largest Contentful Paint
  onLCP((metric) => {
    metrics.LCP = metric.value
    metricsHistory.LCP.push({ value: metric.value, timestamp: Date.now() })
    
    if (exceedsBudget('LCP', metric.value)) {
      triggerAlert('LCP', metric.value, PERFORMANCE_BUDGETS.LCP)
    }
    
    // eslint-disable-next-line no-console -- dev-only, gated by IS_DEV
    if (IS_DEV) console.log(`[Performance] LCP: ${formatMetric('LCP', metric.value)} (${getRating('LCP', metric.value)})`)
  })

  // INP - First Input Delay
  onINP((metric) => {
    metrics.INP = metric.value
    metricsHistory.INP.push({ value: metric.value, timestamp: Date.now() })
    
    if (exceedsBudget('INP', metric.value)) {
      triggerAlert('INP', metric.value, PERFORMANCE_BUDGETS.INP)
    }
    
    // eslint-disable-next-line no-console -- dev-only, gated by IS_DEV
    if (IS_DEV) console.log(`[Performance] INP: ${formatMetric('INP', metric.value)} (${getRating('INP', metric.value)})`)
  })

  // CLS - Cumulative Layout Shift
  onCLS((metric) => {
    metrics.CLS = metric.value
    metricsHistory.CLS.push({ value: metric.value, timestamp: Date.now() })
    
    if (exceedsBudget('CLS', metric.value)) {
      triggerAlert('CLS', metric.value, PERFORMANCE_BUDGETS.CLS)
    }
    
    // eslint-disable-next-line no-console -- dev-only, gated by IS_DEV
    if (IS_DEV) console.log(`[Performance] CLS: ${formatMetric('CLS', metric.value)} (${getRating('CLS', metric.value)})`)
  })

  // TTFB - Time to First Byte
  onTTFB((metric) => {
    metrics.TTFB = metric.value
    metricsHistory.TTFB.push({ value: metric.value, timestamp: Date.now() })
    
    if (exceedsBudget('TTFB', metric.value)) {
      triggerAlert('TTFB', metric.value, PERFORMANCE_BUDGETS.TTFB)
    }
    
    // eslint-disable-next-line no-console -- dev-only, gated by IS_DEV
    if (IS_DEV) console.log(`[Performance] TTFB: ${formatMetric('TTFB', metric.value)} (${getRating('TTFB', metric.value)})`)
  })

  // FCP - First Contentful Paint
  onFCP((metric) => {
    metrics.FCP = metric.value
    metricsHistory.FCP.push({ value: metric.value, timestamp: Date.now() })
    
    if (exceedsBudget('FCP', metric.value)) {
      triggerAlert('FCP', metric.value, PERFORMANCE_BUDGETS.FCP)
    }
    
    // eslint-disable-next-line no-console -- dev-only, gated by IS_DEV
    if (IS_DEV) console.log(`[Performance] FCP: ${formatMetric('FCP', metric.value)} (${getRating('FCP', metric.value)})`)
  })

  // eslint-disable-next-line no-console -- dev-only, gated by IS_DEV
  if (IS_DEV) console.log('[Performance] Monitoring initialized')
}

// ---------------------------------------------------------------------------
// Per-panel render metrics — populated by <Profiler> wrappers in PanelContainer
// ---------------------------------------------------------------------------

const panelMetrics = new Map()
const MAX_RENDER_SAMPLES = 50

/**
 * React Profiler onRender callback — record a render for panel `id`.
 * Called with (id, phase, actualDuration, baseDuration).
 */
export function recordPanelRender(id, _phase, actualDuration, baseDuration) {
  let m = panelMetrics.get(id)
  if (!m) {
    m = { renders: 0, totalActual: 0, maxActual: 0, mountTime: null, lastBase: 0, history: [] }
    panelMetrics.set(id, m)
  }
  m.renders += 1
  m.totalActual += actualDuration
  m.maxActual = Math.max(m.maxActual, actualDuration)
  if (m.mountTime === null) m.mountTime = actualDuration // first commit = mount
  m.lastBase = baseDuration
  m.history.push(actualDuration)
  if (m.history.length > MAX_RENDER_SAMPLES) m.history.shift()
}

/** Snapshot of per-panel render stats. */
export function getPanelMetrics() {
  const out = []
  for (const [id, m] of panelMetrics) {
    out.push({
      id,
      renders: m.renders,
      avgRender: m.renders > 0 ? m.totalActual / m.renders : 0,
      maxRender: m.maxActual,
      mountTime: m.mountTime ?? 0,
      baseTime: m.lastBase,
    })
  }
  return out.sort((a, b) => b.avgRender - a.avgRender)
}

/** Reset panel metrics (tests). */
export function resetPanelMetrics() {
  panelMetrics.clear()
}

/**
 * Get performance summary
 */
export function getPerformanceSummary() {
  const summary = {
    overall: 'good',
    metrics: {},
    violations: checkBudgets(),
  }

  for (const [name, value] of Object.entries(metrics)) {
    if (value === null) continue
    if (name === 'customMetrics') continue
    
    summary.metrics[name] = {
      value,
      formatted: formatMetric(name, value),
      rating: getRating(name, value),
      budget: PERFORMANCE_BUDGETS[name],
      withinBudget: !exceedsBudget(name, value),
    }

    if (getRating(name, value) === 'poor') {
      summary.overall = 'poor'
    } else if (getRating(name, value) === 'needs-improvement' && summary.overall !== 'poor') {
      summary.overall = 'needs-improvement'
    }
  }

  return summary
}

/**
 * Reset metrics (for testing)
 */
export function resetMetrics() {
  metrics = {
    LCP: null,
    INP: null,
    CLS: null,
    TTFB: null,
    FCP: null,
    customMetrics: {},
  }
  
  for (const key of Object.keys(metricsHistory)) {
    metricsHistory[key] = []
  }

  alertCallbacks = []
}
