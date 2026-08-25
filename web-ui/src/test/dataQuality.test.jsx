import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DataQuality from '../components/DataQuality'

describe('DataQuality', () => {
  it('renders quality score and health checks', () => {
    render(<DataQuality />)
    expect(screen.getByText('Data Quality')).toBeInTheDocument()
    expect(screen.getByText('Health Checks')).toBeInTheDocument()
    expect(screen.getByText('Candle Freshness')).toBeInTheDocument()
    expect(screen.getByText('Orderbook Sync')).toBeInTheDocument()
    expect(screen.getByText('Price Staleness')).toBeInTheDocument()
  })

  it('shows pass/warn/fail summary counts', () => {
    render(<DataQuality />)
    expect(screen.getByText('Passed')).toBeInTheDocument()
    expect(screen.getByText('Warnings')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('renders symbol status table', () => {
    render(<DataQuality />)
    expect(screen.getByText('Symbol Status')).toBeInTheDocument()
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('ETH')).toBeInTheDocument()
    expect(screen.getByText('AVAX')).toBeInTheDocument()
  })

  it('shows stale symbols with gaps', () => {
    render(<DataQuality />)
    expect(screen.getByText('2 gaps')).toBeInTheDocument()
    expect(screen.getByText('1 gaps')).toBeInTheDocument()
  })

  it('shows healthy/stale count in footer', () => {
    render(<DataQuality />)
    expect(screen.getByText(/symbols healthy/)).toBeInTheDocument()
    expect(screen.getByText(/stale/)).toBeInTheDocument()
  })
})
