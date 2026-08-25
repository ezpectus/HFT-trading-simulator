import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WidgetSDK from '../components/WidgetSDK'

describe('WidgetSDK', () => {
  it('renders widget list with names', () => {
    render(<WidgetSDK />)
    expect(screen.getByText('Widget SDK')).toBeInTheDocument()
    expect(screen.getAllByText('CandleChart').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('OrderBook').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('RiskMeter')).toBeInTheDocument()
  })

  it('shows code sample section', () => {
    render(<WidgetSDK />)
    expect(screen.getByText('Usage Example')).toBeInTheDocument()
    expect(screen.getAllByText(/CandleChart/).length).toBeGreaterThanOrEqual(1)
  })

  it('filters widgets by category', () => {
    render(<WidgetSDK />)
    const riskBtns = screen.getAllByText('Risk')
    const riskBtn = riskBtns.find(el => el.tagName === 'BUTTON')
    fireEvent.click(riskBtn)
    expect(screen.getByText('RiskMeter')).toBeInTheDocument()
    expect(screen.queryByText('CandleChart')).not.toBeInTheDocument()
  })

  it('shows selected widget props', () => {
    render(<WidgetSDK />)
    const orderBookEls = screen.getAllByText('OrderBook')
    const orderBookEl = orderBookEls.find(el => el.tagName === 'SPAN')
    fireEvent.click(orderBookEl.closest('div[class*="cursor"]') || orderBookEl)
    expect(screen.getByText('OrderBook Props')).toBeInTheDocument()
  })

  it('shows copy button', () => {
    render(<WidgetSDK />)
    expect(screen.getByText('Copy')).toBeInTheDocument()
  })
})
