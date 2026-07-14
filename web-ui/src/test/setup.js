import '@testing-library/jest-dom/vitest'

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
