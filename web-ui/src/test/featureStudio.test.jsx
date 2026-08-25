import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FeatureStudio from '../components/FeatureStudio'

describe('FeatureStudio', () => {
  it('renders feature list with names and categories', () => {
    render(<FeatureStudio />)
    expect(screen.getByText('Feature Studio')).toBeInTheDocument()
    expect(screen.getByText('rsi_14')).toBeInTheDocument()
    expect(screen.getByText('ema_cross_5_20')).toBeInTheDocument()
    expect(screen.getByText('volatility_20d')).toBeInTheDocument()
  })

  it('shows summary stats (importance, high corr, features)', () => {
    render(<FeatureStudio />)
    expect(screen.getByText('Avg Importance')).toBeInTheDocument()
    expect(screen.getByText('High Corr')).toBeInTheDocument()
    expect(screen.getByText('Features')).toBeInTheDocument()
  })

  it('filters features by category', () => {
    render(<FeatureStudio />)
    fireEvent.click(screen.getByText('Momentum'))
    expect(screen.getByText('rsi_14')).toBeInTheDocument()
    expect(screen.getByText('macd_hist')).toBeInTheDocument()
    expect(screen.queryByText('volatility_20d')).not.toBeInTheDocument()
  })

  it('shows feature detail on click', () => {
    render(<FeatureStudio />)
    fireEvent.click(screen.getByText('rsi_14'))
    expect(screen.getByText('Importance')).toBeInTheDocument()
    expect(screen.getByText('Correlation')).toBeInTheDocument()
    expect(screen.getByText('Stability')).toBeInTheDocument()
  })

  it('shows ON/OFF status badges', () => {
    render(<FeatureStudio />)
    expect(screen.getAllByText('ON').length).toBeGreaterThan(0)
    expect(screen.getAllByText('OFF').length).toBeGreaterThan(0)
  })
})
