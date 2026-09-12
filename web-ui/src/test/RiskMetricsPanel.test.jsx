import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RiskMetricsPanel from '../components/performance/RiskMetricsPanel'

const base = {
  metrics: { totalTrades: 5, totalPnl: 500 },
  drawdown: [{ drawdown: -3 }, { drawdown: -8.456 }, { drawdown: -1 }],
  allTrades: [{ pnl: 300 }, { pnl: 400 }, { pnl: -200 }],
  sharpe: 1.5,
  sortino: 2.1,
  accounts: { ex: { total_fees: 25 } },
}

describe('RiskMetricsPanel', () => {
  it('renders risk metrics when trades exist', () => {
    render(<RiskMetricsPanel {...base} />)
    expect(screen.getByText('Max Drawdown')).toBeInTheDocument()
    expect(screen.getByText('-8.46%')).toBeInTheDocument()         // worst dd (min of negatives)
    expect(screen.getByText('Profit Factor')).toBeInTheDocument()
    expect(screen.getByText('3.50')).toBeInTheDocument()          // 700/200
    expect(screen.getByText('$350.00')).toBeInTheDocument()       // avg win
    expect(screen.getByText('$200.00')).toBeInTheDocument()       // avg loss
    expect(screen.getByText('$25.00')).toBeInTheDocument()        // total fees
    expect(screen.getByText('5.0%')).toBeInTheDocument()          // 25/500
  })

  it('hides risk block when no trades', () => {
    const { container } = render(
      <RiskMetricsPanel {...base} metrics={{ totalTrades: 0, totalPnl: 0 }} allTrades={[]} />)
    expect(screen.queryByText('Max Drawdown')).toBeNull()
    expect(container.innerHTML).not.toContain('Risk-Adjusted')
  })

  it('renders sharpe/sortino only with >=2 trades', () => {
    render(<RiskMetricsPanel {...base} allTrades={[{ pnl: 1 }]} />)
    expect(screen.queryByText('Sharpe Ratio')).toBeNull()
    render(<RiskMetricsPanel {...base} />)
    expect(screen.getByText('1.500')).toBeInTheDocument()   // sharpe
    expect(screen.getByText('2.100')).toBeInTheDocument()   // sortino
  })

  it('infinite sharpe renders as infinity symbol', () => {
    render(<RiskMetricsPanel {...base} sharpe={Infinity} />)
    expect(screen.getAllByText('∞').length).toBeGreaterThan(0)
  })
})
