import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SentimentDashboard from '../components/SentimentDashboard'

const NEWS = { symbol: 'BTC/USDT', intensity: 0.85, remaining: 12, direction: 'up' }

describe('SentimentDashboard', () => {
  it('renders real active news event with intensity and direction', () => {
    render(<SentimentDashboard symbol="BTC/USDT" newsEvent={NEWS} />)
    expect(screen.getByText('Sentiment / News Events')).toBeInTheDocument()
    expect(screen.getByText('Active News Event')).toBeInTheDocument()
    expect(screen.getAllByText('BTC/USDT').length).toBeGreaterThan(0)
    expect(screen.getByText('up')).toBeInTheDocument()
    expect(screen.getByText(/12\s*ticks/)).toBeInTheDocument()
    expect(screen.getByText(/85\s*%/)).toBeInTheDocument()
  })

  it('shows down-direction styling', () => {
    render(<SentimentDashboard symbol="BTC/USDT" newsEvent={{ ...NEWS, direction: 'down' }} />)
    expect(screen.getByText('down')).toBeInTheDocument()
  })

  it('shows honest empty state with no news event', () => {
    render(<SentimentDashboard symbol="BTC/USDT" newsEvent={null} />)
    expect(screen.getByText(/No active news event/)).toBeInTheDocument()
  })

  it('discloses that multi-source sentiment is not connected', () => {
    render(<SentimentDashboard symbol="BTC/USDT" newsEvent={null} />)
    expect(screen.getByText(/not connected/)).toBeInTheDocument()
  })
})
