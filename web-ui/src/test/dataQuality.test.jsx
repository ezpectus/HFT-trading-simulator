import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DataQuality from '../components/DataQuality'

const NOW_S = Math.floor(Date.now() / 1000)

const mkCandle = (symbol, ts, over = {}) => ({
  symbol, exchange: 'binance', timestamp: ts,
  open: 100, high: 101, low: 99, close: 100.5, volume: 123.4, ...over,
})

const CANDLES = [
  ...Array.from({ length: 30 }, (_, i) => mkCandle('BTC/USDT', NOW_S - (30 - i) * 60)),
  ...Array.from({ length: 30 }, (_, i) => mkCandle('ETH/USDT', NOW_S - (30 - i) * 60)),
  // AVAX with a 10-minute gap between bar 20 and 21
  ...Array.from({ length: 20 }, (_, i) => mkCandle('AVAX/USDT', NOW_S - 600 - (20 - i) * 60)),
  mkCandle('AVAX/USDT', NOW_S - 60),
]

describe('DataQuality', () => {
  it('renders quality score and health checks', () => {
    render(<DataQuality candles={CANDLES} exchange="binance" symbol="BTC/USDT" />)
    expect(screen.getByText('Data Quality')).toBeInTheDocument()
    expect(screen.getByText('Health Checks')).toBeInTheDocument()
    expect(screen.getByText(/Candle freshness/)).toBeInTheDocument()
    expect(screen.getByText(/Timestamp continuity/)).toBeInTheDocument()
    expect(screen.getByText(/OHLC sanity/)).toBeInTheDocument()
  })

  it('shows pass/warn/fail summary counts', () => {
    render(<DataQuality candles={CANDLES} exchange="binance" symbol="BTC/USDT" />)
    expect(screen.getByText('Passed')).toBeInTheDocument()
    expect(screen.getByText('Warnings')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('renders symbol status table from real candles', () => {
    render(<DataQuality candles={CANDLES} exchange="binance" symbol="BTC/USDT" />)
    expect(screen.getByText('Symbol Status')).toBeInTheDocument()
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('ETH')).toBeInTheDocument()
    expect(screen.getByText('AVAX')).toBeInTheDocument()
  })

  it('detects the real gap in the AVAX series', () => {
    render(<DataQuality candles={CANDLES} exchange="binance" symbol="BTC/USDT" />)
    expect(screen.getAllByText('1 gaps').length).toBeGreaterThan(0)
  })

  it('shows healthy/stale count in footer', () => {
    render(<DataQuality candles={CANDLES} exchange="binance" symbol="BTC/USDT" />)
    expect(screen.getByText(/symbols healthy/)).toBeInTheDocument()
  })

  it('handles empty candle stream', () => {
    render(<DataQuality candles={[]} exchange="binance" symbol="BTC/USDT" />)
    expect(screen.getByText('Data Quality')).toBeInTheDocument()
    // stream check should fail when no data
    expect(screen.getByText(/Stream active/)).toBeInTheDocument()
    expect(screen.getByText('0 symbols')).toBeInTheDocument()
  })
})
