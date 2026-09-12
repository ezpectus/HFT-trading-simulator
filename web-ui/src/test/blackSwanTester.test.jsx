import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BlackSwanTester from '../components/BlackSwanTester'

const NOW_S = Math.floor(Date.now() / 1000)
// 40 candles with a crash embedded so worst-return is real
const CANDLES = Array.from({ length: 40 }, (_, i) => {
  const drop = i === 30 ? 0.8 : 1 + Math.sin(i) * 0.005
  const close = 43000 * Math.pow(drop, i > 30 ? 1 : 0) * (1 + i * 0.001) * (i === 30 ? 0.92 : 1)
  return { symbol: 'BTC/USDT', exchange: 'binance', timestamp: NOW_S - (40 - i) * 60, open: close * 0.999, high: close * 1.001, low: close * 0.998, close, volume: 100 }
})

const ACCOUNTS = {
  binance: {
    balance: 50000, equity: 50000,
    positions: [
      { symbol: 'BTC/USDT', exchange: 'binance', side: 'BUY', quantity: 0.5, entry_price: 43000, stop_loss: 0, take_profit: 0, opened_at: 1, unrealized_pnl: 500 },
    ],
    trade_history: [],
  },
}
const PRICES = { 'binance|BTC/USDT': 44000 }

describe('BlackSwanTester', () => {
  it('renders real tail-risk stats from candles', () => {
    render(<BlackSwanTester candles={CANDLES} accounts={ACCOUNTS} prices={PRICES} symbol="BTC/USDT" exchange="binance" />)
    expect(screen.getByText('Black Swan Tester')).toBeInTheDocument()
    expect(screen.getByText('VaR 95')).toBeInTheDocument()
    expect(screen.getByText('ES 95')).toBeInTheDocument()
    expect(screen.getByText('Max DD')).toBeInTheDocument()
    expect(screen.getByText('σ/candle')).toBeInTheDocument()
  })

  it('shows sigma-scaled shock scenarios', () => {
    render(<BlackSwanTester candles={CANDLES} accounts={ACCOUNTS} prices={PRICES} symbol="BTC/USDT" exchange="binance" />)
    expect(screen.getByText(/Shock Scenarios \(40 candles\)/)).toBeInTheDocument()
    expect(screen.getByText('Worst observed candle')).toBeInTheDocument()
    expect(screen.getByText('-2σ shock')).toBeInTheDocument()
    expect(screen.getByText('-10σ black swan')).toBeInTheDocument()
  })

  it('shows return distribution stats', () => {
    render(<BlackSwanTester candles={CANDLES} accounts={ACCOUNTS} prices={PRICES} symbol="BTC/USDT" exchange="binance" />)
    expect(screen.getByText('Return Distribution')).toBeInTheDocument()
    expect(screen.getByText('Skewness')).toBeInTheDocument()
    expect(screen.getByText('Ex. Kurtosis')).toBeInTheDocument()
    expect(screen.getByText('VaR 99')).toBeInTheDocument()
  })

  it('shows worst-move alert with real exposure impact', () => {
    render(<BlackSwanTester candles={CANDLES} accounts={ACCOUNTS} prices={PRICES} symbol="BTC/USDT" exchange="binance" />)
    expect(screen.getByText(/Worst observed move/)).toBeInTheDocument()
    expect(screen.getByText(/Gross exposure/)).toBeInTheDocument()
  })

  it('shows honest empty state with too few candles', () => {
    render(<BlackSwanTester candles={CANDLES.slice(0, 5)} accounts={{}} prices={{}} symbol="BTC/USDT" exchange="binance" />)
    expect(screen.getByText(/Need at least 20 candles/)).toBeInTheDocument()
  })
})
