import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FeatureFlags from '../components/FeatureFlags'
import { isFlagEnabled } from '../featureFlags'

describe('FeatureFlags', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders only real, wireable flags', () => {
    render(<FeatureFlags addToast={vi.fn()} />)
    expect(screen.getByText('Feature Flags')).toBeInTheDocument()
    expect(screen.getByText('Mock Mode')).toBeInTheDocument()
    expect(screen.getByText('Sound Alerts')).toBeInTheDocument()
    expect(screen.getByText('Trailing Stop')).toBeInTheDocument()
    // Backend strategy toggles were facades — nothing in the UI could consume them.
    expect(screen.queryByText('ML Ensemble')).not.toBeInTheDocument()
    expect(screen.queryByText('Circuit Breaker')).not.toBeInTheDocument()
  })

  it('toggle writes the real consumer key, not an orphan blob', () => {
    const addToast = vi.fn()
    render(<FeatureFlags addToast={addToast} />)
    expect(isFlagEnabled('mock-mode')).toBe(false)
    fireEvent.click(screen.getByText('Mock Mode'))
    // useMockData reads localStorage['mock-mode'] — this is the real key.
    expect(localStorage.getItem('mock-mode')).toBe('true')
    expect(localStorage.getItem('trading-feature-flags')).toBe(null)
    expect(addToast).toHaveBeenCalledWith('info', expect.stringContaining('applies on reload'))
  })

  it('toggle dispatches feature-flag-changed for live consumers', () => {
    const listener = vi.fn()
    window.addEventListener('feature-flag-changed', listener)
    render(<FeatureFlags addToast={vi.fn()} />)
    fireEvent.click(screen.getByText('Advanced Panels'))
    expect(listener).toHaveBeenCalled()
    expect(listener.mock.calls[0][0].detail).toEqual({ id: 'advanced-panels', enabled: true })
    expect(localStorage.getItem('trading-sim-advanced-panels')).toBe('true')
    window.removeEventListener('feature-flag-changed', listener)
  })

  it('handles null addToast gracefully', () => {
    render(<FeatureFlags addToast={null} />)
    expect(screen.getByText('Feature Flags')).toBeInTheDocument()
  })
})
