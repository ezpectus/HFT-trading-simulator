import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import DashboardProfiler from '../components/DashboardProfiler'
import { recordPanelRender, resetPanelMetrics, resetMetrics } from '../utils/performanceMonitor'

describe('DashboardProfiler', () => {
  beforeEach(() => {
    resetPanelMetrics()
    resetMetrics()
  })

  it('renders vital cards and measured panel table', () => {
    render(<DashboardProfiler />)
    expect(screen.getByText('Dashboard Profiler')).toBeInTheDocument()
    expect(screen.getByText(/Panel Performance/)).toBeInTheDocument()
    // vitals always render (value may be '—' until measured)
    expect(screen.getByText('LCP')).toBeInTheDocument()
    expect(screen.getByText('INP')).toBeInTheDocument()
    expect(screen.getByText('FPS')).toBeInTheDocument()
  })

  it('shows real measured panel metrics from the profiler store', () => {
    recordPanelRender('candle-chart', 'update', 12.5, 20)
    recordPanelRender('candle-chart', 'update', 8.0, 20)
    recordPanelRender('order-book', 'update', 3.2, 8)
    render(<DashboardProfiler />)
    expect(screen.getByText('candle-chart')).toBeInTheDocument()
    expect(screen.getByText('order-book')).toBeInTheDocument()
    // candle-chart: avg of 12.5+8.0 = 10.3ms
    expect(screen.getByText('10.3ms')).toBeInTheDocument()
  })

  it('shows empty state before any renders measured', () => {
    render(<DashboardProfiler />)
    expect(screen.getByText(/No panel renders measured/)).toBeInTheDocument()
  })

  it('flags slow panels as critical', () => {
    recordPanelRender('backtest-runner', 'update', 45.0, 60)
    render(<DashboardProfiler />)
    expect(screen.getByText('backtest-runner')).toBeInTheDocument()
    expect(screen.getByText('critical')).toBeInTheDocument()
    expect(screen.getByText(/slow panel/)).toBeInTheDocument()
  })

  it('shows ok badge for fast panels', () => {
    recordPanelRender('latency-panel', 'update', 2.0, 4)
    render(<DashboardProfiler />)
    expect(screen.getByText('latency-panel')).toBeInTheDocument()
    expect(screen.getByText('ok')).toBeInTheDocument()
  })
})
