import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import CandleChart from '../components/CandleChart'

const mkSeries = () => ({
  setData: vi.fn(),
  setMarkers: vi.fn(),
  applyOptions: vi.fn(),
  priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
})
const lineSeries = vi.fn(mkSeries)
const chartInstance = {
  addLineSeries: lineSeries,
  addCandlestickSeries: vi.fn(mkSeries),
  addHistogramSeries: vi.fn(mkSeries),
  removeSeries: vi.fn(),
  applyOptions: vi.fn(),
  remove: vi.fn(),
  timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
  priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
}

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => chartInstance),
  ColorType: { Solid: 'solid' },
  CrosshairMode: { Normal: 'normal' },
}))

const CANDLES = [
  { time: 1000, open: 10, high: 12, low: 9, close: 11, volume: 5 },
  { time: 1300, open: 11, high: 13, low: 10, close: 12, volume: 6 },
]

describe('CandleChart custom indicators', () => {
  beforeEach(() => {
    lineSeries.mockClear()
    chartInstance.removeSeries.mockClear()
  })

  it('creates a line series per custom-indicator line with its color and label', () => {
    const custom = [{
      id: 'ind-1', label: 'SMA(20)', color: '#ff0000',
      lines: [{ name: 'main', data: [{ time: 1000, value: 10.5 }, { time: 1300, value: 11.5 }] }],
    }]
    render(<CandleChart candles={CANDLES} symbol="BTC/USDT" customIndicators={custom} />)
    const calls = lineSeries.mock.calls.map(c => c[0])
    expect(calls.some(o => o.color === '#ff0000' && o.title === 'SMA(20)')).toBe(true)
  })

  it('removes series for indicators that disappear', () => {
    const custom = [{
      id: 'ind-1', label: 'SMA(20)', color: '#ff0000',
      lines: [{ name: 'main', data: [{ time: 1000, value: 10.5 }] }],
    }]
    const { rerender } = render(<CandleChart candles={CANDLES} symbol="BTC/USDT" customIndicators={custom} />)
    rerender(<CandleChart candles={CANDLES} symbol="BTC/USDT" customIndicators={[]} />)
    expect(chartInstance.removeSeries).toHaveBeenCalled()
  })

  it('multi-line indicator (BB) creates a series per line', () => {
    const custom = [{
      id: 'ind-2', label: 'BB(20,2)', color: '#00ff00',
      lines: [
        { name: 'upper', data: [{ time: 1000, value: 12 }] },
        { name: 'middle', data: [{ time: 1000, value: 11 }] },
        { name: 'lower', data: [{ time: 1000, value: 10 }] },
      ],
    }]
    render(<CandleChart candles={CANDLES} symbol="BTC/USDT" customIndicators={custom} />)
    const bbCalls = lineSeries.mock.calls.filter(c => c[0].title === 'BB(20,2)')
    expect(bbCalls.length).toBe(3)
  })
})
