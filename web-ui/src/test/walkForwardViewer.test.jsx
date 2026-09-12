import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WalkForwardViewer from '../components/WalkForwardViewer'

const BACKTEST = {
  type: 'backtest_result',
  strategy: 'all',
  symbol: 'BTC/USDT',
  candles: 500,
  results: {
    trend: {
      total_return_pct: 15.2, total_trades: 42, winning_trades: 25, losing_trades: 17,
      win_rate: 59.5, profit_factor: 1.8, max_drawdown_pct: 8.2, sharpe_ratio: 1.85,
      final_balance: 11520, equity_curve: [10000, 10500, 11000, 11520],
    },
    mean_reversion: {
      total_return_pct: -3.4, total_trades: 38, winning_trades: 15, losing_trades: 23,
      win_rate: 39.5, profit_factor: 0.7, max_drawdown_pct: 12.1, sharpe_ratio: -0.4,
      final_balance: 9660, equity_curve: [10000, 9900, 9700, 9660],
    },
  },
}

describe('WalkForwardViewer', () => {
  it('renders real backtest results with strategy names', () => {
    render(<WalkForwardViewer backtestResult={BACKTEST} />)
    expect(screen.getByText('Backtest Results')).toBeInTheDocument()
    expect(screen.getByText('Strategy Comparison')).toBeInTheDocument()
    expect(screen.getAllByText('trend').length).toBeGreaterThan(0)
    expect(screen.getAllByText('mean_reversion').length).toBeGreaterThan(0)
  })

  it('shows summary stats (pass rate, avg return, avg sharpe, best)', () => {
    render(<WalkForwardViewer backtestResult={BACKTEST} />)
    expect(screen.getByText('Pass Rate')).toBeInTheDocument()
    expect(screen.getByText('Avg Return')).toBeInTheDocument()
    expect(screen.getByText('Avg Sharpe')).toBeInTheDocument()
    expect(screen.getByText('Best')).toBeInTheDocument()
  })

  it('shows real returns per strategy', () => {
    render(<WalkForwardViewer backtestResult={BACKTEST} />)
    expect(screen.getByText('+15.2%')).toBeInTheDocument()
    expect(screen.getByText('-3.4%')).toBeInTheDocument()
  })

  it('warns when most strategies lost money', () => {
    const losing = {
      results: {
        a: { total_return_pct: -5, total_trades: 10, win_rate: 30, profit_factor: 0.5, max_drawdown_pct: 9, sharpe_ratio: -0.8, final_balance: 9500 },
        b: { total_return_pct: -2, total_trades: 8, win_rate: 40, profit_factor: 0.8, max_drawdown_pct: 4, sharpe_ratio: -0.3, final_balance: 9800 },
      },
    }
    render(<WalkForwardViewer backtestResult={losing} />)
    expect(screen.getByText(/lost money on this run/)).toBeInTheDocument()
  })

  it('shows empty state without a backtest', () => {
    render(<WalkForwardViewer backtestResult={null} />)
    expect(screen.getByText(/No backtest yet/)).toBeInTheDocument()
  })
})
