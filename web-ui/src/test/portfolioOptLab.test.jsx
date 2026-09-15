import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PortfolioOptLab from '../components/PortfolioOptLab'

const mkCandles = (exchange, symbol, seed) =>
  Array.from({ length: 150 }, (_, i) => ({
    exchange, symbol, timestamp: 1704067200 + i * 300,
    open: 100 + i * 0.1 + seed, high: 101 + i * 0.1 + seed,
    low: 99 + i * 0.1 + seed, close: 100 + i * 0.1 + seed, volume: 100,
  }))

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT']
const baseProps = {
  sendSignalMessage: vi.fn(() => true),
  portfolioResult: null,
  connected: true,
  candles: SYMBOLS.flatMap((s, i) => mkCandles('binance', s, i)),
  symbols: SYMBOLS,
  exchange: 'binance',
  accounts: {},
  prices: {},
}

describe('PortfolioOptLab', () => {
  it('renders the panel title', () => {
    render(<PortfolioOptLab {...baseProps} />)
    expect(screen.getByText('Portfolio Optimization Lab')).toBeInTheDocument()
  })

  it('sends optimize_portfolio with real per-asset candles', () => {
    const send = vi.fn(() => true)
    render(<PortfolioOptLab {...baseProps} sendSignalMessage={send} />)
    fireEvent.click(screen.getByText(/Optimize \(/))
    expect(send).toHaveBeenCalledTimes(1)
    const msg = send.mock.calls[0][0]
    expect(msg.type).toBe('optimize_portfolio')
    expect(msg.method).toBe('max_sharpe')
    expect(msg.assets.length).toBe(4) // auto top-4 eligible
    expect(msg.assets[0].candles_data.length).toBe(150)
  })

  it('attaches rebalance inputs only when requested and positions exist', () => {
    const send = vi.fn(() => true)
    const props = {
      ...baseProps,
      sendSignalMessage: send,
      accounts: { binance: { equity: 20000, positions: [{ symbol: 'BTC/USDT', quantity: 0.1, entry_price: 100 }] } },
      prices: { binance: { 'BTC/USDT': 100 } },
    }
    const { container } = render(<PortfolioOptLab {...props} />)
    fireEvent.click(container.querySelector('input[type="checkbox"]'))
    fireEvent.click(screen.getByText(/Optimize \(/))
    const msg = send.mock.calls[0][0]
    expect(msg.current_weights.length).toBe(4)
    expect(msg.portfolio_value).toBe(20000)
  })

  it('renders weights and metrics from portfolio_result', () => {
    const { rerender } = render(<PortfolioOptLab {...baseProps} />)
    fireEvent.click(screen.getByText(/Optimize \(/))
    rerender(<PortfolioOptLab {...baseProps} portfolioResult={{
      type: 'portfolio_result', method: 'max_sharpe', symbols: SYMBOLS,
      weights: { 'BTC/USDT': 0.5, 'ETH/USDT': 0.3, 'SOL/USDT': 0.2, 'XRP/USDT': 0 },
      expected_return: 0.001, volatility: 0.02, sharpe_ratio: 1.25, n_periods: 149,
    }} />)
    expect(screen.getByText(/Optimal Weights/)).toBeInTheDocument()
    expect(screen.getByText('50.0%')).toBeInTheDocument()
    expect(screen.getByText(/Sharpe 1\.25/)).toBeInTheDocument()
  })

  it('shows backend error instead of fabricating weights', () => {
    const { rerender } = render(<PortfolioOptLab {...baseProps} />)
    fireEvent.click(screen.getByText(/Optimize \(/))
    rerender(<PortfolioOptLab {...baseProps} portfolioResult={{
      type: 'portfolio_result', error: 'need 2-16 assets',
    }} />)
    expect(screen.getByText(/need 2-16 assets/)).toBeInTheDocument()
  })

  it('disables optimize when not connected', () => {
    render(<PortfolioOptLab {...baseProps} connected={false} />)
    expect(screen.getByText(/Optimize \(/).disabled).toBe(true)
  })

  it('toggles asset chips without crashing — selected stays an array', () => {
    render(<PortfolioOptLab {...baseProps} />)
    expect(screen.getByText('Optimize (4 assets)')).toBeInTheDocument()
    fireEvent.click(screen.getByText('BTC'))
    expect(screen.getByText('Optimize (3 assets)')).toBeInTheDocument()
    fireEvent.click(screen.getByText('BTC'))
    expect(screen.getByText('Optimize (4 assets)')).toBeInTheDocument()
  })
})
