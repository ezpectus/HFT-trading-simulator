import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WidgetSDK from '../components/WidgetSDK'

describe('WidgetSDK', () => {
  it('renders widget list with names', () => {
    render(<WidgetSDK />)
    expect(screen.getByText('Widget SDK')).toBeInTheDocument()
    expect(screen.getByText('CandleChart')).toBeInTheDocument()
    expect(screen.getByText('OrderBook')).toBeInTheDocument()
    expect(screen.getByText('RiskMeter')).toBeInTheDocument()
  })

  it('shows code sample section', () => {
    render(<WidgetSDK />)
    expect(screen.getByText('Usage Example')).toBeInTheDocument()
    expect(screen.getByText(/CandleChart/)).toBeInTheDocument()
  })

  it('filters widgets by category', () => {
    render(<WidgetSDK />)
    fireEvent.click(screen.getByText('Risk'))
    expect(screen.getByText('RiskMeter')).toBeInTheDocument()
    expect(screen.queryByText('CandleChart')).not.toBeInTheDocument()
  })

  it('shows selected widget props', () => {
    render(<WidgetSDK />)
    fireEvent.click(screen.getByText('OrderBook'))
    expect(screen.getByText('OrderBook Props')).toBeInTheDocument()
  })

  it('shows copy button', () => {
    render(<WidgetSDK />)
    expect(screen.getByText('Copy')).toBeInTheDocument()
  })
})
