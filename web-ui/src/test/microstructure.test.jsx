import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Microstructure from '../components/Microstructure'

describe('Microstructure', () => {
  it('renders spread trend and order flow sections', () => {
    render(<Microstructure symbol="BTC/USDT" />)
    expect(screen.getByText('Microstructure')).toBeInTheDocument()
    expect(screen.getByText('Spread Trend')).toBeInTheDocument()
    expect(screen.getByText('Order Flow by Size')).toBeInTheDocument()
  })

  it('shows summary stats (spread, depth, buy pressure, imbalance)', () => {
    render(<Microstructure symbol="BTC/USDT" />)
    expect(screen.getByText('Avg Spread')).toBeInTheDocument()
    expect(screen.getByText('Depth')).toBeInTheDocument()
    expect(screen.getByText('Buy Press')).toBeInTheDocument()
    expect(screen.getByText('Imbalance')).toBeInTheDocument()
  })

  it('renders order flow categories with buy/sell percentages', () => {
    render(<Microstructure symbol="BTC/USDT" />)
    expect(screen.getByText('Small (<1k)')).toBeInTheDocument()
    expect(screen.getByText('Medium (1-10k)')).toBeInTheDocument()
    expect(screen.getByText('Large (10-50k)')).toBeInTheDocument()
    expect(screen.getByText('Whale (>50k)')).toBeInTheDocument()
  })

  it('renders depth profile L1-L10', () => {
    render(<Microstructure symbol="BTC/USDT" />)
    expect(screen.getByText('Depth Profile (L1-L10)')).toBeInTheDocument()
    expect(screen.getByText('L1')).toBeInTheDocument()
    expect(screen.getByText('L10')).toBeInTheDocument()
  })

  it('handles null symbol with fallback', () => {
    render(<Microstructure symbol={null} />)
    expect(screen.getByText('BTC/USDT')).toBeInTheDocument()
  })
})
