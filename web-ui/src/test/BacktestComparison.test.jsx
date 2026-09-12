import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import BacktestComparison from '../components/BacktestComparison'
import { SAVED_KEY } from '../components/backtest/constants'

const savedEntry = (id, ret = 12.5, sharpe = 1.4) => ({
  id,
  label: `trend | 500c | vol=0.75`,
  config: {},
  timestamp: '2024-01-01T00:00:00',
  results: {
    trend: {
      total_return_pct: ret,
      sharpe_ratio: sharpe,
      max_drawdown_pct: 8.2,
      win_rate: 55,
      profit_factor: 1.8,
      total_trades: 42,
      avg_win: 120.5,
      avg_loss: -80.25,
      equity_curve: [100, 105, 112],
    },
  },
})

describe('BacktestComparison', () => {
  beforeEach(() => localStorage.clear())

  it('shows the honest empty state when nothing is saved', () => {
    render(<BacktestComparison />)
    expect(screen.getByText('No backtests to compare')).toBeInTheDocument()
  })

  it('loads saved backtests from localStorage and maps snake_case metrics', () => {
    localStorage.setItem(SAVED_KEY, JSON.stringify([savedEntry('e1')]))
    render(<BacktestComparison />)
    expect(screen.getAllByText(/trend \| 500c/).length).toBeGreaterThan(0)
    // 12.5% total return rendered via format()
    expect(screen.getAllByText('12.5%').length).toBeGreaterThan(0)
    // 1.8 profit factor
    expect(screen.getAllByText('1.80').length).toBeGreaterThan(0)
    // 42 trades
    expect(screen.getAllByText('42').length).toBeGreaterThan(0)
  })

  it('reloads when saved-backtests-changed fires (same-tab sync)', () => {
    render(<BacktestComparison />)
    expect(screen.getByText('No backtests to compare')).toBeInTheDocument()
    act(() => {
      localStorage.setItem(SAVED_KEY, JSON.stringify([savedEntry('e2')]))
      window.dispatchEvent(new Event('saved-backtests-changed'))
    })
    expect(screen.getAllByText(/trend \| 500c/).length).toBeGreaterThan(0)
  })

  it('deleting a row removes the entry from localStorage too', () => {
    localStorage.setItem(SAVED_KEY, JSON.stringify([savedEntry('e3')]))
    render(<BacktestComparison />)
    const del = document.querySelector('.bc-td-action button')
    fireEvent.click(del)
    expect(JSON.parse(localStorage.getItem(SAVED_KEY))).toHaveLength(0)
    expect(screen.getByText('No backtests to compare')).toBeInTheDocument()
  })

  it('prefers externalResults over localStorage when provided', () => {
    localStorage.setItem(SAVED_KEY, JSON.stringify([savedEntry('e4')]))
    render(<BacktestComparison results={[{ id: 'x', name: 'External Strat', sharpe: 2.2, totalReturn: 30, maxDrawdown: 5, winRate: 60, profitFactor: 2, totalTrades: 9, avgWin: 1, avgLoss: -1 }]} />)
    expect(screen.getAllByText('External Strat').length).toBeGreaterThan(0)
    expect(screen.queryByText(/trend \| 500c/)).toBeNull()
  })
})
