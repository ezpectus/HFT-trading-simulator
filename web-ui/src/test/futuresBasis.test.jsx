import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import FuturesBasis from '../components/FuturesBasis'

const FUNDING = { binance: 0.0001, okx: 0.0002, bybit: -0.0001 }
const PRICES = { 'binance|BTC/USDT': 44100, 'okx|BTC/USDT': 44120, 'bybit|BTC/USDT': 44080 }

describe('FuturesBasis', () => {
  it('renders real perp funding by exchange', () => {
    render(<FuturesBasis currentPrice={44100} fundingRates={FUNDING} prices={PRICES} symbol="BTC/USDT" />)
    expect(screen.getByText('Futures Basis')).toBeInTheDocument()
    expect(screen.getByText(/Perp Funding by Exchange/)).toBeInTheDocument()
    expect(screen.getAllByText('binance').length).toBeGreaterThan(0)
    expect(screen.getAllByText('okx').length).toBeGreaterThan(0)
  })

  it('shows summary stats (venues, x-exch spread, max funding APR)', () => {
    render(<FuturesBasis currentPrice={44100} fundingRates={FUNDING} prices={PRICES} symbol="BTC/USDT" />)
    expect(screen.getByText('Venues')).toBeInTheDocument()
    expect(screen.getByText('X-Exch Spread')).toBeInTheDocument()
    expect(screen.getByText('Max Funding APR')).toBeInTheDocument()
  })

  it('shows cross-exchange basis rows for the symbol', () => {
    render(<FuturesBasis currentPrice={44100} fundingRates={FUNDING} prices={PRICES} symbol="BTC/USDT" />)
    expect(screen.getByText(/Cross-Exchange Basis \(BTC\/USDT\)/)).toBeInTheDocument()
    expect(screen.getAllByText('bybit').length).toBeGreaterThan(0)
  })

  it('computes real APR from funding rate', () => {
    render(<FuturesBasis currentPrice={44100} fundingRates={{ binance: 0.0001 }} prices={{}} symbol="BTC/USDT" />)
    // 0.01% * 3 * 365 = 10.95% APR — appears in the funding row
    expect(screen.getByText(/10\.9% APR|11\.0% APR/)).toBeInTheDocument()
  })

  it('shows empty state with no data', () => {
    render(<FuturesBasis currentPrice={null} fundingRates={{}} prices={{}} symbol="BTC/USDT" />)
    expect(screen.getByText(/No funding or cross-exchange price data/)).toBeInTheDocument()
  })
})
