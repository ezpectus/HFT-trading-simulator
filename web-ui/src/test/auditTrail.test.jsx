import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AuditTrail from '../components/AuditTrail'

const FILLS = [
  { id: 'o1', symbol: 'BTC/USDT', exchange: 'binance', side: 'BUY', filled_quantity: 0.2, filled_price: 44100, timestamp: 1700000001 },
  { id: 'o2', symbol: 'ETH/USDT', exchange: 'okx', side: 'SELL', filled_quantity: 2, filled_price: 2400, timestamp: 1700000002 },
]
const SIGNALS = [
  { timestamp: 1700000005, strategy: 'TrendFollower', symbol: 'BTC/USDT', exchange: 'binance', direction: 'LONG', confidence: 82 },
]

describe('AuditTrail', () => {
  it('renders real fill and signal entries', () => {
    render(<AuditTrail fills={FILLS} signals={SIGNALS} />)
    expect(screen.getByText('Audit Trail')).toBeInTheDocument()
    expect(screen.getAllByText('ORDER_FILL').length).toBe(2)
    expect(screen.getAllByText('SIGNAL').length).toBe(1)
    expect(screen.getByText('3 entries')).toBeInTheDocument()
  })

  it('shows summary counts', () => {
    render(<AuditTrail fills={FILLS} signals={SIGNALS} />)
    expect(screen.getByText('Fills')).toBeInTheDocument()
    expect(screen.getByText('Signals')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
  })

  it('filters entries by source (exchange or strategy)', () => {
    render(<AuditTrail fills={FILLS} signals={SIGNALS} />)
    const btns = screen.getAllByText('TrendFollower')
    fireEvent.click(btns.find(el => el.tagName === 'BUTTON'))
    expect(screen.getAllByText('SIGNAL').length).toBe(1)
    expect(screen.queryByText('ORDER_FILL')).not.toBeInTheDocument()
  })

  it('shows fill details', () => {
    render(<AuditTrail fills={FILLS} signals={[]} />)
    expect(screen.getByText('BUY 0.2 @ 44100')).toBeInTheDocument()
  })

  it('shows empty state with no activity', () => {
    render(<AuditTrail fills={[]} signals={[]} />)
    expect(screen.getByText(/No activity yet/)).toBeInTheDocument()
  })
})
