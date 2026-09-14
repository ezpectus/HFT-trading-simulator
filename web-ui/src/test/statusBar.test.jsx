/**
 * Tests for StatusBar component
 * Wire contract: Account.to_dict -> { balance, equity, positions (list), total_trades }
 *   unrealized PnL is derived: equity - balance (not a wire field)
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBar from '../components/StatusBar'

function makeExchange(overrides = {}) {
  return {
    accounts: {}, candles: [], fills: [], connected: true,
    fundingRates: {}, ...overrides,
  }
}
function makeSignals(overrides = {}) {
  return { signals: [], connected: true, ...overrides }
}

describe('StatusBar', () => {
  it('renders with empty exchange state', () => {
    render(<StatusBar exchange={makeExchange()} signals={makeSignals()}
      selectedExchange="binance" selectedSymbol="BTC/USDT" candleCount={0} />)
    expect(screen.getByText(/0 fills/)).toBeDefined()
  })

  it('derives unrealized PnL as equity - balance (not a wire field)', () => {
    const exchange = makeExchange({
      accounts: { binance: { balance: 10000, equity: 10300, positions: [], total_trades: 5 } },
    })
    render(<StatusBar exchange={exchange} signals={makeSignals()}
      selectedExchange="binance" selectedSymbol="BTC/USDT" candleCount={10} />)
    expect(screen.getByText('+300.00')).toBeDefined()
  })

  it('sums balance and counts positions list across accounts', () => {
    const exchange = makeExchange({
      accounts: {
        binance: { balance: 5000, equity: 5000, positions: [{ symbol: 'BTC' }], total_trades: 3 },
        okx: { balance: 7000, equity: 7200, positions: [{ symbol: 'ETH' }, { symbol: 'SOL' }], total_trades: 2 },
      },
    })
    render(<StatusBar exchange={exchange} signals={makeSignals()}
      selectedExchange="binance" selectedSymbol="BTC/USDT" candleCount={10} />)
    expect(screen.getByText(/12000/)).toBeDefined() // total balance
    // 3 positions total, 5 trades total
    const positionsLabel = screen.getByText('Pos:')
    expect(positionsLabel.parentElement.textContent).toContain('3')
    const tradesLabel = screen.getByText('Trades:')
    expect(tradesLabel.parentElement.textContent).toContain('5')
  })

  it('shows CB TRIPPED badge when circuitBreaker tripped', () => {
    const signals = makeSignals({ circuitBreaker: { tripped: true, consecutiveLosses: 4 } })
    render(<StatusBar exchange={makeExchange()} signals={signals}
      selectedExchange="binance" selectedSymbol="BTC/USDT" candleCount={0} />)
    expect(screen.getByText('CB TRIPPED')).toBeDefined()
  })

  it('shows warming count when circuitBreaker has losses but not tripped', () => {
    const signals = makeSignals({ circuitBreaker: { tripped: false, consecutiveLosses: 2 } })
    render(<StatusBar exchange={makeExchange()} signals={signals}
      selectedExchange="binance" selectedSymbol="BTC/USDT" candleCount={0} />)
    expect(screen.getByText('CB:2')).toBeDefined()
  })

  it('shows signal and fill counts', () => {
    const signals = makeSignals({ signals: [{}, {}, {}] })
    const exchange = makeExchange({ fills: [{}, {}] })
    render(<StatusBar exchange={exchange} signals={signals}
      selectedExchange="binance" selectedSymbol="BTC/USDT" candleCount={0} />)
    expect(screen.getByText(/3 sigs/)).toBeDefined()
    expect(screen.getByText(/2 fills/)).toBeDefined()
  })
})
