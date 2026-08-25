import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DashboardProfiler from '../components/DashboardProfiler'

describe('DashboardProfiler', () => {
  it('renders panel performance table', () => {
    render(<DashboardProfiler />)
    expect(screen.getByText('Dashboard Profiler')).toBeInTheDocument()
    expect(screen.getByText('Panel Performance')).toBeInTheDocument()
    expect(screen.getByText('CandleChart')).toBeInTheDocument()
    expect(screen.getByText('OrderBook')).toBeInTheDocument()
  })

  it('shows key metrics (render time, FPS, memory, bundle)', () => {
    render(<DashboardProfiler />)
    expect(screen.getByText('Total Render Time')).toBeInTheDocument()
    expect(screen.getByText('FPS')).toBeInTheDocument()
    expect(screen.getByText('Memory Usage')).toBeInTheDocument()
    expect(screen.getByText('Bundle Size')).toBeInTheDocument()
  })

  it('shows memory usage bar', () => {
    render(<DashboardProfiler />)
    expect(screen.getByText('145MB / 200MB')).toBeInTheDocument()
  })

  it('shows critical panel warning', () => {
    render(<DashboardProfiler />)
    expect(screen.getByText(/critical panel/)).toBeInTheDocument()
  })

  it('shows panel status badges (ok, warn, critical)', () => {
    render(<DashboardProfiler />)
    expect(screen.getAllByText('ok').length).toBeGreaterThan(0)
    expect(screen.getAllByText('warn').length).toBeGreaterThan(0)
    expect(screen.getAllByText('critical').length).toBeGreaterThan(0)
  })
})
