/**
 * Tests for AccountPanel component
 * Tests: empty state, account rendering, leaderboard sort cycling, PnL coloring, recent trades, defaults
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AccountPanel from '../components/AccountPanel'

vi.mock('../hooks/useAnimatedNumber', () => ({
  useAnimatedNumber: (value) => value,
}))

function makeAccount(overrides = {}) {
  return {
    balance: 10000,
    equity: 10500,
    total_pnl: 500,
    total_fees: 25,
    total_trades: 10,
    win_rate: 60,
    positions: [],
    trade_history: [],
    ...overrides,
  }
}

describe('AccountPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty state when no accounts', () => {
    render(<AccountPanel accounts={{}} />)
    expect(screen.getByText('Waiting for account data')).toBeInTheDocument()
  })

  it('renders exchange name in account card', () => {
    const accounts = { binance: makeAccount() }
    render(<AccountPanel accounts={accounts} />)
    expect(screen.getAllByText('binance').length).toBeGreaterThanOrEqual(1)
  })

  it('renders leaderboard header', () => {
    const accounts = { binance: makeAccount() }
    render(<AccountPanel accounts={accounts} />)
    expect(screen.getByText('Exchange Leaderboard')).toBeInTheDocument()
  })

  it('renders multiple exchanges in leaderboard', () => {
    const accounts = {
      binance: makeAccount({ total_pnl: 500 }),
      okx: makeAccount({ total_pnl: 200 }),
      bybit: makeAccount({ total_pnl: -100 }),
    }
    render(<AccountPanel accounts={accounts} />)
    expect(screen.getAllByText('binance').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('okx').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('bybit').length).toBeGreaterThanOrEqual(1)
  })

  it('sorts leaderboard by PnL by default (descending)', () => {
    const accounts = {
      okx: makeAccount({ total_pnl: 200 }),
      binance: makeAccount({ total_pnl: 500 }),
      bybit: makeAccount({ total_pnl: -100 }),
    }
    render(<AccountPanel accounts={accounts} />)
    const rank1 = screen.getByText('1')
    const rank2 = screen.getByText('2')
    const rank3 = screen.getByText('3')
    // Binance (500) should be rank 1, OKX (200) rank 2, Bybit (-100) rank 3
    expect(rank1.nextElementSibling.textContent).toBe('binance')
    expect(rank2.nextElementSibling.textContent).toBe('okx')
    expect(rank3.nextElementSibling.textContent).toBe('bybit')
  })

  it('cycles sort mode on button click', () => {
    const accounts = {
      binance: makeAccount({ total_pnl: 500, win_rate: 40, balance: 8000 }),
      okx: makeAccount({ total_pnl: 200, win_rate: 80, balance: 12000 }),
    }
    render(<AccountPanel accounts={accounts} />)
    // Default sort: PnL → binance first
    expect(screen.getByText('1').nextElementSibling.textContent).toBe('binance')

    // Click sort button → Win%
    const buttons = screen.getAllByRole('button')
    const sortBtn = buttons.find(b => b.textContent.includes('PnL'))
    fireEvent.click(sortBtn)

    // Now sorted by Win% → okx (80) first
    expect(screen.getByText('1').nextElementSibling.textContent).toBe('okx')
  })

  it('cycles through all sort modes', () => {
    const accounts = {
      binance: makeAccount({ total_pnl: 500, win_rate: 40, balance: 8000 }),
      okx: makeAccount({ total_pnl: 200, win_rate: 80, balance: 12000 }),
    }
    render(<AccountPanel accounts={accounts} />)

    const getSortBtn = () => {
      const buttons = screen.getAllByRole('button')
      return buttons.find(b => b.getAttribute('title')?.includes('Sort by'))
    }

    // PnL → binance first
    expect(screen.getByText('1').nextElementSibling.textContent).toBe('binance')

    // Click → Win% → okx first
    fireEvent.click(getSortBtn())
    expect(screen.getByText('1').nextElementSibling.textContent).toBe('okx')

    // Click → Balance → okx first (12000 > 8000)
    fireEvent.click(getSortBtn())
    expect(screen.getByText('1').nextElementSibling.textContent).toBe('okx')

    // Click → PnL → binance first
    fireEvent.click(getSortBtn())
    expect(screen.getByText('1').nextElementSibling.textContent).toBe('binance')
  })

  it('displays balance and equity values', () => {
    const accounts = { binance: makeAccount({ balance: 15000, equity: 16000 }) }
    render(<AccountPanel accounts={accounts} />)
    expect(screen.getByText('Balance')).toBeInTheDocument()
    expect(screen.getByText('Equity')).toBeInTheDocument()
  })

  it('displays total trades count', () => {
    const accounts = { binance: makeAccount({ total_trades: 42 }) }
    render(<AccountPanel accounts={accounts} />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('displays positions count', () => {
    const accounts = { binance: makeAccount({ positions: [{ id: 1 }, { id: 2 }, { id: 3 }] }) }
    render(<AccountPanel accounts={accounts} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('handles missing optional fields with defaults', () => {
    const accounts = { binance: {} }
    render(<AccountPanel accounts={accounts} />)
    // Should not crash, should render with 0 values
    expect(screen.getAllByText('binance').length).toBeGreaterThanOrEqual(1)
  })

  it('renders recent trade PnL bars when trade_history exists', () => {
    const accounts = {
      binance: makeAccount({
        trade_history: [
          { symbol: 'BTC', pnl: 100, reason: 'tp' },
          { symbol: 'ETH', pnl: -50, reason: 'sl' },
          { symbol: 'SOL', pnl: 200, reason: 'tp' },
        ],
      }),
    }
    render(<AccountPanel accounts={accounts} />)
    expect(screen.getByText('Recent Trade PnL')).toBeInTheDocument()
  })

  it('does not render recent trade section when no trades', () => {
    const accounts = { binance: makeAccount({ trade_history: [] }) }
    render(<AccountPanel accounts={accounts} />)
    expect(screen.queryByText('Recent Trade PnL')).not.toBeInTheDocument()
  })

  it('shows positive PnL with trending up icon', () => {
    const accounts = { binance: makeAccount({ total_pnl: 500 }) }
    const { container } = render(<AccountPanel accounts={accounts} />)
    // Positive PnL should have text-accent-green class
    const greenElements = container.querySelectorAll('.text-accent-green')
    expect(greenElements.length).toBeGreaterThan(0)
  })

  it('shows negative PnL with trending down icon', () => {
    const accounts = { binance: makeAccount({ total_pnl: -200 }) }
    const { container } = render(<AccountPanel accounts={accounts} />)
    const redElements = container.querySelectorAll('.text-accent-red')
    expect(redElements.length).toBeGreaterThan(0)
  })

  it('renders fees label', () => {
    const accounts = { binance: makeAccount({ total_fees: 25 }) }
    render(<AccountPanel accounts={accounts} />)
    expect(screen.getByText('Fees')).toBeInTheDocument()
  })

  it('renders win rate in account header', () => {
    const accounts = { binance: makeAccount({ win_rate: 65 }) }
    render(<AccountPanel accounts={accounts} />)
    expect(screen.getAllByText(/65/).length).toBeGreaterThanOrEqual(1)
  })

  it('handles zero balance without division error', () => {
    const accounts = { binance: makeAccount({ balance: 0, total_pnl: 100 }) }
    render(<AccountPanel accounts={accounts} />)
    expect(screen.getAllByText('binance').length).toBeGreaterThanOrEqual(1)
  })

  it('renders rank numbers for leaderboard', () => {
    const accounts = {
      binance: makeAccount({ total_pnl: 500 }),
      okx: makeAccount({ total_pnl: 200 }),
    }
    render(<AccountPanel accounts={accounts} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
