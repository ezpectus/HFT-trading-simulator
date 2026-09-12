import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RealtimeAttribution from '../components/RealtimeAttribution'

const ACCOUNTS = {
  binance: {
    balance: 50000, equity: 51000,
    trade_history: [
      { symbol: 'BTC/USDT', exchange: 'binance', side: 'BUY', quantity: 0.5, entry_price: 43000, exit_price: 44100, pnl: 550, fee: 33, reason: 'TAKE_PROFIT', open_time: 1, close_time: 10 },
      { symbol: 'ETH/USDT', exchange: 'binance', side: 'SELL', quantity: 12, entry_price: 2400, exit_price: 2350, pnl: 600, fee: 28, reason: 'MANUAL', open_time: 2, close_time: 20 },
    ],
  },
  okx: {
    balance: 20000, equity: 19900,
    trade_history: [
      { symbol: 'SOL/USDT', exchange: 'okx', side: 'BUY', quantity: 50, entry_price: 98, exit_price: 96, pnl: -100, fee: 9, reason: 'STOP_LOSS', open_time: 3, close_time: 30 },
    ],
  },
}

describe('RealtimeAttribution', () => {
  it('renders real PnL attribution by symbol', () => {
    render(<RealtimeAttribution accounts={ACCOUNTS} />)
    expect(screen.getByText('Realtime PnL Attribution')).toBeInTheDocument()
    expect(screen.getByText(/Realized PnL by Symbol/)).toBeInTheDocument()
    expect(screen.getAllByText('BTC').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ETH').length).toBeGreaterThan(0)
    expect(screen.getAllByText('SOL').length).toBeGreaterThan(0)
  })

  it('shows summary stats (total PnL, profit factor, best, fees)', () => {
    render(<RealtimeAttribution accounts={ACCOUNTS} />)
    expect(screen.getByText('Total PnL')).toBeInTheDocument()
    expect(screen.getByText('Profit Factor')).toBeInTheDocument()
    expect(screen.getByText('Best')).toBeInTheDocument()
    expect(screen.getByText('Fees Paid')).toBeInTheDocument()
  })

  it('renders cumulative PnL chart', () => {
    render(<RealtimeAttribution accounts={ACCOUNTS} />)
    expect(screen.getByText('Cumulative Realized PnL')).toBeInTheDocument()
    expect(screen.getByText('3 closed trades')).toBeInTheDocument()
  })

  it('shows real close-reason attribution', () => {
    render(<RealtimeAttribution accounts={ACCOUNTS} />)
    expect(screen.getByText('By Close Reason')).toBeInTheDocument()
    expect(screen.getByText('TAKE_PROFIT')).toBeInTheDocument()
    expect(screen.getByText('STOP_LOSS')).toBeInTheDocument()
    expect(screen.getByText('MANUAL')).toBeInTheDocument()
  })

  it('shows empty state with no closed trades', () => {
    render(<RealtimeAttribution accounts={{}} />)
    expect(screen.getByText(/No closed trades/)).toBeInTheDocument()
  })
})
