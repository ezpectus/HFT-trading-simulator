import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BacktestRunner from '../components/BacktestRunner'

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addLineSeries: vi.fn(() => ({ setData: vi.fn() })),
    addAreaSeries: vi.fn(() => ({ setData: vi.fn() })),
    applyOptions: vi.fn(),
    remove: vi.fn(),
  })),
  ColorType: { Solid: 'solid' },
}))

describe('BacktestRunner', () => {
  it('renders strategy selector and run button', () => {
    render(<BacktestRunner symbol="BTC/USDT" connected={true}
      sendSignalMessage={vi.fn()} backtestResult={null} />)
    expect(screen.getByText('Trend Following')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Run Backtest' })).toBeTruthy()
  })

  it('run sends run_backtest message over WS', () => {
    const send = vi.fn()
    render(<BacktestRunner symbol="BTC/USDT" connected={true}
      sendSignalMessage={send} backtestResult={null} />)
    const btn = screen.getByRole('button', { name: 'Run Backtest' })
    fireEvent.click(btn)
    const backtestCalls = send.mock.calls.filter(c =>
      JSON.stringify(c[0]).includes('run_backtest'))
    expect(backtestCalls.length).toBe(1)
    expect(JSON.parse(JSON.stringify(backtestCalls[0][0])).type).toBe('run_backtest')
  })
})
