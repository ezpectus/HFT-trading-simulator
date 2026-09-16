/**
 * Tests for useDetachablePanels hook
 * Tests: detachPanel, updateDetached, isDetached, closeDetached, PANEL_CONFIG
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDetachablePanels } from '../hooks/useDetachablePanels'
import { useToastStore } from '../stores/useToastStore'

// Mock popup window with proper DOM API
function createMockPopup() {
  const elements = []

  function createMockEl(tagName) {
    const el = {
      tagName: tagName.toUpperCase(),
      className: '',
      id: '',
      textContent: '',
      style: { cssText: '' },
      _children: [],
      _attrs: {},
      appendChild(child) { this._children.push(child); return child },
      removeChild(child) {
        const idx = this._children.indexOf(child)
        if (idx >= 0) this._children.splice(idx, 1)
        return child
      },
      addEventListener: vi.fn(),
      get firstChild() { return this._children[0] || null },
      setAttribute(k, v) { this._attrs[k] = v },
      getAttribute(k) { return this._attrs[k] },
    }
    elements.push(el)
    return el
  }

  const contentEl = createMockEl('div')
  contentEl.id = 'content'

  const headEl = createMockEl('head')
  const bodyEl = createMockEl('body')

  const docEl = {
    _contentEl: contentEl,
    _elements: elements,
    _head: headEl,
    _body: bodyEl,
    title: '',
    getElementById(id) {
      if (id === 'content') return contentEl
      return elements.find(e => e.id === id) || null
    },
    createElement(tag) { return createMockEl(tag) },
    head: headEl,
    body: bodyEl,
  }

  return {
    closed: false,
    document: docEl,
    close: vi.fn(function() { this.closed = true }),
  }
}

// Helper: get all text content from an element and its children
function getAllText(el) {
  let text = el.textContent || ''
  if (el._children) {
    for (const child of el._children) {
      text += ' ' + getAllText(child)
    }
  }
  return text
}

describe('useDetachablePanels', () => {
  let mockPopup
  let openSpy
  let alertSpy

  beforeEach(() => {
    mockPopup = createMockPopup()
    openSpy = vi.spyOn(window, 'open').mockReturnValue(mockPopup)
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns API with detachPanel, updateDetached, isDetached, closeDetached, PANEL_CONFIG', () => {
    const { result } = renderHook(() => useDetachablePanels())
    expect(typeof result.current.detachPanel).toBe('function')
    expect(typeof result.current.updateDetached).toBe('function')
    expect(typeof result.current.isDetached).toBe('function')
    expect(typeof result.current.closeDetached).toBe('function')
    expect(result.current.PANEL_CONFIG).toBeDefined()
  })

  it('PANEL_CONFIG covers only the wired panels (chart, orderbook)', () => {
    // account/signals/arbitrage/performance had renderers but no
    // <DetachablePanel> wrapper — unreachable, removed.
    const { result } = renderHook(() => useDetachablePanels())
    expect(result.current.PANEL_CONFIG.chart.title).toContain('Chart')
    expect(result.current.PANEL_CONFIG.orderbook.title).toContain('Order Book')
    expect(result.current.PANEL_CONFIG.account).toBeUndefined()
    expect(result.current.PANEL_CONFIG.signals).toBeUndefined()
    expect(result.current.PANEL_CONFIG.arbitrage).toBeUndefined()
    expect(result.current.PANEL_CONFIG.performance).toBeUndefined()
  })

  it('detachPanel opens a popup window', () => {
    const { result } = renderHook(() => useDetachablePanels())
    act(() => result.current.detachPanel('chart', { candles: [] }))
    expect(openSpy).toHaveBeenCalled()
  })

  it('detachPanel creates DOM elements in popup document', () => {
    const { result } = renderHook(() => useDetachablePanels())
    act(() => result.current.detachPanel('chart', { candles: [] }))
    expect(mockPopup.document.title).toContain('Chart')
    expect(mockPopup.document._head._children.length).toBeGreaterThan(0)
    expect(mockPopup.document._body._children.length).toBeGreaterThan(0)
  })

  it('detachPanel ignores unknown panel ID', () => {
    const { result } = renderHook(() => useDetachablePanels())
    act(() => result.current.detachPanel('unknown_panel', {}))
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('isDetached returns false initially', () => {
    const { result } = renderHook(() => useDetachablePanels())
    expect(result.current.isDetached('chart')).toBe(false)
  })

  it('isDetached returns true after detachPanel', () => {
    const { result } = renderHook(() => useDetachablePanels())
    act(() => result.current.detachPanel('chart', { candles: [] }))
    expect(result.current.isDetached('chart')).toBe(true)
  })

  it('closeDetached closes the popup', () => {
    const { result } = renderHook(() => useDetachablePanels())
    act(() => result.current.detachPanel('chart', { candles: [] }))
    expect(result.current.isDetached('chart')).toBe(true)
    act(() => result.current.closeDetached('chart'))
    expect(mockPopup.close).toHaveBeenCalled()
  })

  it('closeDetached on non-detached panel does not throw', () => {
    const { result } = renderHook(() => useDetachablePanels())
    expect(() => act(() => result.current.closeDetached('chart'))).not.toThrow()
  })

  it('detachPanel closes existing popup before opening new one', () => {
    const { result } = renderHook(() => useDetachablePanels())
    const firstPopup = mockPopup
    act(() => result.current.detachPanel('chart', { candles: [] }))

    // Setup second popup mock
    const secondPopup = createMockPopup()
    openSpy.mockReturnValue(secondPopup)

    act(() => result.current.detachPanel('chart', { candles: [] }))
    expect(firstPopup.close).toHaveBeenCalled()
  })

  it('detachPanel toasts (no blocking alert) when popup is blocked', () => {
    openSpy.mockReturnValue(null)
    const { result } = renderHook(() => useDetachablePanels())
    const toastsBefore = useToastStore.getState().toasts.length
    act(() => result.current.detachPanel('chart', {}))
    expect(alertSpy).not.toHaveBeenCalled()
    const toasts = useToastStore.getState().toasts
    expect(toasts.length).toBeGreaterThan(toastsBefore)
    expect(toasts[toasts.length - 1].message).toContain('Popup blocked')
  })

  it('updateDetached updates popup content for orderbook', () => {
    const { result } = renderHook(() => useDetachablePanels())
    act(() => result.current.detachPanel('orderbook', {
      orderbookData: {
        bids: [{ price: 50000, quantity: 1.5 }],
        asks: [{ price: 50100, quantity: 2.0 }],
      },
      currentPrice: 50050,
    }))
    const text = getAllText(mockPopup.document._contentEl)
    expect(text).toContain('50000')
    expect(text).toContain('50100')
  })

  it('non-wired panel ids open no popup (renderers removed in)', () => {
    const { result } = renderHook(() => useDetachablePanels())
    for (const id of ['account', 'signals', 'arbitrage', 'performance']) {
      act(() => result.current.detachPanel(id, {}))
    }
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('updateDetached updates popup content for chart with candles', () => {
    const { result } = renderHook(() => useDetachablePanels())
    act(() => result.current.detachPanel('chart', {
      symbol: 'BTC/USDT',
      exchange: 'binance',
      candles: [
        { open: 49000, high: 50500, low: 48500, close: 50000, volume: 100 },
        { open: 50000, high: 51200, low: 49900, close: 51000, volume: 150 },
      ],
    }))
    const text = getAllText(mockPopup.document._contentEl)
    expect(text).toContain('51000')
    expect(text).toContain('BTC/USDT')
  })

  it('updateDetached shows no data for orderbook without data', () => {
    const { result } = renderHook(() => useDetachablePanels())
    act(() => result.current.detachPanel('orderbook', {}))
    const text = getAllText(mockPopup.document._contentEl)
    expect(text).toContain('No data')
  })

  it('updateDetached shows no candles for chart without data', () => {
    const { result } = renderHook(() => useDetachablePanels())
    act(() => result.current.detachPanel('chart', { candles: [] }))
    const text = getAllText(mockPopup.document._contentEl)
    expect(text).toContain('No candles')
  })

  it('updateDetached does nothing for non-detached panel', () => {
    const { result } = renderHook(() => useDetachablePanels())
    // Should not throw when updating a panel that was never detached
    expect(() => act(() => result.current.updateDetached('chart', {}))).not.toThrow()
  })
})
