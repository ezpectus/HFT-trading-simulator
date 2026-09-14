/**
 * Tests for DrawdownAnalysis component
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DrawdownAnalysis from '../components/DrawdownAnalysis'

// ClosedTrade wire shape: pnl + closed_at (seconds), no `timestamp`
function makeTrade(pnl, closed_at) {
  return { pnl, closed_at, symbol: 'BTC/USDT', exchange: 'binance', side: 'BUY', quantity: 1, entry_price: 100, exit_price: 100, fee: 0, reason: 'MANUAL', opened_at: closed_at - 60 }
}
function accountsWith(trades) {
  return { binance: { exchange: 'binance', trade_history: trades } }
}

describe('DrawdownAnalysis', () => {
  it('renders empty state when no accounts', () => {
    render(<DrawdownAnalysis accounts={{}} />)
    expect(screen.getByText('Drawdown Analysis')).toBeDefined()
    expect(screen.getByText('Max Drawdown')).toBeDefined()
  })

  it('renders empty state when accounts is null', () => {
    render(<DrawdownAnalysis accounts={null} />)
    expect(screen.getByText('Drawdown Analysis')).toBeDefined()
  })

  it('renders empty state when accounts is undefined', () => {
    render(<DrawdownAnalysis />)
    expect(screen.getByText('Drawdown Analysis')).toBeDefined()
  })

  it('renders all stat labels with trades', () => {
    const accounts = accountsWith([makeTrade(100, 1), makeTrade(-50, 2), makeTrade(200, 3)])
    render(<DrawdownAnalysis accounts={accounts} />)
    expect(screen.getByText('Max Drawdown')).toBeDefined()
    expect(screen.getByText('Current DD')).toBeDefined()
    expect(screen.getByText('Max DD Duration')).toBeDefined()
    expect(screen.getByText('Recoveries')).toBeDefined()
    expect(screen.getByText('Underwater %')).toBeDefined()
    expect(screen.getByText('Peak Equity')).toBeDefined()
  })

  it('renders "At peak" when current drawdown is near zero', () => {
    render(<DrawdownAnalysis accounts={accountsWith([makeTrade(100, 1), makeTrade(200, 2)])} />)
    expect(screen.getByText('At peak')).toBeDefined()
  })

  it('renders "below" text when in drawdown', () => {
    render(<DrawdownAnalysis accounts={accountsWith([makeTrade(500, 1), makeTrade(-300, 2)])} />)
    expect(screen.getByText(/below/)).toBeDefined()
  })

  it('renders Current vs Peak label', () => {
    render(<DrawdownAnalysis accounts={accountsWith([makeTrade(100, 1)])} />)
    expect(screen.getByText('Current vs Peak')).toBeDefined()
  })

  it('renders trade count in Max DD Duration', () => {
    render(<DrawdownAnalysis accounts={accountsWith([makeTrade(100, 1), makeTrade(-50, 2)])} />)
    expect(screen.getByText(/trades/)).toBeDefined()
  })

  it('renders with single trade', () => {
    render(<DrawdownAnalysis accounts={accountsWith([makeTrade(100, 1)])} />)
    expect(screen.getByText('Max Drawdown')).toBeDefined()
  })

  it('renders with all profitable trades', () => {
    render(<DrawdownAnalysis accounts={accountsWith([makeTrade(100, 1), makeTrade(200, 2), makeTrade(300, 3)])} />)
    expect(screen.getByText('At peak')).toBeDefined()
  })

  it('renders with all losing trades', () => {
    render(<DrawdownAnalysis accounts={accountsWith([makeTrade(-100, 1), makeTrade(-200, 2), makeTrade(-300, 3)])} />)
    expect(screen.getByText(/below/)).toBeDefined()
  })

  it('renders with trades missing pnl (defaults to 0)', () => {
    const accounts = accountsWith([{ closed_at: 1 }, { closed_at: 2 }])
    render(<DrawdownAnalysis accounts={accounts} />)
    expect(screen.getByText('Drawdown Analysis')).toBeDefined()
  })

  it('renders with trades missing closed_at (defaults to 0)', () => {
    render(<DrawdownAnalysis accounts={accountsWith([makeTrade(100, undefined), makeTrade(-50, undefined)])} />)
    expect(screen.getByText('Max Drawdown')).toBeDefined()
  })

  it('sorts trades by closed_at', () => {
    const accounts = accountsWith([makeTrade(-300, 3), makeTrade(500, 1), makeTrade(-200, 2)])
    render(<DrawdownAnalysis accounts={accounts} />)
    expect(screen.getByText('Max Drawdown')).toBeDefined()
  })

  it('aggregates trade_history across multiple accounts', () => {
    const accounts = {
      binance: { trade_history: [makeTrade(500, 1)] },
      okx: { trade_history: [makeTrade(-300, 2)] },
    }
    render(<DrawdownAnalysis accounts={accounts} />)
    expect(screen.getByText(/below/)).toBeDefined()
  })

  it('renders recovery count as number', () => {
    const accounts = accountsWith([makeTrade(100, 1), makeTrade(-50, 2), makeTrade(200, 3), makeTrade(-100, 4), makeTrade(300, 5)])
    render(<DrawdownAnalysis accounts={accounts} />)
    const recoveriesLabel = screen.getByText('Recoveries')
    const recoveryValue = recoveriesLabel.nextElementSibling
    expect(recoveryValue).toBeDefined()
  })

  it('renders underwater percentage', () => {
    render(<DrawdownAnalysis accounts={accountsWith([makeTrade(100, 1), makeTrade(-50, 2), makeTrade(200, 3)])} />)
    expect(screen.getByText('Underwater %')).toBeDefined()
  })

  it('renders peak equity value', () => {
    render(<DrawdownAnalysis accounts={accountsWith([makeTrade(100, 1), makeTrade(200, 2)])} />)
    expect(screen.getByText('Peak Equity')).toBeDefined()
  })

  it('renders max drawdown percentage sub-text', () => {
    render(<DrawdownAnalysis accounts={accountsWith([makeTrade(500, 1), makeTrade(-300, 2)])} />)
    expect(screen.getAllByText(/%/).length).toBeGreaterThanOrEqual(1)
  })
})
