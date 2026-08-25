import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import NewsFeed from '../components/NewsFeed'

describe('NewsFeed', () => {
  it('renders news items with titles and sources', () => {
    render(<NewsFeed newsEvent={null} signals={null} addToast={vi.fn()} />)
    expect(screen.getByText('News Feed')).toBeInTheDocument()
    expect(screen.getByText('Fed announces rate hold')).toBeInTheDocument()
    expect(screen.getByText('Reuters')).toBeInTheDocument()
  })

  it('shows sentiment stats (bullish/bearish/high impact)', () => {
    render(<NewsFeed newsEvent={null} signals={null} addToast={vi.fn()} />)
    expect(screen.getByText('Bullish')).toBeInTheDocument()
    expect(screen.getByText('Bearish')).toBeInTheDocument()
    expect(screen.getByText('High Impact')).toBeInTheDocument()
  })

  it('handles newsEvent prop by prepending to list', () => {
    render(<NewsFeed newsEvent={{ title: 'Breaking: New exchange listing', source: 'CoinDesk', sentiment: 'positive', impact: 'high', timestamp: Date.now() / 1000 }} signals={null} addToast={vi.fn()} />)
    expect(screen.getByText('Breaking: New exchange listing')).toBeInTheDocument()
  })

  it('handles null props gracefully', () => {
    render(<NewsFeed newsEvent={null} signals={null} addToast={null} />)
    expect(screen.getByText('News Feed')).toBeInTheDocument()
  })
})
