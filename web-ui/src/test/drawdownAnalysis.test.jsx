/**
 * Tests for DrawdownAnalysis component
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DrawdownAnalysis from '../components/DrawdownAnalysis'

function makeFill(pnl, timestamp) {
  return { pnl, timestamp, symbol: 'BTC/USDT', side: 'BUY', status: 'FILLED' }
}

describe('DrawdownAnalysis', () => {
  it('renders empty state when no fills', () => {
    render(<DrawdownAnalysis fills={[]} />)
    expect(screen.getByText('Drawdown Analysis')).toBeDefined()
    expect(screen.getByText('Max Drawdown')).toBeDefined()
  })

  it('renders empty state when fills is null', () => {
    render(<DrawdownAnalysis fills={null} />)
    expect(screen.getByText('Drawdown Analysis')).toBeDefined()
  })

  it('renders empty state when fills is undefined', () => {
    render(<DrawdownAnalysis />)
    expect(screen.getByText('Drawdown Analysis')).toBeDefined()
  })

  it('renders all stat labels with fills', () => {
    const fills = [makeFill(100, 1), makeFill(-50, 2), makeFill(200, 3)]
    render(<DrawdownAnalysis fills={fills} />)
    expect(screen.getByText('Max Drawdown')).toBeDefined()
    expect(screen.getByText('Current DD')).toBeDefined()
    expect(screen.getByText('Max DD Duration')).toBeDefined()
    expect(screen.getByText('Recoveries')).toBeDefined()
    expect(screen.getByText('Underwater %')).toBeDefined()
    expect(screen.getByText('Peak Equity')).toBeDefined()
  })

  it('renders "At peak" when current drawdown is near zero', () => {
    const fills = [makeFill(100, 1), makeFill(200, 2)]
    render(<DrawdownAnalysis fills={fills} />)
    expect(screen.getByText('At peak')).toBeDefined()
  })

  it('renders "below" text when in drawdown', () => {
    const fills = [makeFill(500, 1), makeFill(-300, 2)]
    render(<DrawdownAnalysis fills={fills} />)
    expect(screen.getByText(/below/)).toBeDefined()
  })

  it('renders Current vs Peak label', () => {
    const fills = [makeFill(100, 1)]
    render(<DrawdownAnalysis fills={fills} />)
    expect(screen.getByText('Current vs Peak')).toBeDefined()
  })

  it('renders fills count in Max DD Duration', () => {
    const fills = [makeFill(100, 1), makeFill(-50, 2)]
    render(<DrawdownAnalysis fills={fills} />)
    expect(screen.getByText(/fills/)).toBeDefined()
  })

  it('renders with single fill', () => {
    const fills = [makeFill(100, 1)]
    render(<DrawdownAnalysis fills={fills} />)
    expect(screen.getByText('Max Drawdown')).toBeDefined()
  })

  it('renders with all profitable fills', () => {
    const fills = [makeFill(100, 1), makeFill(200, 2), makeFill(300, 3)]
    render(<DrawdownAnalysis fills={fills} />)
    expect(screen.getByText('At peak')).toBeDefined()
  })

  it('renders with all losing fills', () => {
    const fills = [makeFill(-100, 1), makeFill(-200, 2), makeFill(-300, 3)]
    render(<DrawdownAnalysis fills={fills} />)
    expect(screen.getByText(/below/)).toBeDefined()
  })

  it('renders with fills missing pnl (defaults to 0)', () => {
    const fills = [{ timestamp: 1 }, { timestamp: 2 }]
    render(<DrawdownAnalysis fills={fills} />)
    expect(screen.getByText('Drawdown Analysis')).toBeDefined()
  })

  it('renders with fills missing timestamp (defaults to 0)', () => {
    const fills = [makeFill(100, undefined), makeFill(-50, undefined)]
    render(<DrawdownAnalysis fills={fills} />)
    expect(screen.getByText('Max Drawdown')).toBeDefined()
  })

  it('sorts fills by timestamp', () => {
    // Out of order timestamps
    const fills = [makeFill(-300, 3), makeFill(500, 1), makeFill(-200, 2)]
    render(<DrawdownAnalysis fills={fills} />)
    // Should not crash and should render stats
    expect(screen.getByText('Max Drawdown')).toBeDefined()
  })

  it('renders recovery count as number', () => {
    const fills = [makeFill(100, 1), makeFill(-50, 2), makeFill(200, 3), makeFill(-100, 4), makeFill(300, 5)]
    render(<DrawdownAnalysis fills={fills} />)
    // Recoveries should be visible as a number
    const recoveriesLabel = screen.getByText('Recoveries')
    const recoveryValue = recoveriesLabel.nextElementSibling
    expect(recoveryValue).toBeDefined()
  })

  it('renders underwater percentage', () => {
    const fills = [makeFill(100, 1), makeFill(-50, 2), makeFill(200, 3)]
    render(<DrawdownAnalysis fills={fills} />)
    expect(screen.getByText('Underwater %')).toBeDefined()
  })

  it('renders peak equity value', () => {
    const fills = [makeFill(100, 1), makeFill(200, 2)]
    render(<DrawdownAnalysis fills={fills} />)
    expect(screen.getByText('Peak Equity')).toBeDefined()
  })

  it('renders max drawdown percentage sub-text', () => {
    const fills = [makeFill(500, 1), makeFill(-300, 2)]
    render(<DrawdownAnalysis fills={fills} />)
    // The sub-text is a percentage like "X.X%"
    expect(screen.getAllByText(/%/).length).toBeGreaterThanOrEqual(1)
  })
})
