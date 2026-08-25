import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SentimentDashboard from '../components/SentimentDashboard'

describe('SentimentDashboard', () => {
  it('renders overall sentiment score', () => {
    render(<SentimentDashboard symbol="BTC/USDT" />)
    expect(screen.getByText('Sentiment Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Overall Sentiment')).toBeInTheDocument()
  })

  it('shows source breakdown with scores', () => {
    render(<SentimentDashboard symbol="BTC/USDT" />)
    expect(screen.getByText('By Source')).toBeInTheDocument()
    expect(screen.getByText('Twitter')).toBeInTheDocument()
    expect(screen.getByText('Reddit')).toBeInTheDocument()
    expect(screen.getByText('Telegram')).toBeInTheDocument()
  })

  it('renders top mentions with sentiment and change', () => {
    render(<SentimentDashboard symbol="BTC/USDT" />)
    expect(screen.getByText('Top Mentions')).toBeInTheDocument()
    expect(screen.getAllByText('BTC').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ETH').length).toBeGreaterThan(0)
  })

  it('shows recent headlines with sources', () => {
    render(<SentimentDashboard symbol="BTC/USDT" />)
    expect(screen.getByText('Recent Headlines')).toBeInTheDocument()
    expect(screen.getByText('CoinDesk')).toBeInTheDocument()
    expect(screen.getByText('Bloomberg')).toBeInTheDocument()
  })

  it('handles null symbol with fallback', () => {
    render(<SentimentDashboard symbol={null} />)
    expect(screen.getByText('BTC/USDT')).toBeInTheDocument()
  })
})
