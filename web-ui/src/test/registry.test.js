// @vitest-environment node
/**
 * Tests for panel registry — all 204 panels have required metadata.
 */
import { describe, it, expect } from 'vitest'
import { CATEGORIES, PANELS, DEFAULT_VISIBLE, getPanelsByCategory } from '../panels/registry'

describe('Registry Structure', () => {
  it('has at least 150 panels', () => {
    expect(PANELS.length).toBeGreaterThanOrEqual(150)
  })

  it('every panel has id, name, category, component, props', () => {
    for (const panel of PANELS) {
      expect(typeof panel.id).toBe('string')
      expect(panel.id.length).toBeGreaterThan(0)
      expect(typeof panel.name).toBe('string')
      expect(panel.name.length).toBeGreaterThan(0)
      expect(typeof panel.category).toBe('string')
      expect(panel.category.length).toBeGreaterThan(0)
      expect(panel.component).toBeDefined()
      expect(typeof panel.props).toBe('function')
    }
  })

  it('all panel ids are unique', () => {
    const ids = PANELS.map(p => p.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('all panel categories exist in CATEGORIES', () => {
    const catIds = new Set(CATEGORIES.map(c => c.id))
    for (const panel of PANELS) {
      expect(catIds.has(panel.category)).toBe(true)
    }
  })

  it('CATEGORIES have id, label, order', () => {
    for (const cat of CATEGORIES) {
      expect(typeof cat.id).toBe('string')
      expect(cat.id.length).toBeGreaterThan(0)
      expect(typeof cat.label).toBe('string')
      expect(cat.label.length).toBeGreaterThan(0)
      expect(typeof cat.order).toBe('number')
    }
  })

  it('DEFAULT_VISIBLE contains only valid panel ids', () => {
    const panelIds = new Set(PANELS.map(p => p.id))
    const visibleIds = new Set(DEFAULT_VISIBLE)
    for (const id of visibleIds) {
      expect(panelIds.has(id)).toBe(true)
    }
  })

  it('getPanelsByCategory returns correct panels', () => {
    for (const cat of CATEGORIES) {
      const panels = getPanelsByCategory(cat.id)
      for (const p of panels) {
        expect(p.category).toBe(cat.id)
      }
    }
  })

  it('every category has at least one panel', () => {
    for (const cat of CATEGORIES) {
      const panels = getPanelsByCategory(cat.id)
      expect(panels.length).toBeGreaterThan(0)
    }
  })

  it('panel components are lazy (have _payload property)', () => {
    // React.lazy components have a _payload property
    for (const panel of PANELS) {
      const cmp = panel.component
      // In React 18, lazy components are objects with $$typeof
      expect(cmp).toBeDefined()
      // Check it's not a plain function (class component) — it should be a lazy wrapper
      const isLazy = typeof cmp === 'object' && cmp !== null && '$$typeof' in cmp
      expect(isLazy).toBe(true)
    }
  })

  it('S130 contract: starved panels receive their backend props', () => {
    const ctx = {
      selectedSymbol: 'BTC/USDT',
      chartCandles: [{ time: 1, close: 100 }],
      setCustomIndicators: () => {},
      exchange: { accounts: {}, fills: [], connected: true },
      signals: { signals: [], connected: true, sendSignalMessage: () => {}, backtestResult: null },
    }
    const byId = Object.fromEntries(PANELS.map(p => [p.id, p]))

    const runner = byId['backtest-runner'].props(ctx)
    expect(runner.sendSignalMessage).toBe(ctx.signals.sendSignalMessage)
    expect(runner.backtestResult).toBeNull()
    expect(runner.connected).toBe(true)

    const perf = byId['perf-dashboard'].props(ctx)
    expect(perf.fills).toBe(ctx.exchange.fills)
    expect(perf.signals).toBe(ctx.signals.signals)

    const builder = byId['indicator-builder'].props(ctx)
    expect(builder.onIndicatorsChange).toBe(ctx.setCustomIndicators)
  })
})
