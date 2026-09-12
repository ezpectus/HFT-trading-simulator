/**
 * MarketDepthReplay — OHLC-reconstructed depth, deterministic per candle.
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
  it('discloses the book is reconstructed from OHLC, not real depth', () => {
    render(<MarketDepthReplay {...PROPS} />)
    expect(screen.getByText(/Reconstructs L2 depth from candle OHLC/i)).toBeInTheDocument()
  })

  it('shows the idle prompt before playback starts', () => {
    render(<MarketDepthReplay {...PROPS} />)
    expect(screen.getByText(/Press play to start depth replay/i)).toBeInTheDocument()
  })

  it('reconstructs a book around the candle mid price after stepping', () => {
    render(<MarketDepthReplay {...PROPS} />)
    fireEvent.click(screen.getByTitle(/Step forward/i))
    // mid = (high+low)/2 = 102.5 shown via formatPrice
    expect(screen.getAllByText(/102\.5/).length).toBeGreaterThan(0)
  })

  it('rejects fewer than 10 candles honestly', () => {
    render(<MarketDepthReplay {...PROPS} candles={CANDLES.slice(0, 3)} />)
    expect(screen.getByText(/Need 10\+ candles/i)).toBeInTheDocument()
  })
})
