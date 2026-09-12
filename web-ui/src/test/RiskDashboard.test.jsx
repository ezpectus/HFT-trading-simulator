import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RiskDashboard from '../components/RiskDashboard'

const mkCandles = (exchange, symbol, seed = 0, n = 150, volatile = false) =>
  Array.from({ length: n }, (_, i) => ({
    exchange, symbol, timestamp: 1704067200 + i * 300,
    open: 100 + i * 0.05 + seed,
    high: 101 + i * 0.05 + seed,
    low: 99 + i * 0.05 + seed,
    // volatile series → enough |ret|>0.003 events for the Hawkes event extractor
    close: volatile ? 100 + seed + (i % 7 === 0 ? 1.5 : 0) + i * 0.05 : 100 + i * 0.05 + seed,
    volume: 100,
  }))


describe('RiskDashboard stress test', () => {
  const props = {
    accounts: {
      binance: {
        balance: 10000, equity: 12000,
        positions: [{ symbol: 'BTC/USDT', quantity: 0.2, entry_price: 100 }],
        trade_history: Array.from({ length: 15 }, (_, i) => ({ pnl: i % 3 === 0 ? -50 : 30 })),
      },
    },
    candles: mkCandles('binance', 'BTC/USDT'), exchange: 'binance',
    prices: { binance: { 'BTC/USDT': 100 } },
    sendSignalMessage: vi.fn(() => true),
    stressTestResult: null, signalsConnected: true,
  }

  it('sends stress_test with open positions', () => {
    const send = vi.fn(() => true)
    render(<RiskDashboard {...props} sendSignalMessage={send} />)
    fireEvent.click(screen.getByText('Stress test open positions (backend)'))
    const msg = send.mock.calls[0][0]
    expect(msg.type).toBe('stress_test')
    expect(msg.positions).toEqual([{ symbol: 'BTC/USDT', qty: 0.2, price: 100 }])
    expect(msg.portfolio_value).toBe(12000)
  })

  it('renders scenario results', () => {
    const st = {
      type: 'stress_test_result',
      results: [{ scenario: '2008 Financial Crisis', pnl_pct: -0.5, passed: false }],
      summary: { total_scenarios: 1, passed_scenarios: 0, worst_pnl_percentage: -0.5, max_margin_requirement: 100 },
    }
    render(<RiskDashboard {...props} stressTestResult={st} />)
    fireEvent.click(screen.getByText('Stress test open positions (backend)'))
    expect(screen.getByText(/2008 Financial Crisis/)).toBeInTheDocument()
    expect(screen.getByText(/FAIL/)).toBeInTheDocument()
  })
})
