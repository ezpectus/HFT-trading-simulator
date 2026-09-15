import { describe, it, expect, vi } from 'vitest'
import { Suspense } from 'react'
import { render, waitFor, fireEvent } from '@testing-library/react'
import { PANELS } from '../panels/registry'
import {
  generateInitialSnapshot, generateFill, generateSignal,
  MOCK_EXCHANGES, MOCK_SYMBOLS,
} from '../utils/mockData'

/**
 * Mount-every-panel sweep. The e2e suite only exercises the default
 * dashboard — the ~270 lazy registry panels were never mounted in tests,
 * which is exactly where S365/S366-class defects hid (NaN SVG, render-phase
 * setState, orphaned chains). Each panel gets its own test so a crash is
 * attributed by panel id.
 */

const EX = 'binance'
const SYM = 'BTCUSDT'

const snapshot = generateInitialSnapshot()

const chartCandles = snapshot.candles
  .filter(c => c.exchange === EX && c.symbol === SYM)
  .map(c => ({ time: c.timestamp, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }))

const prices = {}
for (const ex of MOCK_EXCHANGES) {
  prices[ex] = {}
  for (const s of MOCK_SYMBOLS) prices[ex][s] = snapshot.prices[`${ex}|${s}`] || 100
}

const fills = Array.from({ length: 15 }, (_, i) => {
  const f = generateFill(MOCK_SYMBOLS[i % MOCK_SYMBOLS.length], EX, 65000)
  f.timestamp = snapshot.timestamp - i * 120
  f.received_at = Date.now() - i * 120000
  return f
})

const signals = Array.from({ length: 12 }, (_, i) =>
  generateSignal(MOCK_SYMBOLS[i % MOCK_SYMBOLS.length], EX, 65000)
)

const ctx = {
  SYMBOLS: MOCK_SYMBOLS,
  EXCHANGES: MOCK_EXCHANGES,
  selectedExchange: EX,
  selectedSymbol: SYM,
  currentPrice: 65000,
  priceChange: 1.5,
  chartCandles,
  toasts: [],
  addToast: vi.fn(),
  removeToast: vi.fn(),
  clearAll: vi.fn(),
  setSelectedSymbol: vi.fn(),
  setCustomIndicators: vi.fn(),
  exchange: {
    candles: snapshot.candles,
    prices,
    accounts: snapshot.accounts,
    orderbooks: snapshot.orderbooks,
    fills,
    fundingRates: {},
    arbitrage: { opportunities: [] },
    auditLogs: [],
    optionsChain: null,
    candlesToFunding: 8,
    newsEvent: null,
    weekendMode: false,
    replayPaused: true,
    tradingActive: true,
    connected: true,
    submitOrder: vi.fn(() => true),
    requestOptionsChain: vi.fn(),
    sendConfigUpdate: vi.fn(),
    toggleReplay: vi.fn(),
    scrubReplay: vi.fn(),
  },
  signals: {
    signals,
    regime: { regime: 'trending', confidence: 72 },
    backtestResult: null,
    circuitBreaker: null,
    portfolioResult: null,
    volSurfaceResult: null,
    cvarResult: null,
    stressTestResult: null,
    positionSizeResult: null,
    hawkesResult: null,
    fundingArbResult: null,
    authState: 'disabled',
    connected: true,
    sendSignalMessage: vi.fn(() => true),
    latency: 0,
    connect: vi.fn(),
    nextReconnectIn: null,
  },
}

// Second-tick context: in production every store slice re-identities each
// message and panels feed chart libs (setData/update) on the UPDATE path —
// exactly where unsorted/duplicate-time defects live. Append one candle to
// every series plus a fresh fill and signal so every memo/effect re-runs.
const lastBySeries = new Map()
for (const c of snapshot.candles) {
  const k = `${c.exchange}|${c.symbol}`
  const prev = lastBySeries.get(k)
  if (!prev || c.timestamp > prev.timestamp) lastBySeries.set(k, c)
}
const nextCandles = [...snapshot.candles]
for (const last of lastBySeries.values()) {
  const close = last.close * 1.0005
  nextCandles.push({
    exchange: last.exchange, symbol: last.symbol,
    timestamp: last.timestamp + 60,
    open: last.close, high: close * 1.001, low: last.close * 0.999,
    close, volume: last.volume,
  })
}
const ctxTick = {
  ...ctx,
  chartCandles: nextCandles
    .filter(c => c.exchange === EX && c.symbol === SYM)
    .map(c => ({ time: c.timestamp, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })),
  exchange: {
    ...ctx.exchange,
    candles: nextCandles,
    fills: [generateFill(SYM, EX, 65000), ...fills],
  },
  signals: {
    ...ctx.signals,
    signals: [generateSignal(SYM, EX, 65000), ...signals],
  },
}

// Selection switch: a different exchange|symbol pair drives per-selection
// code paths (different candle series, order books, price lookups).
const ALT_EX = MOCK_EXCHANGES[1] || EX
const ALT_SYM = MOCK_SYMBOLS[1] || SYM
const ctxAlt = {
  ...ctxTick,
  selectedExchange: ALT_EX,
  selectedSymbol: ALT_SYM,
  currentPrice: prices[ALT_EX]?.[ALT_SYM] || 100,
  chartCandles: nextCandles
    .filter(c => c.exchange === ALT_EX && c.symbol === ALT_SYM)
    .map(c => ({ time: c.timestamp, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })),
}

// Minimal-data context: the boundary between empty and populated — exactly
// one candle per series, one fill, one signal. Components guarded only by
// `length < 30` bail out here, but unguarded `arr[i-1]` / `arr[n-1]/arr[0]`
// reads on single-element arrays produce NaN/crash — a different surface
// than the fully-empty context.
const firstBySeries = new Map()
for (const c of snapshot.candles) {
  const k = `${c.exchange}|${c.symbol}`
  if (!firstBySeries.has(k)) firstBySeries.set(k, c)
}
const minCandles = [...firstBySeries.values()]
const ctxMin = {
  ...ctx,
  chartCandles: minCandles
    .filter(c => c.exchange === EX && c.symbol === SYM)
    .map(c => ({ time: c.timestamp, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })),
  exchange: {
    ...ctx.exchange,
    candles: minCandles,
    fills: fills.slice(0, 1),
  },
  signals: {
    ...ctx.signals,
    signals: signals.slice(0, 1),
  },
}

// Degenerate context: the pre-snapshot state — every feed empty. Panels must
// degrade to a placeholder/NoDataFeed, never crash or emit NaN.
const ctxEmpty = {
  ...ctx,
  chartCandles: [],
  currentPrice: null,
  exchange: {
    ...ctx.exchange,
    candles: [],
    prices: {},
    accounts: {},
    orderbooks: {},
    fills: [],
    fundingRates: {},
    arbitrage: { opportunities: [] },
  },
  signals: {
    ...ctx.signals,
    signals: [],
    regime: null,
  },
}

describe('panel mount sweep — every registry panel renders clean', () => {
  for (const panel of PANELS) {
    it(`[${panel.id}] mounts without crash, NaN, or React warnings`, async () => {
      const consoleCalls = []
      const errSpy = vi.spyOn(console, 'error').mockImplementation((...a) => consoleCalls.push(a))
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a) => consoleCalls.push(a))
      try {
        const Component = panel.component
        const props = panel.props(ctx)

        const { container, rerender, unmount } = render(
          <Suspense fallback={null}>
            <Component {...props} />
          </Suspense>
        )

        // Panel must have mounted something (an empty container means the lazy
        // import never resolved or the component rendered nothing at all).
        await waitFor(() => expect(container.innerHTML.length).toBeGreaterThan(0), { timeout: 10000 })
        // No NaN may leak into the DOM — attributes or text.
        expect(container.innerHTML).not.toContain('NaN')

        // Interaction pass: mount-time coverage misses handlers that only run
        // on click/change. Fire every control type, then re-check. Two passes:
        // the first interaction may reveal new controls (conditional render),
        // and re-clicking toggles state both ways.
        const interact = () => {
          for (const btn of container.querySelectorAll('button')) {
            fireEvent.click(btn)
          }
          for (const el of container.querySelectorAll('input[type="number"], input[type="text"], input:not([type]), textarea')) {
            fireEvent.change(el, { target: { value: '1' } })
          }
          for (const el of container.querySelectorAll('input[type="checkbox"], input[type="radio"]')) {
            fireEvent.click(el)
          }
          for (const el of container.querySelectorAll('input[type="range"]')) {
            fireEvent.change(el, { target: { value: el.max || '1' } })
          }
          for (const sel of container.querySelectorAll('select')) {
            const opts = sel.querySelectorAll('option')
            if (opts.length > 1) fireEvent.change(sel, { target: { value: opts[1].value } })
          }
        }
        interact()
        interact()
        // Let effects/memos triggered by the interactions settle.
        await waitFor(() => expect(container.isConnected).toBe(true), { timeout: 5000 })

        // Update path: a second tick of context (new array identities) drives
        // chart setData/update calls and memo/effect re-runs — the path where
        // unsorted/duplicate-time defects live.
        rerender(
          <Suspense fallback={null}>
            <Component {...panel.props(ctxTick)} />
          </Suspense>
        )
        await waitFor(() => expect(container.isConnected).toBe(true), { timeout: 5000 })
        expect(container.innerHTML).not.toContain('NaN')

        // Selection switch: different exchange|symbol — per-selection paths.
        rerender(
          <Suspense fallback={null}>
            <Component {...panel.props(ctxAlt)} />
          </Suspense>
        )
        await waitFor(() => expect(container.isConnected).toBe(true), { timeout: 5000 })
        expect(container.innerHTML).not.toContain('NaN')

        // Degenerate pass: pre-snapshot state (all feeds empty). A panel may
        // legitimately render nothing — only crash/NaN/warnings are failures.
        rerender(
          <Suspense fallback={null}>
            <Component {...panel.props(ctxEmpty)} />
          </Suspense>
        )
        await waitFor(() => expect(container.isConnected).toBe(true), { timeout: 5000 })
        expect(container.innerHTML).not.toContain('NaN')

        // Boundary pass: single-element series — guards like `length < 30`
        // degrade to placeholders, but unguarded arr[i-1] math produces
        // NaN on this surface.
        rerender(
          <Suspense fallback={null}>
            <Component {...panel.props(ctxMin)} />
          </Suspense>
        )
        await waitFor(() => expect(container.isConnected).toBe(true), { timeout: 5000 })
        expect(container.innerHTML).not.toContain('NaN')

        // Lifecycle pass: unmount + fresh remount — exercises cleanup paths
        // (intervals, chart-lib teardown, subscriptions). localStorage is
        // cleared so remount simulates a new user — panels persisting
        // "seen/dismissed" flags (e.g. onboarding) must still render.
        unmount()
        try { localStorage.clear() } catch { /* jsdom-less envs */ }
        const second = render(
          <Suspense fallback={null}>
            <Component {...panel.props(ctx)} />
          </Suspense>
        )
        await waitFor(() => expect(second.container.innerHTML.length).toBeGreaterThan(0), { timeout: 10000 })
        expect(second.container.innerHTML).not.toContain('NaN')
        second.unmount()

        // React dev warnings (duplicate keys, setState-in-render, unknown
        // props, invalid attributes) surface via console.error/console.warn.
        // Act() warnings are test-harness noise (timers ticking during the
        // test), not product defects — filtered.
        const real = consoleCalls
          .map(a => a.map(String).join(' '))
          .filter(msg => !msg.includes('wrapped in act'))
        expect(real.join('\n---\n')).toBe('')
      } finally {
        errSpy.mockRestore()
        warnSpy.mockRestore()
      }
    }, 30000)
  }
})
