import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import OptionsChain from '../components/OptionsChain'

const NOW_S = Math.floor(Date.now() / 1000)
const CANDLES = Array.from({ length: 60 }, (_, i) => ({
  symbol: 'BTC/USDT', exchange: 'binance', timestamp: NOW_S - (60 - i) * 60,
  open: 44000 + Math.sin(i / 4) * 200, high: 44200 + Math.sin(i / 4) * 200,
  low: 43800 + Math.sin(i / 4) * 200, close: 44000 + Math.sin(i / 4) * 200, volume: 100,
}))

describe('OptionsChain', () => {
  it('renders BS-priced chain from real realized vol', () => {
    render(<OptionsChain currentPrice={44100} candles={CANDLES} exchange="binance" symbol="BTC/USDT" />)
    expect(screen.getByText('Options Chain')).toBeInTheDocument()
    expect(screen.getByText('Realized σ')).toBeInTheDocument()
    expect(screen.getByText('Exp. Move')).toBeInTheDocument()
  })

  it('shows strike rows with call/put prices and deltas', () => {
    render(<OptionsChain currentPrice={44100} candles={CANDLES} exchange="binance" symbol="BTC/USDT" />)
    // strikes render as formatted prices; deltas carry Δ suffix
    expect(screen.getAllByText(/Δ/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^\$/).length).toBeGreaterThan(4)
  })

  it('shows BS greeks on strike click', () => {
    const { container } = render(<OptionsChain currentPrice={44100} candles={CANDLES} exchange="binance" symbol="BTC/USDT" />)
    fireEvent.click(container.querySelector('.cursor-pointer'))
    expect(screen.getByText(/BS greeks/)).toBeInTheDocument()
    expect(screen.getAllByText(/Delta:/).length).toBe(2) // call + put
    expect(screen.getAllByText(/Gamma:/).length).toBe(2)
    expect(screen.getAllByText(/Theta\/d:/).length).toBe(2)
  })

  it('shows empty state without candles', () => {
    render(<OptionsChain currentPrice={44100} candles={[]} exchange="binance" symbol="BTC/USDT" />)
    expect(screen.getByText(/Waiting for options chain from simulator/)).toBeInTheDocument()
  })
})
