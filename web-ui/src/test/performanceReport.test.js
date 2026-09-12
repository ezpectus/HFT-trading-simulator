import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportPDF } from '../utils/performanceReport'

const written = []
const fakeWin = { document: { write: vi.fn((h) => written.push(h)), close: vi.fn() } }

beforeEach(() => {
  written.length = 0
  vi.stubGlobal('open', vi.fn(() => fakeWin))
})

const metrics = { totalBalance: 10000, totalPnl: 500, totalTrades: 2, winningTrades: 1, maxDrawdown: 3.5, totalFees: 1.2 }
const trades = [
  { symbol: 'BTC/USDT', exchange: 'binance', side: 'BUY', entry_price: 100, exit_price: 110, quantity: 1, pnl: 10, reason: 'tp' },
]

describe('exportPDF', () => {
  it('writes an HTML report with metrics and trade rows', () => {
    exportPDF({}, metrics, trades, 1.5, 1.2)
    const html = written.join('')
    expect(html).toContain('BTC/USDT')
    expect(html).toContain('Sharpe')
    expect(html).toContain('50.0') // win rate
    expect(fakeWin.document.close).toHaveBeenCalled()
  })

  it('escapes HTML in trade fields', () => {
    exportPDF({}, metrics, [{ ...trades[0], symbol: '<img onerror=x>' }], 0, 0)
    const html = written.join('')
    expect(html).not.toContain('<img onerror')
    expect(html).toContain('&lt;img')
  })

  it('no-ops when window.open fails', () => {
    vi.stubGlobal('open', vi.fn(() => null))
    expect(() => exportPDF({}, metrics, trades, 0, 0)).not.toThrow()
    expect(written).toHaveLength(0)
  })
})
