import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import VolSurface from '../components/VolSurface'

const NOW_S = Math.floor(Date.now() / 1000)
const mkCandles = (exchange, n = 60) =>
  Array.from({ length: n }, (_, i) => ({
    symbol: 'BTC/USDT', exchange, timestamp: NOW_S - (n - i) * 60,
    open: 44000 + Math.sin(i / 5) * 300, high: 44300 + Math.sin(i / 5) * 300,
    low: 43700 + Math.sin(i / 5) * 300, close: 44000 + Math.sin(i / 5) * 300, volume: 100,
  }))

describe('VolSurface', () => {
  it('renders realized-vol grid by exchange × window', () => {
    render(<VolSurface candles={mkCandles('binance')} exchange="binance" symbol="BTC/USDT" />)
    expect(screen.getByText('Volatility Surface')).toBeInTheDocument()
    expect(screen.getByText(/Realized Vol \(exchange × window\)/)).toBeInTheDocument()
    expect(screen.getByText('binance')).toBeInTheDocument()
  })

  it('shows min/avg/max RV stats', () => {
    render(<VolSurface candles={mkCandles('binance')} exchange="binance" symbol="BTC/USDT" />)
    expect(screen.getByText('Min RV')).toBeInTheDocument()
    expect(screen.getByText('Avg RV')).toBeInTheDocument()
    expect(screen.getByText('Max RV')).toBeInTheDocument()
  })

  it('shows vol cone for selected exchange', () => {
    render(<VolSurface candles={mkCandles('binance')} exchange="binance" symbol="BTC/USDT" />)
    expect(screen.getByText(/Vol Cone \(20-candle, binance\)/)).toBeInTheDocument()
  })

  it('renders multiple exchanges when candles exist', () => {
    render(<VolSurface candles={[...mkCandles('binance'), ...mkCandles('okx')]} exchange="binance" symbol="BTC/USDT" />)
    expect(screen.getByText('binance')).toBeInTheDocument()
    expect(screen.getByText('okx')).toBeInTheDocument()
  })

  it('shows empty state without enough candles', () => {
    render(<VolSurface candles={mkCandles('binance', 5)} exchange="binance" symbol="BTC/USDT" />)
    expect(screen.getByText(/Need more candles/)).toBeInTheDocument()
  })
})
