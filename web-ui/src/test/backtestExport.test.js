import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportBacktestCSV, buildShareLink } from '../utils/backtestExport'

const result = {
  results: {
    trend: {
      total_return_pct: 5.5, total_trades: 12, win_rate: 58.3,
      profit_factor: 1.8, max_drawdown_pct: 4.2, sharpe_ratio: 1.1,
      final_balance: 10550,
    },
    mean_rev: {
      total_return_pct: -1.2, total_trades: 8, win_rate: 37.5,
      profit_factor: 0.7, max_drawdown_pct: 6.0, sharpe_ratio: -0.4,
      final_balance: 9880,
    },
  },
}
const config = { strategy: 'all', candles: 500, balance: 10000 }

describe('exportBacktestCSV', () => {
  beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake')
    globalThis.URL.revokeObjectURL = vi.fn()
  })

  it('builds CSV with header + one row per strategy', async () => {
    let csvText = null
    globalThis.Blob = class { constructor(parts) { csvText = parts[0] } }
    const click = vi.fn()
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag)
      if (tag === 'a') el.click = click
      return el
    })
    exportBacktestCSV(result)
    expect(click).toHaveBeenCalled()
    const lines = csvText.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('Strategy,Return%,Trades,WinRate%,ProfitFactor,MaxDD%,Sharpe,FinalBalance')
    expect(lines[1]).toContain('trend,5.5,12')
    expect(lines[2]).toContain('mean_rev,-1.2,8')
    document.createElement.mockRestore()
  })

  it('no-ops on empty result', () => {
    expect(() => exportBacktestCSV(null)).not.toThrow()
    expect(() => exportBacktestCSV({})).not.toThrow()
  })
})

describe('buildShareLink', () => {
  it('encodes a compact summary in the URL hash', () => {
    const link = buildShareLink(result, 'BTC/USDT', config)
    const encoded = link.split('#bt=')[1]
    const decoded = JSON.parse(atob(encoded))
    expect(decoded.v).toBe(1)
    expect(decoded.sym).toBe('BTC/USDT')
    expect(decoded.cfg).toEqual({ s: 'all', c: 500, b: 10000 })
    expect(decoded.res).toHaveLength(2)
    expect(decoded.res[0]).toEqual(expect.objectContaining({ n: 'trend', ret: 5.5, tr: 12 }))
  })

  it('returns null on missing results', () => {
    expect(buildShareLink(null, 'BTC/USDT', config)).toBeNull()
    expect(buildShareLink({}, 'BTC/USDT', config)).toBeNull()
  })
})
