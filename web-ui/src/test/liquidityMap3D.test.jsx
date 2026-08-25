import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LiquidityMap3D from '../components/LiquidityMap3D'

describe('LiquidityMap3D', () => {
  it('renders depth profile with price levels', () => {
    render(<LiquidityMap3D currentPrice={44200} />)
    expect(screen.getByText('Liquidity Map 3D')).toBeInTheDocument()
    expect(screen.getByText('Depth Profile')).toBeInTheDocument()
  })

  it('shows summary stats (bid depth, ask depth, imbalance, max depth)', () => {
    render(<LiquidityMap3D currentPrice={44200} />)
    expect(screen.getByText('Bid Depth')).toBeInTheDocument()
    expect(screen.getByText('Ask Depth')).toBeInTheDocument()
    expect(screen.getByText('Imbalance')).toBeInTheDocument()
    expect(screen.getByText('Max Depth')).toBeInTheDocument()
  })

  it('renders liquidity zones with support/resistance labels', () => {
    render(<LiquidityMap3D currentPrice={44200} />)
    expect(screen.getByText('Liquidity Zones')).toBeInTheDocument()
    expect(screen.getAllByText('SUPPORT').length).toBeGreaterThan(0)
    expect(screen.getAllByText('RESIST').length).toBeGreaterThan(0)
  })

  it('shows bid-heavy or ask-heavy indicator', () => {
    render(<LiquidityMap3D currentPrice={44200} />)
    expect(screen.getByText(/bid-heavy|ask-heavy/)).toBeInTheDocument()
  })

  it('handles null currentPrice with fallback', () => {
    render(<LiquidityMap3D currentPrice={null} />)
    expect(screen.getByText('$44,200')).toBeInTheDocument()
  })
})
