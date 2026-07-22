/**
 * Tests for FillsPanel component
 * Tests: empty state, fill rendering, search filtering, stats summary, buy/sell ratio
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FillsPanel from '../components/FillsPanel'

vi.mock('../hooks/useDebounce', () => ({
  useDebounce: (value) => value,
}))

vi.mock('../components/VirtualList', () => ({
  default: ({ items, renderItem }) => (
    <div data-testid="virtual-list">
      {items.map((item, i) => (
        <div key={i} data-testid={`fill-item-${i}`}>
          {renderItem(item, i)}
        </div>
      ))}
    </div>
  ),
}))

const makeFill = (overrides = {}) => ({
  symbol: 'BTC/USDT',
  side: 'BUY',
  exchange: 'binance',
  status: 'FILLED',
  filled_quantity: 1.0,
  filled_price: 50000.0,
  fee: 2.0,
  timestamp: Date.now(),
  ...overrides,
})

describe('FillsPanel', () => {
  it('shows empty state when no fills', () => {
    render(<FillsPanel fills={[]} />)
    expect(screen.getByText('No fills yet')).toBeInTheDocument()
  })

  it('shows fill statistics header when fills exist', () => {
    render(<FillsPanel fills={[makeFill()]} />)
    expect(screen.getByText('Fill Statistics')).toBeInTheDocument()
  })

  it('shows total fill count', () => {
    const fills = [makeFill(), makeFill({ side: 'SELL' }), makeFill()]
    render(<FillsPanel fills={fills} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows singular "fill" for one fill', () => {
    render(<FillsPanel fills={[makeFill()]} />)
    expect(screen.getByText(/1 fill/)).toBeInTheDocument()
  })

  it('shows plural "fills" for multiple fills', () => {
    render(<FillsPanel fills={[makeFill(), makeFill()]} />)
    expect(screen.getByText(/2 fills/)).toBeInTheDocument()
  })

  it('renders fill symbol', () => {
    render(<FillsPanel fills={[makeFill({ symbol: 'ETH/USDT' })]} />)
    expect(screen.getByText('ETH/USDT')).toBeInTheDocument()
  })

  it('renders fill side', () => {
    render(<FillsPanel fills={[makeFill({ side: 'SELL' })]} />)
    expect(screen.getByText('SELL')).toBeInTheDocument()
  })

  it('renders fill exchange', () => {
    render(<FillsPanel fills={[makeFill({ exchange: 'bybit' })]} />)
    expect(screen.getByText('bybit')).toBeInTheDocument()
  })

  it('shows search input', () => {
    render(<FillsPanel fills={[makeFill()]} />)
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
  })

  it('filters fills by symbol search', async () => {
    const fills = [
      makeFill({ symbol: 'BTC/USDT' }),
      makeFill({ symbol: 'ETH/USDT' }),
    ]
    render(<FillsPanel fills={fills} />)
    const input = screen.getByPlaceholderText('Search...')
    fireEvent.change(input, { target: { value: 'BTC' } })
    expect(screen.getByText(/Recent Fills \(1\/2\)/)).toBeInTheDocument()
  })

  it('filters fills by side search', async () => {
    const fills = [
      makeFill({ side: 'BUY' }),
      makeFill({ side: 'SELL' }),
    ]
    render(<FillsPanel fills={fills} />)
    const input = screen.getByPlaceholderText('Search...')
    fireEvent.change(input, { target: { value: 'sell' } })
    expect(screen.getByText(/Recent Fills \(1\/2\)/)).toBeInTheDocument()
  })

  it('filters fills by exchange search', async () => {
    const fills = [
      makeFill({ exchange: 'binance' }),
      makeFill({ exchange: 'okx' }),
    ]
    render(<FillsPanel fills={fills} />)
    const input = screen.getByPlaceholderText('Search...')
    fireEvent.change(input, { target: { value: 'okx' } })
    expect(screen.getByText(/Recent Fills \(1\/2\)/)).toBeInTheDocument()
  })

  it('shows all fills when search cleared', async () => {
    const fills = [
      makeFill({ symbol: 'BTC/USDT' }),
      makeFill({ symbol: 'ETH/USDT' }),
    ]
    render(<FillsPanel fills={fills} />)
    const input = screen.getByPlaceholderText('Search...')
    fireEvent.change(input, { target: { value: 'BTC' } })
    expect(screen.getByText(/Recent Fills \(1\/2\)/)).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getByText(/Recent Fills \(2\)/)).toBeInTheDocument()
  })

  it('shows buy count in stats', () => {
    const fills = [
      makeFill({ side: 'BUY' }),
      makeFill({ side: 'BUY' }),
      makeFill({ side: 'SELL' }),
    ]
    render(<FillsPanel fills={fills} />)
    expect(screen.getByText(/2 buys/)).toBeInTheDocument()
  })

  it('shows sell count in stats', () => {
    const fills = [
      makeFill({ side: 'BUY' }),
      makeFill({ side: 'SELL' }),
      makeFill({ side: 'SELL' }),
    ]
    render(<FillsPanel fills={fills} />)
    expect(screen.getByText(/2 sells/)).toBeInTheDocument()
  })

  it('shows fees in stats', () => {
    const fills = [makeFill({ fee: 5.0 }), makeFill({ fee: 3.0 })]
    render(<FillsPanel fills={fills} />)
    expect(screen.getByText(/Fees:/)).toBeInTheDocument()
  })

  it('shows B/S ratio in stats', () => {
    const fills = [
      makeFill({ side: 'BUY', filled_quantity: 2.0 }),
      makeFill({ side: 'SELL', filled_quantity: 1.0 }),
    ]
    render(<FillsPanel fills={fills} />)
    // B/S ratio = buy_vol / sell_vol = 2.0 / 1.0 = 2.00
    expect(screen.getByText(/B\/S:/)).toBeInTheDocument()
  })

  it('shows infinity for B/S ratio when no sells', () => {
    const fills = [makeFill({ side: 'BUY', filled_quantity: 1.0 })]
    render(<FillsPanel fills={fills} />)
    expect(screen.getByText(/∞/)).toBeInTheDocument()
  })

  it('only counts FILLED status in stats', () => {
    const fills = [
      makeFill({ status: 'FILLED' }),
      makeFill({ status: 'CANCELLED' }),
      makeFill({ status: 'REJECTED' }),
    ]
    render(<FillsPanel fills={fills} />)
    // Only 1 FILLED fill
    expect(screen.getByText(/1 fill/)).toBeInTheDocument()
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
  })

  it('shows recent fills count with filter indicator', () => {
    const fills = [makeFill(), makeFill()]
    render(<FillsPanel fills={fills} />)
    expect(screen.getByText(/Recent Fills \(2\)/)).toBeInTheDocument()
  })

  it('renders quantity for each fill', () => {
    render(<FillsPanel fills={[makeFill({ filled_quantity: 1.5 })]} />)
    expect(screen.getByText('1.5')).toBeInTheDocument()
  })

  it('renders Total Fills label', () => {
    render(<FillsPanel fills={[makeFill()]} />)
    expect(screen.getByText('Total Fills')).toBeInTheDocument()
  })

  it('renders Volume label', () => {
    render(<FillsPanel fills={[makeFill()]} />)
    expect(screen.getByText('Volume')).toBeInTheDocument()
  })

  it('renders Notional label', () => {
    render(<FillsPanel fills={[makeFill()]} />)
    expect(screen.getByText('Notional')).toBeInTheDocument()
  })
})
