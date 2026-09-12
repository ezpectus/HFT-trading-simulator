import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import NewsFeed from '../components/NewsFeed'

describe('NewsFeed', () => {
  it('shows honest empty state with no events', () => {
    render(<NewsFeed newsEvent={null} signals={null} addToast={vi.fn()} />)
    expect(screen.getByText('News Feed')).toBeInTheDocument()
    expect(screen.getByText('No news events yet')).toBeInTheDocument()
    // previously-fabricated headlines must not appear
    expect(screen.queryByText('Fed announces rate hold')).not.toBeInTheDocument()
  })

  it('renders a real news_event broadcast', () => {
    render(<NewsFeed
      newsEvent={{ title: 'Breaking: New exchange listing', source: 'CoinDesk', sentiment: 'positive', impact: 'high', timestamp: Date.now() / 1000 }}
      signals={null} addToast={vi.fn()} />)
    expect(screen.getByText('Breaking: New exchange listing')).toBeInTheDocument()
    expect(screen.getByText('CoinDesk')).toBeInTheDocument()
  })

  it('maps direction to sentiment when sentiment is absent', () => {
    render(<NewsFeed
      newsEvent={{ symbol: 'BTC/USDT', direction: 'down', timestamp: Date.now() / 1000 }}
      signals={null} addToast={vi.fn()} />)
    expect(screen.getByText('Bearish')).toBeInTheDocument()
  })

  it('shows sentiment counters', () => {
    render(<NewsFeed newsEvent={null} signals={null} addToast={vi.fn()} />)
    expect(screen.getByText('Bullish')).toBeInTheDocument()
    expect(screen.getByText('Bearish')).toBeInTheDocument()
    expect(screen.getByText('High Impact')).toBeInTheDocument()
  })
})
