import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CrossAssetMatrix from '../components/CrossAssetMatrix'

describe('CrossAssetMatrix', () => {
  it('renders correlation matrix with asset names', () => {
    render(<CrossAssetMatrix />)
    expect(screen.getByText('Cross-Asset Matrix')).toBeInTheDocument()
    expect(screen.getByText('Correlation Matrix (30d)')).toBeInTheDocument()
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('ETH')).toBeInTheDocument()
  })

  it('shows summary stats (high corr, low corr, avg return, best)', () => {
    render(<CrossAssetMatrix />)
    expect(screen.getByText('High Corr')).toBeInTheDocument()
    expect(screen.getByText('Low Corr')).toBeInTheDocument()
    expect(screen.getByText('Avg Return')).toBeInTheDocument()
    expect(screen.getByText('Best')).toBeInTheDocument()
  })

  it('renders asset performance table with returns and vol', () => {
    render(<CrossAssetMatrix />)
    expect(screen.getByText('Asset Performance (30d)')).toBeInTheDocument()
    expect(screen.getByText('+12.5%')).toBeInTheDocument()
    expect(screen.getByText('-2.8%')).toBeInTheDocument()
  })

  it('shows all 8 assets in returns table', () => {
    render(<CrossAssetMatrix />)
    expect(screen.getByText('SOL')).toBeInTheDocument()
    expect(screen.getByText('AVAX')).toBeInTheDocument()
    expect(screen.getByText('MATIC')).toBeInTheDocument()
    expect(screen.getByText('ATOM')).toBeInTheDocument()
  })
})
