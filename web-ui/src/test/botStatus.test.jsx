/**
 * Tests for BotStatus component
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BotStatus from '../components/BotStatus'

const mockSignals = [
  { direction: 'LONG', symbol: 'BTC/USDT', confidence: 85, timestamp: Date.now() / 1000 - 5, reason: 'Strong uptrend' },
  { direction: 'SHORT', symbol: 'ETH/USDT', confidence: 72, timestamp: Date.now() / 1000 - 10, reason: 'Overbought' },
]

const mockFills = [
  { status: 'FILLED', side: 'BUY', symbol: 'BTC/USDT', filled_quantity: 0.5, filled_price: 50000, exchange: 'binance', timestamp: Date.now() / 1000 - 3 },
  { status: 'FILLED', side: 'SELL', symbol: 'ETH/USDT', filled_quantity: 2.0, filled_price: 3000, exchange: 'okx', timestamp: Date.now() / 1000 - 8 },
]

const mockAccounts = {
  binance: { balance: 50000, equity: 51000, total_pnl: 1000, total_trades: 42, positions: [{ symbol: 'BTC/USDT', side: 'LONG' }] },
  okx: { balance: 30000, equity: 29500, total_pnl: -500, total_trades: 18, positions: [] },
}

describe('BotStatus', () => {
  it('renders without crashing', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={{}} signalConnected={false} exchangeConnected={false} />)
    expect(screen.getByText('AI Signal Bot')).toBeDefined()
    expect(screen.getByText('HFT Trade Bot')).toBeDefined()
  })

  it('shows ACTIVE when signal connected', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={{}} signalConnected={true} exchangeConnected={false} />)
    const statusElements = screen.getAllByText('ACTIVE')
    expect(statusElements.length).toBeGreaterThanOrEqual(1)
  })

  it('shows OFFLINE when signal disconnected', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={{}} signalConnected={false} exchangeConnected={false} />)
    expect(screen.getAllByText('OFFLINE').length).toBeGreaterThanOrEqual(1)
  })

  it('shows OFFLINE when exchange disconnected', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={{}} signalConnected={true} exchangeConnected={false} />)
    expect(screen.getAllByText('OFFLINE').length).toBeGreaterThanOrEqual(1)
  })

  it('shows both ACTIVE when both connected', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={{}} signalConnected={true} exchangeConnected={true} />)
    expect(screen.getAllByText('ACTIVE').length).toBe(2)
  })

  it('shows OPERATIONAL when both connected', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={{}} signalConnected={true} exchangeConnected={true} circuitBreaker={{ tripped: false, state: 'OPERATIONAL', consecutiveLosses: 0, totalTrips: 0, totalBlocks: 0 }} />)
    expect(screen.getAllByText('OPERATIONAL').length).toBeGreaterThanOrEqual(1)
  })

  it('shows No data when one disconnected', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={{}} signalConnected={true} exchangeConnected={false} />)
    expect(screen.getByText('No data')).toBeDefined()
  })

  it('shows Circuit Breaker section', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={{}} signalConnected={true} exchangeConnected={true} />)
    expect(screen.getByText('Circuit Breaker')).toBeDefined()
  })

  it('shows OPERATIONAL when connected with circuit breaker data', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={{}} signalConnected={true} exchangeConnected={true} circuitBreaker={{ tripped: false, state: 'OPERATIONAL', consecutiveLosses: 0, totalTrips: 0, totalBlocks: 0 }} />)
    expect(screen.getAllByText('OPERATIONAL').length).toBeGreaterThanOrEqual(1)
  })

  it('shows No data when disconnected with no circuit breaker data', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={{}} signalConnected={false} exchangeConnected={false} />)
    expect(screen.getByText('No data')).toBeDefined()
  })

  it('shows Portfolio Overview section', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={mockAccounts} signalConnected={true} exchangeConnected={true} />)
    expect(screen.getByText('Portfolio Overview')).toBeDefined()
  })

  it('aggregates balance from multiple accounts', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={mockAccounts} signalConnected={true} exchangeConnected={true} />)
    // 50000 + 30000 = 80000, formatPrice adds .00
    expect(screen.getByText('$80,000.00')).toBeDefined()
  })

  it('aggregates equity from multiple accounts', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={mockAccounts} signalConnected={true} exchangeConnected={true} />)
    // 51000 + 29500 = 80500
    expect(screen.getByText('$80,500.00')).toBeDefined()
  })

  it('aggregates PnL from multiple accounts', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={mockAccounts} signalConnected={true} exchangeConnected={true} />)
    // 1000 + (-500) = 500
    expect(screen.getByText('+500.00')).toBeDefined()
  })

  it('shows negative PnL with minus sign', () => {
    const negativeAccounts = {
      binance: { balance: 50000, equity: 49000, total_pnl: -1000, total_trades: 5, positions: [] },
    }
    render(<BotStatus signals={[]} fills={[]} accounts={negativeAccounts} signalConnected={true} exchangeConnected={true} />)
    expect(screen.getByText('-1,000.00')).toBeDefined()
  })

  it('aggregates positions count', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={mockAccounts} signalConnected={true} exchangeConnected={true} />)
    // 1 position from binance + 0 from okx = 1
    expect(screen.getByText('1')).toBeDefined()
  })

  it('aggregates total trades', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={mockAccounts} signalConnected={true} exchangeConnected={true} />)
    // 42 + 18 = 60
    expect(screen.getByText('60')).toBeDefined()
  })

  it('shows exchange count', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={mockAccounts} signalConnected={true} exchangeConnected={true} />)
    expect(screen.getByText('2')).toBeDefined()
  })

  it('shows empty state when no activity', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={{}} signalConnected={true} exchangeConnected={true} />)
    expect(screen.getByText('Waiting for bot activity')).toBeDefined()
  })

  it('shows activity feed with signals and fills', () => {
    render(<BotStatus signals={mockSignals} fills={mockFills} accounts={{}} signalConnected={true} exchangeConnected={true} />)
    // Both signals and fills have BTC/USDT and ETH/USDT
    expect(screen.getAllByText('BTC/USDT').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('ETH/USDT').length).toBeGreaterThanOrEqual(1)
  })

  it('shows Bot Activity header', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={{}} signalConnected={true} exchangeConnected={true} />)
    expect(screen.getByText('Bot Activity')).toBeDefined()
  })

  it('shows signals sent count', () => {
    render(<BotStatus signals={mockSignals} fills={[]} accounts={{}} signalConnected={true} exchangeConnected={true} />)
    expect(screen.getByText('2')).toBeDefined()
  })

  it('shows fills count', () => {
    render(<BotStatus signals={[]} fills={mockFills} accounts={{}} signalConnected={true} exchangeConnected={true} />)
    expect(screen.getByText('2')).toBeDefined()
  })

  it('shows port numbers', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={{}} signalConnected={true} exchangeConnected={true} />)
    expect(screen.getByText('8766')).toBeDefined()
    expect(screen.getByText('8765')).toBeDefined()
  })

  it('shows dash when no signals', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={{}} signalConnected={true} exchangeConnected={true} />)
    // Both bots show — for last signal and last fill
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  it('handles null accounts gracefully', () => {
    render(<BotStatus signals={[]} fills={[]} accounts={null} signalConnected={true} exchangeConnected={true} />)
    expect(screen.getByText('Portfolio Overview')).toBeDefined()
  })

  it('renders confidence in activity feed', () => {
    render(<BotStatus signals={mockSignals} fills={[]} accounts={{}} signalConnected={true} exchangeConnected={true} />)
    expect(screen.getByText('85% conf')).toBeDefined()
    expect(screen.getByText('72% conf')).toBeDefined()
  })
})
