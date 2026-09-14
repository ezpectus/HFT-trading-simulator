/**
 * MarketDepthReplay — real candle/fill replay + the live wire book
 * (no L2 history exists on the wire — disclosed, not fabricated).
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MarketDepthReplay from '../components/MarketDepthReplay'

// 12 candles (component needs 10+) — first candle mid = (110+95)/2 = 102.5
const CANDLES = Array.from({ length: 12 }, (_, i) => ({
  timestamp: 1704067200 + i * 60,
  exchange: 'binance', symbol: 'BTC/USDT',
  open: 100, high: 110, low: 95, close: 105, volume: 1000,
}))

const PROPS = { candles: CANDLES, orderbooks: {}, fills: [], symbol: 'BTC/USDT', exchange: 'binance' }

describe('MarketDepthReplay', () => {
  it('discloses there is no L2 history on the wire', () => {
    render(<MarketDepthReplay {...PROPS} />)
    expect(screen.getByText(/L2 history is not sent/i)).toBeInTheDocument()
  })

  it('renders the real live book when provided', () => {
    const orderbooks = {
      'binance|BTC/USDT': {
        exchange: 'binance', symbol: 'BTC/USDT',
        bids: [{ price: 64900, quantity: 0.5 }, { price: 64890, quantity: 0.3 }],
        asks: [{ price: 65100, quantity: 0.4 }, { price: 65110, quantity: 0.2 }],
      },
    }
    render(<MarketDepthReplay {...PROPS} orderbooks={orderbooks} />)
    fireEvent.click(screen.getByTitle(/Step forward/i))
    // formatPrice → locale string with thousands separator
    expect(screen.getAllByText(/65,100/).length).toBeGreaterThan(0)
    expect(screen.getByText(/no L2 history on wire/i)).toBeInTheDocument()
  })

  it('shows the idle prompt before playback starts', () => {
    render(<MarketDepthReplay {...PROPS} />)
    expect(screen.getByText(/Press play to start depth replay/i)).toBeInTheDocument()
  })

  it('shows the estimated candle mid after stepping', () => {
    render(<MarketDepthReplay {...PROPS} />)
    fireEvent.click(screen.getByTitle(/Step forward/i))
    // est. mid = (high+low)/2 = 102.5 shown via formatPrice
    expect(screen.getAllByText(/102\.5/).length).toBeGreaterThan(0)
  })

  it('rejects fewer than 10 candles honestly', () => {
    render(<MarketDepthReplay {...PROPS} candles={CANDLES.slice(0, 3)} />)
    expect(screen.getByText(/Need 10\+ candles/i)).toBeInTheDocument()
  })
})
