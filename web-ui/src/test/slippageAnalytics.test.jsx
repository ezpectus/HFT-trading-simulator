import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SlippageAnalytics from '../components/SlippageAnalytics'

describe('SlippageAnalytics', () => {
  it('renders slippage by order size and venue comparison', () => {
    render(<SlippageAnalytics symbol="BTC/USDT" />)
    expect(screen.getByText('Slippage Analytics')).toBeInTheDocument()
    expect(screen.getByText('Slippage by Order Size')).toBeInTheDocument()
    expect(screen.getByText('Venue Comparison')).toBeInTheDocument()
  })

  it('shows summary stats (avg, max, executions)', () => {
    render(<SlippageAnalytics symbol="BTC/USDT" />)
    expect(screen.getByText('Avg Slippage')).toBeInTheDocument()
    expect(screen.getByText('Max Slippage')).toBeInTheDocument()
    expect(screen.getByText('Executions')).toBeInTheDocument()
  })

  it('renders size buckets with slippage values', () => {
    render(<SlippageAnalytics symbol="BTC/USDT" />)
    expect(screen.getByText('< 1k')).toBeInTheDocument()
    expect(screen.getByText('> 50k')).toBeInTheDocument()
  })

  it('shows venue names with fill rates', () => {
    render(<SlippageAnalytics symbol="BTC/USDT" />)
    expect(screen.getAllByText('Binance').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('OKX').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Bybit').length).toBeGreaterThanOrEqual(1)
  })

  it('shows large order warning', () => {
    render(<SlippageAnalytics symbol="BTC/USDT" />)
    expect(screen.getByText(/split orders/)).toBeInTheDocument()
  })
})
