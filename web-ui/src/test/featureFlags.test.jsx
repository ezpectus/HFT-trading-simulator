import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FeatureFlags from '../components/FeatureFlags'

vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: (key, defaultValue) => {
    const [value, setValue] = vi.requireActual('react').useState(defaultValue)
    return [value, setValue]
  },
}))

describe('FeatureFlags', () => {
  it('renders flags grouped by category', () => {
    render(<FeatureFlags addToast={vi.fn()} />)
    expect(screen.getByText('Feature Flags')).toBeInTheDocument()
    expect(screen.getByText('Mock Mode')).toBeInTheDocument()
    expect(screen.getByText('Sound Alerts')).toBeInTheDocument()
    expect(screen.getByText('ML Ensemble')).toBeInTheDocument()
    expect(screen.getByText('Circuit Breaker')).toBeInTheDocument()
  })

  it('toggles flag on click', () => {
    const addToast = vi.fn()
    render(<FeatureFlags addToast={addToast} />)
    fireEvent.click(screen.getByText('Mock Mode'))
    expect(addToast).toHaveBeenCalledWith('info', 'Mock Mode: enabled')
  })

  it('shows enabled count', () => {
    render(<FeatureFlags addToast={vi.fn()} />)
    expect(screen.getByText(/enabled/)).toBeInTheDocument()
  })

  it('handles null addToast gracefully', () => {
    render(<FeatureFlags addToast={null} />)
    expect(screen.getByText('Feature Flags')).toBeInTheDocument()
  })
})
