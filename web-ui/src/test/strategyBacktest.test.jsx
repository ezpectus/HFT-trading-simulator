import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StrategyBacktest from '../components/StrategyBacktest'
import { useTradingStore } from '../stores/useTradingStore'
import { useUIStore } from '../stores/useUIStore'

// lightweight-charts needs canvas — stub the chart surface; the component
// still exercises its own state/store logic.
vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addLineSeries: vi.fn(() => ({ setData: vi.fn() })),
    removeSeries: vi.fn(),
    applyOptions: vi.fn(),
    remove: vi.fn(),
  })),
  ColorType: { Solid: 'solid' },
}))

const makeCandles = (n) => Array.from({ length: n }, (_, i) => ({
  exchange: 'binance', symbol: 'BTC/USDT', timestamp: 1000 + i * 60,
  open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i, volume: 10,
}))

describe('StrategyBacktest', () => {
  beforeEach(() => {
    useTradingStore.setState({
      candles: makeCandles(60),
      sendSignalMessage: null,
      backtestResult: null,
      signalConnected: false,
    })
    useUIStore.setState({ selectedExchange: 'binance', selectedSymbol: 'BTC/USDT' })
  })

  it('renders both engines with honest labels', () => {
    render(<StrategyBacktest />)
    expect(screen.getByText('Strategy Backtest Engine')).toBeInTheDocument()
    expect(screen.getByText('2 engines')).toBeInTheDocument()
    expect(screen.getByText(/Server engine/)).toBeInTheDocument()
    expect(screen.getByText(/Client engine/)).toBeInTheDocument()
  })

  it('server run disabled when signal WS is disconnected', () => {
    render(<StrategyBacktest />)
    expect(screen.getByText('Run on server')).toBeDisabled()
    expect(screen.getByText(/Signal WS disconnected/)).toBeInTheDocument()
  })

  it('sends run_backtest with live candles when connected', () => {
    const send = vi.fn(() => true)
    useTradingStore.setState({ sendSignalMessage: send, signalConnected: true })
    render(<StrategyBacktest />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'trend' } })
    fireEvent.click(screen.getByText('Run on server'))
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'run_backtest',
      strategy: 'trend',
      symbol: 'BTC/USDT',
    }))
    const msg = send.mock.calls[0][0]
    expect(msg.candles_data).toHaveLength(60)
    expect(msg.candles_data[0]).toMatchObject({ timestamp: 1000, close: 100.5 })
  })

  it('renders server results table with data source label', () => {
    useTradingStore.setState({
      signalConnected: true,
      backtestResult: {
        type: 'backtest_result', strategy: 'trend', symbol: 'BTC/USDT',
        candles: 60, data_source: 'client',
        results: {
          'Trend Following': { total_return_pct: 3.5, total_trades: 7, win_rate: 57, sharpe_ratio: 1.2, max_drawdown_pct: -2.1 },
        },
      },
    })
    render(<StrategyBacktest />)
    // name appears in the <option> too — assert the results-table row exists
    expect(screen.getAllByText('Trend Following').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/live sim feed/)).toBeInTheDocument()
    expect(screen.getByText('+3.5%')).toBeInTheDocument()
  })
})
