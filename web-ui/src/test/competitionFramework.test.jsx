import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CompetitionFramework from '../components/CompetitionFramework'

const CANDLES = Array.from({ length: 150 }, (_, i) => ({
  exchange: 'binance', symbol: 'BTC/USDT', timestamp: 1704067200 + i * 300,
  open: 65000 + i, high: 65010 + i, low: 64990 + i, close: 65005 + i, volume: 100,
}))

const baseProps = {
  sendSignalMessage: vi.fn(() => true),
  backtestResult: null,
  connected: true,
  candles: CANDLES,
  symbol: 'BTC/USDT',
  exchange: 'binance',
}

const mkResult = (strategy, key, metrics) => ({
  type: 'backtest_result', strategy, symbol: 'BTC/USDT', candles: 150,
  data_source: 'client', results: { [key]: metrics },
})

const METRICS = {
  trend: { sharpe_ratio: 1.5, total_return_pct: 12.3, max_drawdown_pct: 4.5, win_rate: 55, total_trades: 42 },
  mean_reversion: { sharpe_ratio: 0.5, total_return_pct: 3.1, max_drawdown_pct: 8.0, win_rate: 48, total_trades: 90 },
}

describe('CompetitionFramework', () => {
  it('sends a run_backtest request per selected strategy', () => {
    const send = vi.fn(() => true)
    const { container } = render(<CompetitionFramework {...baseProps} sendSignalMessage={send} />)
    // Deselect all but two strategies
    const boxes = container.querySelectorAll('input[type="checkbox"]')
    fireEvent.click(boxes[2]) // fft off
    fireEvent.click(boxes[3]) // ensemble off
    fireEvent.click(screen.getByText(/Run Tournament/))
    expect(send).toHaveBeenCalledTimes(2)
    const strategies = send.mock.calls.map(c => c[0].strategy).sort()
    expect(strategies).toEqual(['mean_reversion', 'trend'])
    // Real candles must be attached (>=100 available → candles_data sent)
    expect(send.mock.calls[0][0].candles_data.length).toBe(150)
  })

  it('builds the leaderboard from real backtest metrics', () => {
    const send = vi.fn(() => true)
    const { container, rerender } = render(<CompetitionFramework {...baseProps} sendSignalMessage={send} />)
    const boxes = container.querySelectorAll('input[type="checkbox"]')
    fireEvent.click(boxes[2])
    fireEvent.click(boxes[3])
    fireEvent.click(screen.getByText(/Run Tournament/))

    rerender(<CompetitionFramework {...baseProps} sendSignalMessage={send}
      backtestResult={mkResult('trend', 'Trend Following', METRICS.trend)} />)
    rerender(<CompetitionFramework {...baseProps} sendSignalMessage={send}
      backtestResult={mkResult('mean_reversion', 'Mean Reversion', METRICS.mean_reversion)} />)

    expect(screen.getByText(/Leaderboard/)).toBeTruthy()
    expect(screen.getByText(/Sharpe 1\.50/)).toBeTruthy()
    expect(screen.getByText(/real candles/)).toBeTruthy()
    // trend (sharpe 1.5) must outrank mean_reversion (sharpe 0.5)
    const rows = container.querySelectorAll('.truncate')
    expect(rows[0].textContent).toBe('Trend Following')
  })

  it('disables the run button when not connected', () => {
    render(<CompetitionFramework {...baseProps} connected={false} />)
    expect(screen.getByText(/Run Tournament/).disabled).toBe(true)
  })

  it('marks a strategy with backend error instead of fabricating metrics', () => {
    const send = vi.fn(() => true)
    const { container, rerender } = render(<CompetitionFramework {...baseProps} sendSignalMessage={send} />)
    const boxes = container.querySelectorAll('input[type="checkbox"]')
    fireEvent.click(boxes[0]) // trend off
    fireEvent.click(boxes[1]) // mean_reversion off
    fireEvent.click(screen.getByText(/Run Tournament/))

    rerender(<CompetitionFramework {...baseProps} sendSignalMessage={send}
      backtestResult={{ type: 'backtest_result', strategy: 'fft', error: 'Unknown strategy' }} />)
    rerender(<CompetitionFramework {...baseProps} sendSignalMessage={send}
      backtestResult={mkResult('ensemble', 'Ensemble', METRICS.trend)} />)

    expect(screen.getByText('Unknown strategy')).toBeTruthy()
  })
})
