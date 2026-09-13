/**
 * Tests for PendingOrders — resting-order list + cancel actions.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PendingOrders from '../components/PendingOrders'

const ORDERS = {
  'binance|o1': { id: 'o1', exchange: 'binance', symbol: 'BTC/USDT', side: 'BUY', order_type: 'LIMIT', quantity: 0.5, price: 49000, status: 'PENDING', timestamp: 1700000000 },
  'binance|o2': { id: 'o2', exchange: 'binance', symbol: 'ETH/USDT', side: 'SELL', order_type: 'STOP_LIMIT', quantity: 1.0, price: 3200, status: 'PENDING', timestamp: 1700000100 },
  'bybit|o9': { id: 'o9', exchange: 'bybit', symbol: 'BTC/USDT', side: 'BUY', order_type: 'LIMIT', quantity: 0.1, price: 48000, status: 'PENDING', timestamp: 1700000200 },
}

describe('PendingOrders', () => {
  it('shows empty state with no orders', () => {
    render(<PendingOrders openOrders={{}} onCancel={vi.fn()} onCancelAll={vi.fn()} />)
    expect(screen.getByText('No pending orders')).toBeDefined()
  })

  it('filters orders to the selected exchange', () => {
    render(<PendingOrders openOrders={ORDERS} onCancel={vi.fn()} onCancelAll={vi.fn()} exchange="binance" />)
    expect(screen.getByText(/2 pending on binance/)).toBeDefined()
    expect(screen.getByText('ETH/USDT')).toBeDefined()
    // bybit order excluded by the filter
    expect(screen.queryByText('bybit')).toBeNull()
  })

  it('lists all exchanges when no filter', () => {
    render(<PendingOrders openOrders={ORDERS} onCancel={vi.fn()} onCancelAll={vi.fn()} />)
    expect(screen.getByText(/3 pending across exchanges/)).toBeDefined()
  })

  it('sends cancel_order for the clicked row', () => {
    const onCancel = vi.fn()
    render(<PendingOrders openOrders={ORDERS} onCancel={onCancel} onCancelAll={vi.fn()} exchange="binance" />)
    fireEvent.click(screen.getByTitle('Cancel o1'))
    expect(onCancel).toHaveBeenCalledWith('binance', 'o1')
  })

  it('sends cancel_all_orders for the selected exchange', () => {
    const onCancelAll = vi.fn()
    render(<PendingOrders openOrders={ORDERS} onCancel={vi.fn()} onCancelAll={onCancelAll} exchange="binance" />)
    fireEvent.click(screen.getByText('Cancel All'))
    expect(onCancelAll).toHaveBeenCalledWith('binance')
  })

  it('sorts newest orders first', () => {
    render(<PendingOrders openOrders={ORDERS} onCancel={vi.fn()} onCancelAll={vi.fn()} exchange="binance" />)
    const rows = screen.getAllByTitle(/^Cancel o/)
    expect(rows[0].title).toBe('Cancel o2')
    expect(rows[1].title).toBe('Cancel o1')
  })
})
