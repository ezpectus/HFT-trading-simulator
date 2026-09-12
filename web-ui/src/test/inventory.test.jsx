import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Inventory from '../components/Inventory'

const ACCOUNTS = {
  binance: {
    balance: 50000, equity: 60000, currency: 'USDT', leverage: 10,
    positions: [
      { symbol: 'BTC/USDT', exchange: 'binance', side: 'BUY', quantity: 0.5, entry_price: 43000, unrealized_pnl: 550 },
      { symbol: 'ETH/USDT', exchange: 'binance', side: 'SELL', quantity: 12, entry_price: 2400, unrealized_pnl: 600 },
    ],
  },
  okx: {
    balance: 20000, equity: 21000,
    positions: [
      { symbol: 'SOL/USDT', exchange: 'okx', side: 'BUY', quantity: 50, entry_price: 98, unrealized_pnl: -100 },
    ],
  },
}

const PRICES = {
  binance: { 'BTC/USDT': 44100, 'ETH/USDT': 2350 },
  okx: { 'SOL/USDT': 96 },
}

describe('Inventory', () => {
  it('renders inventory with real position count', () => {
    render(<Inventory accounts={ACCOUNTS} prices={PRICES} />)
    expect(screen.getByText('Inventory Manager')).toBeInTheDocument()
    expect(screen.getByText('3 positions')).toBeInTheDocument()
  })

  it('shows total PnL and exposure stats', () => {
    render(<Inventory accounts={ACCOUNTS} prices={PRICES} />)
    expect(screen.getByText('Total PnL')).toBeInTheDocument()
    expect(screen.getByText('Gross Exp')).toBeInTheDocument()
    expect(screen.getByText('Net Exp')).toBeInTheDocument()
    expect(screen.getByText('Win/Loss')).toBeInTheDocument()
  })

  it('renders long/short exposure bar', () => {
    render(<Inventory accounts={ACCOUNTS} prices={PRICES} />)
    expect(screen.getByText(/Long \(2\)/)).toBeInTheDocument()
    expect(screen.getByText(/Short \(1\)/)).toBeInTheDocument()
  })

  it('renders real positions with symbols', () => {
    render(<Inventory accounts={ACCOUNTS} prices={PRICES} />)
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('ETH')).toBeInTheDocument()
    expect(screen.getByText('SOL')).toBeInTheDocument()
  })

  it('shows empty state with no positions', () => {
    render(<Inventory accounts={{}} prices={{}} />)
    expect(screen.getByText(/No open positions/)).toBeInTheDocument()
  })
})
