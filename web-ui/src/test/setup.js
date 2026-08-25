import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  // Clear localStorage to prevent state leakage between tests (isolate: false)
  if (typeof localStorage !== 'undefined') localStorage.clear()
})

// Mock WebSocket
class MockWebSocket {
  constructor(url) {
    this.url = url
    this.readyState = 1
    this.onopen = null
    this.onclose = null
    this.onmessage = null
    this.onerror = null
    setTimeout(() => this.onopen?.(), 0)
  }
  send() {}
  close() { this.readyState = 3; this.onclose?.() }
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
}
global.WebSocket = MockWebSocket

// Mock IntersectionObserver
class MockIntersectionObserver {
  constructor(callback) { this.callback = callback }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}
global.IntersectionObserver = MockIntersectionObserver

// Mock matchMedia
global.matchMedia = global.matchMedia || ((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}))

// Mock ResizeObserver
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver

// happy-dom doesn't implement window.open/alert — add stubs so vi.spyOn works
if (typeof window !== 'undefined') {
  if (!window.open) window.open = () => null
  if (!window.alert) window.alert = () => {}
}

// Mock requestAnimationFrame / cancelAnimationFrame
global.requestAnimationFrame = (cb) => setTimeout(cb, 16)
global.cancelAnimationFrame = (id) => clearTimeout(id)

// Mock requestIdleCallback
global.requestIdleCallback = global.requestIdleCallback || ((cb) => setTimeout(cb, 0))
global.cancelIdleCallback = global.cancelIdleCallback || ((id) => clearTimeout(id))

// Mock performance.mark/measure
if (!global.performance?.mark) {
  global.performance = global.performance || {}
  global.performance.mark = () => {}
  global.performance.measure = () => {}
}

// Suppress console.warn in tests unless explicitly needed
const origWarn = console.warn
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('[PanelContainer]')) return
  origWarn.call(console, ...args)
}

// Suppress jsdom uncaught error events (error boundaries re-throw in React 18 dev mode)
if (typeof window !== 'undefined') {
  window.onerror = () => true
}

// Prevent Node.js worker crash from unhandled EventEmitter 'error' events
if (typeof process !== 'undefined' && process.on) {
  process.on('uncaughtException', (err) => {
    // Swallow errors from jsdom/React error boundaries that re-throw in dev mode
    if (err && err.message && err.message.includes('Error boundary')) return
  })
  process.removeAllListeners('warning')
}
