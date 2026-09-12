import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TickReplay from '../components/TickReplay'

// fills arrive newest-first; component replays oldest→newest
const FILLS = [
  { order_id: 'o3', symbol: 'BTC/USDT', exchange: 'binance', side: 'SELL', filled_qty: 0.5, price: 44102, timestamp: 1700000003 },
  { order_id: 'o2', symbol: 'BTC/USDT', exchange: 'okx', side: 'BUY', filled_qty: 0.3, price: 44101, timestamp: 1700000002 },
  { order_id: 'o1', symbol: 'BTC/USDT', exchange: 'binance', side: 'BUY', filled_qty: 0.2, price: 44100, timestamp: 1700000001 },
]

describe('TickReplay', () => {
  it('renders tick list and controls from real fills', () => {
    render(<TickReplay symbol="BTC/USDT" fills={FILLS} />)
    expect(screen.getByText('Tick Replay')).toBeInTheDocument()
    expect(screen.getByText('1/3')).toBeInTheDocument()
  })

  it('shows oldest tick first (fills reversed)', () => {
    render(<TickReplay symbol="BTC/USDT" fills={FILLS} />)
    expect(screen.getAllByText('$44,100.00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('BUY').length).toBeGreaterThan(0)
  })

  it('advances ticks on step forward', () => {
    render(<TickReplay symbol="BTC/USDT" fills={FILLS} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[3]) // step-forward
    expect(screen.getByText('2/3')).toBeInTheDocument()
  })

  it('shows speed controls', () => {
    render(<TickReplay symbol="BTC/USDT" fills={FILLS} />)
    expect(screen.getByText('0.5x')).toBeInTheDocument()
    expect(screen.getByText('1x')).toBeInTheDocument()
    expect(screen.getByText('10x')).toBeInTheDocument()
  })

  it('shows empty state with no fills', () => {
    render(<TickReplay symbol="BTC/USDT" fills={[]} />)
    expect(screen.getByText(/No fills yet/)).toBeInTheDocument()
  })

  it('filters fills by symbol', () => {
    const mixed = [...FILLS, { order_id: 'o9', symbol: 'ETH/USDT', exchange: 'binance', side: 'BUY', filled_qty: 1, price: 2400, timestamp: 1700000000 }]
    render(<TickReplay symbol="BTC/USDT" fills={mixed} />)
    expect(screen.getByText('1/3')).toBeInTheDocument()
  })
})
