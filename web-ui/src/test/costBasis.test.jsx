import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CostBasis from '../components/CostBasis'

const ACCOUNTS = {
  binance: {
    balance: 50000, equity: 51500,
    positions: [
      { symbol: 'BTC/USDT', exchange: 'binance', side: 'BUY', quantity: 0.5, entry_price: 43000, stop_loss: 41000, take_profit: 45000, opened_at: 1700000000, unrealized_pnl: 550 },
      { symbol: 'ETH/USDT', exchange: 'binance', side: 'SELL', quantity: 10, entry_price: 2400, stop_loss: 0, take_profit: 0, opened_at: 1700000100, unrealized_pnl: -300 },
    ],
    trade_history: [
      { symbol: 'SOL/USDT', exchange: 'binance', side: 'BUY', quantity: 20, entry_price: 90, exit_price: 95, pnl: 100, fee: 9, reason: 'TAKE_PROFIT', opened_at: 1, closed_at: 2 },
    ],
  },
}
const PRICES = { 'binance|BTC/USDT': 44100, 'binance|ETH/USDT': 2430 }
const FILLS = [
  { symbol: 'BTC/USDT', exchange: 'binance', side: 'BUY', filled_qty: 0.5, price: 43000, timestamp: 1700000000 },
]

describe('CostBasis', () => {
  it('renders real positions with symbols and quantities', () => {
    render(<CostBasis accounts={ACCOUNTS} prices={PRICES} fills={FILLS} />)
    expect(screen.getByText('Cost Basis Tracker')).toBeInTheDocument()
    expect(screen.getByText('Positions')).toBeInTheDocument()
    expect(screen.getAllByText('BTC').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ETH').length).toBeGreaterThan(0)
    expect(screen.getByText('+0.5')).toBeInTheDocument()
    expect(screen.getByText('-10')).toBeInTheDocument()
  })

  it('shows summary stats (unrealized, realized, total PnL, ROI)', () => {
    render(<CostBasis accounts={ACCOUNTS} prices={PRICES} fills={[]} />)
    expect(screen.getByText('Unrealized')).toBeInTheDocument()
    expect(screen.getByText('Realized')).toBeInTheDocument()
    expect(screen.getByText('Total PnL')).toBeInTheDocument()
    expect(screen.getByText('ROI')).toBeInTheDocument()
  })

  it('shows real SL/TP levels and fill lots', () => {
    render(<CostBasis accounts={ACCOUNTS} prices={PRICES} fills={FILLS} />)
    expect(screen.getByText(/SL \$41,000/)).toBeInTheDocument()
    expect(screen.getByText(/TP \$45,000/)).toBeInTheDocument()
    expect(screen.getByText(/\+0\.5 @ \$43,000/)).toBeInTheDocument()
  })

  it('shows portfolio summary with real cost basis and market value', () => {
    render(<CostBasis accounts={ACCOUNTS} prices={PRICES} fills={[]} />)
    expect(screen.getByText('Portfolio Summary')).toBeInTheDocument()
    expect(screen.getByText('Total Cost Basis:')).toBeInTheDocument()
    expect(screen.getByText('Market Value:')).toBeInTheDocument()
    expect(screen.getByText('Realized PnL:')).toBeInTheDocument()
  })

  it('shows profitable and loss position counts', () => {
    render(<CostBasis accounts={ACCOUNTS} prices={PRICES} fills={[]} />)
    expect(screen.getByText(/profitable/)).toBeInTheDocument()
    expect(screen.getByText(/at loss/)).toBeInTheDocument()
  })

  it('shows honest empty state with no positions or trades', () => {
    render(<CostBasis accounts={{}} prices={{}} fills={[]} />)
    expect(screen.getByText(/No open positions/)).toBeInTheDocument()
  })
})
