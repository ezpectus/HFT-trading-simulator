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

describe('panel mount sweep — every registry panel renders clean', () => {
  for (const panel of PANELS) {
    it(`[${panel.id}] mounts without crash, NaN, or React warnings`, async () => {
      const consoleCalls = []
      const errSpy = vi.spyOn(console, 'error').mockImplementation((...a) => consoleCalls.push(a))
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a) => consoleCalls.push(a))
      try {
        const Component = panel.component
        const props = panel.props(ctx)

        const { container } = render(
          <Suspense fallback={null}>
            <Component {...props} />
          </Suspense>
        )

        // Panel must have mounted something (an empty container means the lazy
        // import never resolved or the component rendered nothing at all).
        await waitFor(() => expect(container.innerHTML.length).toBeGreaterThan(0), { timeout: 10000 })
        // No NaN may leak into the DOM — attributes or text.
        expect(container.innerHTML).not.toContain('NaN')

        // React dev warnings (duplicate keys, setState-in-render, unknown
        // props, invalid attributes) surface via console.error/console.warn.
        // Act() warnings are test-harness noise (timers ticking during the
        // test), not product defects — filtered.
        // Interaction pass: mount-time coverage misses handlers that only run
        // on click/change. Fire every button and input, then re-check.
        for (const btn of container.querySelectorAll('button')) {
          fireEvent.click(btn)
        }
        for (const input of container.querySelectorAll('input[type="number"], input[type="text"], input:not([type])')) {
          fireEvent.change(input, { target: { value: '1' } })
        }
        // Let effects/memos triggered by the interactions settle.
        await waitFor(() => expect(container.isConnected).toBe(true), { timeout: 5000 })

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
