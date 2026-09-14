/**
 * Tests for TradeReplay component
 * Wire contract: Order.to_dict -> { id, status: 'FILLED', filled_quantity,
 *   filled_price, timestamp }; ClosedTrade -> { pnl, closed_at, side }
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TradeReplay from '../components/TradeReplay'

function makeFill(overrides = {}) {
  return {
    id: 'ord-1', symbol: 'BTC/USDT', exchange: 'binance', side: 'BUY',
    order_type: 'LIMIT', quantity: 0.5, price: 50000,
    status: 'FILLED', filled_price: 50010, filled_quantity: 0.5,
    fee: 0.25, timestamp: 1700000000, ...overrides,
  }
}
function makeTrade(overrides = {}) {
  return {
    symbol: 'BTC/USDT', exchange: 'binance', side: 'BUY', quantity: 0.5,
    entry_price: 50000, exit_price: 50500, pnl: 250, fee: 0.5,
    reason: 'TP', opened_at: 1700000000, closed_at: 1700003600, ...overrides,
  }
}

describe('TradeReplay', () => {
  it('renders empty state with no events', () => {
    render(<TradeReplay fills={[]} candles={[]} accounts={{}} />)
    expect(screen.getByText('Trade Replay')).toBeDefined()
    expect(screen.getByText('No events to replay')).toBeDefined()
  })

  it('renders fill events with real wire fields', () => {
    render(<TradeReplay fills={[makeFill()]} candles={[]} accounts={{}} />)
    expect(screen.getByText('Trade Replay')).toBeDefined()
    // step counter shows 1/1
    expect(screen.getByText('1/1')).toBeDefined()
    // filled_quantity rendered (0.5000)
    expect(screen.getByText('0.5000')).toBeDefined()
  })

  it('ignores fills that are not FILLED status', () => {
    render(<TradeReplay fills={[makeFill({ status: 'PENDING' })]} candles={[]} accounts={{}} />)
    expect(screen.getByText('No events to replay')).toBeDefined()
  })

  it('renders closed trades from account trade_history with pnl', () => {
    const accounts = { binance: { trade_history: [makeTrade()] } }
    render(<TradeReplay fills={[]} candles={[]} accounts={accounts} />)
    expect(screen.getByText('1/1')).toBeDefined()
    expect(screen.getByText('CLOSED')).toBeDefined()
  })

  it('merges fills + trades + candles into one timeline', () => {
    const accounts = { binance: { trade_history: [makeTrade()] } }
    const candles = [{ symbol: 'BTC/USDT', exchange: 'binance', time: 1700000100, open: 1, high: 2, low: 0.5, close: 1.5 }]
    render(<TradeReplay fills={[makeFill()]} candles={candles} accounts={accounts} />)
    expect(screen.getByText('1/3')).toBeDefined()
  })

  it('filters by symbol when provided', () => {
    const fills = [makeFill(), makeFill({ id: 'ord-2', symbol: 'ETH/USDT' })]
    render(<TradeReplay fills={fills} candles={[]} accounts={{}} symbol="ETH/USDT" />)
    expect(screen.getByText('1/1')).toBeDefined()
  })

  it('filters by selectedExchange when provided', () => {
    const fills = [makeFill(), makeFill({ id: 'ord-2', exchange: 'okx' })]
    render(<TradeReplay fills={fills} candles={[]} accounts={{}} selectedExchange="okx" />)
    expect(screen.getByText('1/1')).toBeDefined()
  })
})
