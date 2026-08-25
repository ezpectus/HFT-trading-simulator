import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RealtimeAttribution from '../components/RealtimeAttribution'

describe('RealtimeAttribution', () => {
  it('renders PnL attribution by source', () => {
    render(<RealtimeAttribution />)
    expect(screen.getByText('Realtime PnL Attribution')).toBeInTheDocument()
    expect(screen.getByText('PnL by Source')).toBeInTheDocument()
    expect(screen.getAllByText('TrendFollowing').length).toBeGreaterThan(0)
    expect(screen.getAllByText('MeanReversion').length).toBeGreaterThan(0)
  })

  it('shows summary stats (total PnL, profit factor, best, worst)', () => {
    render(<RealtimeAttribution />)
    expect(screen.getByText('Total PnL')).toBeInTheDocument()
    expect(screen.getByText('Profit Factor')).toBeInTheDocument()
    expect(screen.getByText('Best')).toBeInTheDocument()
    expect(screen.getByText('Worst')).toBeInTheDocument()
  })

  it('renders cumulative PnL chart', () => {
    render(<RealtimeAttribution />)
    expect(screen.getByText('Cumulative PnL (Today)')).toBeInTheDocument()
  })

  it('shows cost items (fees, slippage, funding)', () => {
    render(<RealtimeAttribution />)
    expect(screen.getAllByText('Fees').length).toBeGreaterThan(0)
    expect(screen.getByText('Slippage')).toBeInTheDocument()
    expect(screen.getByText('Funding Cost')).toBeInTheDocument()
  })

  it('shows gross profit and loss in footer', () => {
    render(<RealtimeAttribution />)
    expect(screen.getAllByText(/Gross:/).length).toBeGreaterThan(0)
  })
})
